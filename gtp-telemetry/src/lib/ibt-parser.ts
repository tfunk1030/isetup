// ═══════════════════════════════════════════════════════════════
// IBT BINARY PARSER (TypeScript port of parse_ibt.py V3)
// Verified against BMW M Hybrid V8 + Ferrari 499P IBT files
// ═══════════════════════════════════════════════════════════════

import yaml from 'js-yaml';
import type { ChannelVar, IBTParsed, SessionInfo } from './types';

function stripNullTerminator(value: string): string {
  const nullIdx = value.indexOf('\0');
  return nullIdx === -1 ? value : value.slice(0, nullIdx);
}

export function parseIBT(buffer: ArrayBuffer): IBTParsed {
  if (buffer.byteLength < 144) {
    throw new Error('File too small to be a valid IBT file (minimum 144 bytes for header)');
  }

  const view = new DataView(buffer);
  const decoder = new TextDecoder('latin1'); // iRacing uses latin-1, NOT UTF-8

  // Main header
  const tickRate = view.getInt32(8, true);
  const sessionInfoLen = view.getInt32(16, true);
  const sessionInfoOffset = view.getInt32(20, true);
  const numVars = view.getInt32(24, true);
  const varHeaderOffset = view.getInt32(28, true);
  const bufLen = view.getInt32(36, true);
  const bufOffset = view.getInt32(52, true);
  const recordCount = view.getInt32(140, true);

  // Validate header values
  if (tickRate <= 0 || tickRate > 1000) {
    throw new Error(`Invalid tick rate: ${tickRate}. Expected 60 Hz for iRacing.`);
  }
  if (numVars <= 0 || numVars > 1000) {
    throw new Error(`Invalid variable count: ${numVars}. Expected 200-302 for GTP cars.`);
  }
  if (recordCount <= 0) {
    throw new Error(`Invalid record count: ${recordCount}. File may be empty or corrupted.`);
  }
  if (sessionInfoLen < 0 || sessionInfoOffset < 0 || sessionInfoOffset + sessionInfoLen > buffer.byteLength) {
    throw new Error('Invalid session info block offsets. File may be corrupted.');
  }
  if (varHeaderOffset < 0 || varHeaderOffset + numVars * 144 > buffer.byteLength) {
    throw new Error('Invalid variable header table offsets. File may be corrupted.');
  }
  if (bufLen <= 0 || bufOffset < 0) {
    throw new Error('Invalid sample buffer header values. File may be corrupted.');
  }
  if (bufOffset + recordCount * bufLen > buffer.byteLength) {
    throw new Error('File appears truncated. Data buffer extends beyond file size.');
  }

  // Parse session info YAML
  let sessionInfo: SessionInfo = {};
  try {
    const siBytes = new Uint8Array(buffer, sessionInfoOffset, sessionInfoLen);
    const siStr = stripNullTerminator(decoder.decode(siBytes));
    sessionInfo = (yaml.load(siStr) as SessionInfo) || {};
  } catch (e) {
    console.warn('YAML parse warning, attempting simple parse:', e);
    // Fallback: try to extract what we can
    try {
      const siBytes = new Uint8Array(buffer, sessionInfoOffset, sessionInfoLen);
      const siStr = stripNullTerminator(decoder.decode(siBytes));
      sessionInfo = parseSimpleYAML(siStr);
    } catch {
      sessionInfo = {};
    }
  }

  // Parse variable headers (each is exactly 144 bytes)
  const vars: Record<string, ChannelVar> = {};
  for (let i = 0; i < numVars; i++) {
    const base = varHeaderOffset + i * 144;
    const vtype = view.getInt32(base, true);
    const voffset = view.getInt32(base + 4, true);
    const vcount = view.getInt32(base + 8, true);
    const nameBytes = new Uint8Array(buffer, base + 16, 32);
    const name = stripNullTerminator(decoder.decode(nameBytes));
    const descBytes = new Uint8Array(buffer, base + 48, 64);
    const desc = stripNullTerminator(decoder.decode(descBytes));
    const unitBytes = new Uint8Array(buffer, base + 112, 32);
    const unit = stripNullTerminator(decoder.decode(unitBytes));
    vars[name] = { type: vtype, offset: voffset, count: vcount, desc, unit };
  }

  // Channel reader
  function readChannel(name: string): Float64Array | null {
    if (!vars[name]) return null;
    const v = vars[name];
    const arr = new Float64Array(recordCount);
    for (let i = 0; i < recordCount; i++) {
      const off = bufOffset + i * bufLen + v.offset;
      if (v.type === 5) arr[i] = view.getFloat64(off, true);
      else if (v.type === 4) arr[i] = view.getFloat32(off, true);
      else if (v.type === 2) arr[i] = view.getInt32(off, true);
      else if (v.type === 3) arr[i] = view.getUint32(off, true);
      else if (v.type === 1) arr[i] = view.getUint8(off);
      else arr[i] = view.getUint8(off);
    }
    return arr;
  }

  return { sessionInfo, vars, readChannel, recordCount, tickRate };
}

// Fallback YAML parser for when js-yaml fails on iRacing's non-standard YAML
function parseSimpleYAML(str: string): SessionInfo {
  const result: Record<string, unknown> = {};
  const stack: { obj: Record<string, unknown> | unknown[]; indent: number }[] = [
    { obj: result, indent: -1 },
  ];
  const lines = str.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    const content = line.trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;
    if (content.startsWith('- ')) {
      const item = content.slice(2);
      if (Array.isArray(parent)) {
        if (item.includes(':')) {
          const obj: Record<string, unknown> = {};
          const [k, ...rest] = item.split(':');
          const val = rest.join(':').trim();
          if (val) obj[k.trim()] = parseVal(val);
          parent.push(obj);
          stack.push({ obj, indent });
        } else {
          parent.push(parseVal(item));
        }
      }
    } else if (content.includes(':')) {
      const colonIdx = content.indexOf(':');
      const key = content.slice(0, colonIdx).trim();
      const val = content.slice(colonIdx + 1).trim();
      if (val === '') {
        let nextLine = '';
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim()) {
            nextLine = lines[j].trim();
            break;
          }
        }
        if (nextLine.startsWith('- ')) {
          (parent as Record<string, unknown>)[key] = [];
          stack.push({ obj: (parent as Record<string, unknown>)[key] as unknown[], indent });
        } else {
          (parent as Record<string, unknown>)[key] = {};
          stack.push({
            obj: (parent as Record<string, unknown>)[key] as Record<string, unknown>,
            indent,
          });
        }
      } else {
        (parent as Record<string, unknown>)[key] = parseVal(val);
      }
    }
  }
  return result as SessionInfo;
}

function parseVal(s: string): string | number | boolean {
  if (!s) return '';
  s = s.replace(/^["']|["']$/g, '');
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = Number(s);
  if (!isNaN(n) && s !== '') return n;
  return s;
}

export function getAvailableChannels(parsed: IBTParsed): string[] {
  return Object.keys(parsed.vars);
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateIBT(buffer: ArrayBuffer): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (buffer.byteLength < 144) {
    return { valid: false, errors: ['File too small to be a valid IBT file'], warnings };
  }

  const view = new DataView(buffer);
  const tickRate = view.getInt32(8, true);
  const recordCount = view.getInt32(140, true);

  if (tickRate !== 60) {
    warnings.push(`Unexpected tick rate: ${tickRate} Hz (expected 60 Hz)`);
  }
  if (recordCount < 100) {
    warnings.push(`Very short session: only ${recordCount} samples (${(recordCount / 60).toFixed(1)}s)`);
  }
  if (buffer.byteLength > 200 * 1024 * 1024) {
    warnings.push('Large file (>200MB). Parsing may take a moment.');
  }

  return { valid: errors.length === 0, errors, warnings };
}
