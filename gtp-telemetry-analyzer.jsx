import { useState, useCallback, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, BarChart, Bar, Cell, ReferenceLine, Area, AreaChart, Legend } from "recharts";

// ═══════════════════════════════════════════════════════════════
// IBT BINARY PARSER (JavaScript port of parse_ibt.py V3)
// Verified against BMW M Hybrid V8 + Ferrari 499P IBT files
// ═══════════════════════════════════════════════════════════════

const TYPE_MAP = {
  0: { name: "char", size: 1 },
  1: { name: "bool", size: 1 },
  2: { name: "int32", size: 4 },
  3: { name: "uint32", size: 4 },
  4: { name: "float32", size: 4 },
  5: { name: "float64", size: 8 },
};

function parseIBT(buffer) {
  const view = new DataView(buffer);
  const decoder = new TextDecoder("latin1");

  // Main header
  const tickRate = view.getInt32(8, true);
  const sessionInfoLen = view.getInt32(16, true);
  const sessionInfoOffset = view.getInt32(20, true);
  const numVars = view.getInt32(24, true);
  const varHeaderOffset = view.getInt32(28, true);
  const bufLen = view.getInt32(36, true);
  const bufOffset = view.getInt32(52, true);
  const recordCount = view.getInt32(140, true);

  // Parse session info YAML
  const siBytes = new Uint8Array(buffer, sessionInfoOffset, sessionInfoLen);
  let siStr = decoder.decode(siBytes).replace(/\x00+$/, "");
  const sessionInfo = parseSimpleYAML(siStr);

  // Parse variable headers
  const vars = {};
  for (let i = 0; i < numVars; i++) {
    const base = varHeaderOffset + i * 144;
    const vtype = view.getInt32(base, true);
    const voffset = view.getInt32(base + 4, true);
    const vcount = view.getInt32(base + 8, true);
    const nameBytes = new Uint8Array(buffer, base + 16, 32);
    const name = decoder.decode(nameBytes).replace(/\x00+$/, "");
    const descBytes = new Uint8Array(buffer, base + 48, 64);
    const desc = decoder.decode(descBytes).replace(/\x00+$/, "");
    const unitBytes = new Uint8Array(buffer, base + 112, 32);
    const unit = decoder.decode(unitBytes).replace(/\x00+$/, "");
    vars[name] = { type: vtype, offset: voffset, count: vcount, desc, unit };
  }

  // Channel reader
  function readChannel(name) {
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

// Simple YAML parser for iRacing session info
function parseSimpleYAML(str) {
  const result = {};
  const stack = [{ obj: result, indent: -1 }];
  const lines = str.split("\n");

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.search(/\S/);
    const content = line.trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;
    if (content.startsWith("- ")) {
      const item = content.slice(2);
      if (Array.isArray(parent)) {
        if (item.includes(":")) {
          const obj = {};
          const [k, ...rest] = item.split(":");
          const val = rest.join(":").trim();
          if (val) obj[k.trim()] = parseVal(val);
          parent.push(obj);
          stack.push({ obj, indent });
        } else {
          parent.push(parseVal(item));
        }
      }
    } else if (content.includes(":")) {
      const colonIdx = content.indexOf(":");
      const key = content.slice(0, colonIdx).trim();
      const val = content.slice(colonIdx + 1).trim();
      if (val === "") {
        // Check if next non-empty line starts with "- "
        const nextIdx = lines.indexOf(line) + 1;
        let nextLine = "";
        for (let j = nextIdx; j < lines.length; j++) {
          if (lines[j].trim()) { nextLine = lines[j].trim(); break; }
        }
        if (nextLine.startsWith("- ")) {
          parent[key] = [];
          stack.push({ obj: parent[key], indent });
        } else {
          parent[key] = {};
          stack.push({ obj: parent[key], indent });
        }
      } else {
        parent[key] = parseVal(val);
      }
    }
  }
  return result;
}

function parseVal(s) {
  if (!s) return "";
  s = s.replace(/^["']|["']$/g, "");
  if (s === "true") return true;
  if (s === "false") return false;
  const n = Number(s);
  if (!isNaN(n) && s !== "") return n;
  return s;
}

// ═══════════════════════════════════════════════════════════════
// ANALYSIS ENGINE (port of sebring_analysis_v4.py logic)
// ═══════════════════════════════════════════════════════════════

function analyzeSession(parsed) {
  const { sessionInfo, readChannel, recordCount, tickRate } = parsed;
  const si = sessionInfo;
  const wi = si?.WeekendInfo || {};
  const di = si?.DriverInfo || {};
  const cs = si?.CarSetup || {};

  // Find driver
  let driver = null;
  const drivers = di?.Drivers || [];
  const carIdx = di?.DriverCarIdx;
  for (const d of drivers) {
    if (d.CarIdx === carIdx && !d.CarIsPaceCar) { driver = d; break; }
  }
  if (!driver) {
    for (const d of drivers) { if (!d.CarIsPaceCar) { driver = d; break; } }
  }

  // Load channels
  const ch = {};
  const channelNames = [
    "SessionTime", "Lap", "LapDistPct", "Speed", "LatAccel", "LongAccel",
    "Throttle", "Brake", "SteeringWheelAngle", "Gear", "RPM", "FuelLevel",
    "WaterTemp", "OilTemp", "dcBrakeBias", "dcTractionControl", "dcTractionControl2",
    "dcABS", "dcAntiRollFront", "dcAntiRollRear",
    "LFtempL", "LFtempM", "LFtempR", "RFtempL", "RFtempM", "RFtempR",
    "LRtempL", "LRtempM", "LRtempR", "RRtempL", "RRtempM", "RRtempR",
    "LFpressure", "RFpressure", "LRpressure", "RRpressure",
    "LFwearL", "LFwearM", "LFwearR", "RFwearL", "RFwearM", "RFwearR",
    "LRwearL", "LRwearM", "LRwearR", "RRwearL", "RRwearM", "RRwearR",
    "LFrideHeight", "RFrideHeight", "LRrideHeight", "RRrideHeight",
    "CFSRrideHeight", "HFshockDefl",
    "LFshockDefl", "RFshockDefl", "LRshockDefl", "RRshockDefl",
  ];
  for (const n of channelNames) ch[n] = readChannel(n);

  if (!ch.Speed || !ch.Lap || !ch.LapDistPct) {
    return { error: "Missing critical channels (Speed, Lap, LapDistPct)" };
  }

  // Speed in kph
  const spd = ch.Speed.map(v => v * 3.6);

  // Detect laps
  const laps = {};
  for (let i = 0; i < recordCount; i++) {
    const l = Math.floor(ch.Lap[i]);
    if (!laps[l]) laps[l] = { samples: [], start: i };
    laps[l].samples.push(i);
    laps[l].end = i;
  }
  for (const l in laps) {
    const s = laps[l];
    s.duration = ch.SessionTime[s.end] - ch.SessionTime[s.start];
    s.maxSpeed = Math.max(...s.samples.map(i => spd[i]));
    s.count = s.samples.length;
  }

  // Detect car type for brake migration info
  const carName = driver?.CarScreenName || "";
  const hasBrakeMig = carName.includes("Cadillac") || carName.includes("Porsche") || carName.includes("Ferrari");
  const isBMW = carName.includes("BMW");
  const isFerrari = carName.includes("Ferrari");

  // Valid laps (reasonable duration)
  const trackLen = parseFloat(wi?.TrackLength) || 5.8;
  const minLap = trackLen > 10 ? 150 : trackLen > 3 ? 80 : 40;
  const maxLap = trackLen > 10 ? 300 : trackLen > 3 ? 160 : 90;
  const validLaps = Object.keys(laps).filter(l => {
    const d = laps[l].duration;
    return d > minLap && d < maxLap && laps[l].count > 100;
  }).map(Number).sort((a, b) => a - b);

  if (validLaps.length === 0) {
    return { error: "No valid laps detected. Check lap time thresholds." };
  }

  // Lap times
  const lapTimes = validLaps.map(l => ({
    lap: l,
    time: laps[l].duration,
    maxSpeed: laps[l].maxSpeed,
    timeStr: `${Math.floor(laps[l].duration / 60)}:${(laps[l].duration % 60).toFixed(2).padStart(5, "0")}`,
  }));
  const bestTime = Math.min(...lapTimes.map(l => l.time));

  // Helper: get indices for valid laps
  const validMask = new Uint8Array(recordCount);
  for (const l of validLaps) for (const i of laps[l].samples) validMask[i] = 1;
  const hiSpeedMask = new Uint8Array(recordCount);
  for (let i = 0; i < recordCount; i++) if (validMask[i] && spd[i] > 200) hiSpeedMask[i] = 1;

  // Tyre temperatures per lap (last 50%)
  const tyreTempData = validLaps.map(l => {
    const s = laps[l].samples;
    const late = s.slice(Math.floor(s.length / 2));
    const avg = (arr, idxs) => idxs.reduce((a, i) => a + arr[i], 0) / idxs.length;
    return {
      lap: l,
      LF: { O: avg(ch.LFtempL, late), M: avg(ch.LFtempM, late), I: avg(ch.LFtempR, late) },
      RF: { O: ch.RFtempR ? avg(ch.RFtempR, late) : 0, M: avg(ch.RFtempM, late), I: avg(ch.RFtempL, late) },
      LR: { O: avg(ch.LRtempL, late), M: avg(ch.LRtempM, late), I: avg(ch.LRtempR, late) },
      RR: { O: ch.RRtempR ? avg(ch.RRtempR, late) : 0, M: avg(ch.RRtempM, late), I: avg(ch.RRtempL, late) },
    };
  });

  // Tyre pressures per lap
  const tyrePressureData = validLaps.map(l => {
    const s = laps[l].samples;
    const avg = (arr, idxs) => arr ? idxs.reduce((a, i) => a + arr[i], 0) / idxs.length : 0;
    return {
      lap: l,
      LF: avg(ch.LFpressure, s) / 6.895,
      RF: avg(ch.RFpressure, s) / 6.895,
      LR: avg(ch.LRpressure, s) / 6.895,
      RR: avg(ch.RRpressure, s) / 6.895,
    };
  });

  // Ride heights at high speed
  const rideHeightData = [];
  for (let i = 0; i < recordCount; i++) {
    if (hiSpeedMask[i] && i % 3 === 0) { // Downsample for performance
      rideHeightData.push({
        pct: ch.LapDistPct[i] * 100,
        LF: ch.LFrideHeight[i] * 1000,
        RF: ch.RFrideHeight[i] * 1000,
        LR: ch.LRrideHeight[i] * 1000,
        RR: ch.RRrideHeight[i] * 1000,
        speed: spd[i],
      });
    }
  }

  // Bottoming events
  let cleanBottoming = 0, kerbBottoming = 0;
  const kerbZones = [[10, 15], [40, 47], [60, 65]]; // Sebring default
  for (let i = 0; i < recordCount; i++) {
    if (!hiSpeedMask[i]) continue;
    const rh = Math.min(
      ch.LFrideHeight[i], ch.RFrideHeight[i],
      ch.LRrideHeight[i], ch.RRrideHeight[i]
    ) * 1000;
    if (rh <= 0) {
      const pct = ch.LapDistPct[i] * 100;
      const isKerb = kerbZones.some(([a, b]) => pct >= a && pct <= b);
      if (isKerb) kerbBottoming++;
      else cleanBottoming++;
    }
  }

  // Shock velocities at high speed
  const dt = 1 / tickRate;
  const shockVelStats = {};
  for (const corner of ["LF", "RF", "LR", "RR"]) {
    const chName = `${corner}shockDefl`;
    if (!ch[chName]) continue;
    const vels = [];
    for (let i = 1; i < recordCount; i++) {
      if (!hiSpeedMask[i]) continue;
      vels.push(Math.abs((ch[chName][i] - ch[chName][i - 1]) * 1000 / dt));
    }
    vels.sort((a, b) => a - b);
    shockVelStats[corner] = {
      p95: vels[Math.floor(vels.length * 0.95)] || 0,
      p99: vels[Math.floor(vels.length * 0.99)] || 0,
      peak: vels[vels.length - 1] || 0,
    };
  }

  // G-force data (downsampled)
  const gForceData = [];
  for (let i = 0; i < recordCount; i++) {
    if (!validMask[i] || i % 6 !== 0) continue;
    gForceData.push({
      lat: ch.LatAccel[i] / 9.81,
      long: ch.LongAccel[i] / 9.81,
    });
  }
  const peakLatG = Math.max(...gForceData.map(d => Math.abs(d.lat)));
  const peakBrakeG = Math.min(...gForceData.map(d => d.long));
  const peakAccelG = Math.max(...gForceData.map(d => d.long));

  // Fuel
  const fuelStart = ch.FuelLevel[laps[validLaps[0]].start];
  const fuelEnd = ch.FuelLevel[laps[validLaps[validLaps.length - 1]].end];
  const fuelPerLap = validLaps.length > 0 ? (fuelStart - fuelEnd) / validLaps.length : 0;

  // Driver aids
  const aids = {};
  for (const [name, key] of [
    ["Brake Bias", "dcBrakeBias"], ["TC1", "dcTractionControl"],
    ["TC2", "dcTractionControl2"], ["ABS", "dcABS"],
    ["FARB", "dcAntiRollFront"], ["RARB", "dcAntiRollRear"]
  ]) {
    if (!ch[key]) continue;
    let min = Infinity, max = -Infinity, sum = 0, cnt = 0;
    for (let i = 0; i < recordCount; i++) {
      if (!validMask[i]) continue;
      const v = ch[key][i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      cnt++;
    }
    aids[name] = { avg: sum / cnt, min, max, constant: (max - min) < 0.5 };
  }

  // Conditioning trend
  let conditioning = null;
  if (validLaps.length >= 2) {
    const fl = validLaps[0], ll = validLaps[validLaps.length - 1];
    const corners = {};
    for (const [corner, tempL, tempM, tempR] of [
      ["LF", "LFtempL", "LFtempM", "LFtempR"],
      ["RF", "RFtempR", "RFtempM", "RFtempL"],
      ["LR", "LRtempL", "LRtempM", "LRtempR"],
      ["RR", "RRtempR", "RRtempM", "RRtempL"],
    ]) {
      const fLate = laps[fl].samples.slice(Math.floor(laps[fl].count / 2));
      const lLate = laps[ll].samples.slice(Math.floor(laps[ll].count / 2));
      const avgF = [tempL, tempM, tempR].reduce((a, c) => {
        if (!ch[c]) return a;
        return a + fLate.reduce((s, i) => s + ch[c][i], 0) / fLate.length;
      }, 0) / 3;
      const avgL = [tempL, tempM, tempR].reduce((a, c) => {
        if (!ch[c]) return a;
        return a + lLate.reduce((s, i) => s + ch[c][i], 0) / lLate.length;
      }, 0) / 3;
      const rate = (avgL - avgF) / (validLaps.length - 1);
      corners[corner] = { first: avgF, last: avgL, rate, lapsTo85: rate > 0 ? Math.max(0, Math.ceil((85 - avgL) / rate)) : 99 };
    }
    conditioning = corners;
  }

  // Flatten setup
  function flatSetup(obj, prefix = "") {
    const out = [];
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) out.push(...flatSetup(v, key));
      else out.push([key, v]);
    }
    return out;
  }

  return {
    header: {
      track: `${wi.TrackDisplayName || "?"} — ${wi.TrackConfigName || ""}`,
      car: driver?.CarScreenName || "Unknown",
      driver: driver?.UserName || "Unknown",
      airTemp: wi.TrackAirTemp || "?",
      trackTemp: wi.TrackSurfaceTemp || "?",
      duration: `${(recordCount / tickRate / 60).toFixed(1)} min`,
      samples: recordCount,
      hz: tickRate,
      channels: Object.keys(parsed.vars).length,
      hasBrakeMig,
      isBMW,
      isFerrari,
    },
    setup: flatSetup(cs),
    lapTimes,
    bestTime,
    tyreTempData,
    tyrePressureData,
    rideHeightData,
    bottoming: { clean: cleanBottoming, kerb: kerbBottoming },
    shockVelStats,
    gForceData,
    peakLatG,
    peakBrakeG,
    peakAccelG,
    fuel: { start: fuelStart, end: fuelEnd, perLap: fuelPerLap, range: fuelPerLap > 0 ? fuelEnd / fuelPerLap : 0 },
    aids,
    conditioning,
    validLaps,
  };
}

// ═══════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════

const COLORS = {
  bg: "#0a0e17",
  card: "#111827",
  cardBorder: "#1e293b",
  accent: "#f59e0b",
  accentDim: "#92400e",
  green: "#10b981",
  red: "#ef4444",
  blue: "#3b82f6",
  cyan: "#06b6d4",
  purple: "#8b5cf6",
  text: "#e2e8f0",
  textDim: "#94a3b8",
  textMuted: "#64748b",
  LF: "#3b82f6",
  RF: "#ef4444",
  LR: "#06b6d4",
  RR: "#f59e0b",
};

function StatusBadge({ status }) {
  const colors = { COLD: "#3b82f6", OK: "#10b981", HOT: "#ef4444", HIGH: "#f59e0b", SAFE: "#10b981", RISK: "#ef4444" };
  return (
    <span style={{ background: colors[status] || "#64748b", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
      {status}
    </span>
  );
}

function Card({ title, icon, children, span = 1 }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 12, padding: "20px", gridColumn: span > 1 ? `span ${span}` : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: COLORS.accent, textTransform: "uppercase", letterSpacing: 1 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function MetricRow({ label, value, unit, status }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${COLORS.cardBorder}` }}>
      <span style={{ color: COLORS.textDim, fontSize: 13 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{value}{unit && <span style={{ color: COLORS.textMuted, fontWeight: 400 }}> {unit}</span>}</span>
        {status && <StatusBadge status={status} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

export default function GTPAnalyzer() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showSetup, setShowSetup] = useState(false);
  const fileRef = useRef();

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseIBT(buffer);
      const result = analyzeSession(parsed);
      if (result.error) setError(result.error);
      else setAnalysis(result);
    } catch (err) {
      setError(`Parse error: ${err.message}`);
    }
    setLoading(false);
  }, []);

  if (!analysis) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 520 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏁</div>
          <h1 style={{ color: COLORS.text, fontSize: 32, fontWeight: 800, margin: "0 0 4px", letterSpacing: -1 }}>
            GTP <span style={{ color: COLORS.accent }}>Telemetry</span>
          </h1>
          <p style={{ color: COLORS.textMuted, fontSize: 14, margin: "0 0 32px" }}>
            iRacing Hypercar Setup Analysis — 14-Item Engineering Checklist
          </p>
          <label
            style={{ display: "inline-flex", alignItems: "center", gap: 10, background: COLORS.accent, color: "#000", padding: "14px 32px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "transform 0.15s", letterSpacing: 0.3 }}
            onMouseEnter={e => e.target.style.transform = "scale(1.03)"}
            onMouseLeave={e => e.target.style.transform = "scale(1)"}
          >
            {loading ? "Parsing..." : "Upload IBT File"}
            <input ref={fileRef} type="file" accept=".ibt" onChange={handleFile} style={{ display: "none" }} />
          </label>
          {error && <p style={{ color: COLORS.red, marginTop: 16, fontSize: 13 }}>{error}</p>}
          <p style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 24 }}>
            Drag an .ibt from Documents/iRacing/Telemetry/
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
            {["BMW M Hybrid V8", "Porsche 963", "Cadillac V-Series.R", "Acura ARX-06", "Ferrari 499P"].map(car => (
              <span key={car} style={{ color: COLORS.textMuted, fontSize: 11, padding: "4px 10px", border: `1px solid ${COLORS.cardBorder}`, borderRadius: 20 }}>{car}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const a = analysis;
  const tabs = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "tyres", label: "Tyres", icon: "🔥" },
    { id: "platform", label: "Aero Platform", icon: "📐" },
    { id: "dynamics", label: "Dynamics", icon: "⚡" },
    { id: "setup", label: "Setup", icon: "🔧" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "'DM Sans', system-ui, sans-serif", color: COLORS.text }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
      
      {/* Header */}
      <div style={{ background: COLORS.card, borderBottom: `1px solid ${COLORS.cardBorder}`, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            🏁 GTP <span style={{ color: COLORS.accent }}>Telemetry</span>
          </h1>
          <p style={{ margin: "2px 0 0", color: COLORS.textMuted, fontSize: 12 }}>
            {a.header.car} — {a.header.track}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: COLORS.textDim, padding: "4px 10px", background: COLORS.bg, borderRadius: 6 }}>
            {a.header.driver}
          </span>
          <span style={{ fontSize: 12, color: COLORS.textDim, padding: "4px 10px", background: COLORS.bg, borderRadius: 6 }}>
            {a.header.duration} • {a.header.hz}Hz • {a.header.channels}ch
          </span>
          <span style={{ fontSize: 12, padding: "4px 10px", background: a.header.hasBrakeMig ? COLORS.green + "22" : COLORS.red + "22", color: a.header.hasBrakeMig ? COLORS.green : COLORS.red, borderRadius: 6 }}>
            Migration: {a.header.hasBrakeMig ? "YES" : "NO"}
          </span>
          <label style={{ fontSize: 12, color: COLORS.accent, padding: "4px 10px", background: COLORS.accentDim + "33", borderRadius: 6, cursor: "pointer" }}>
            New IBT
            <input type="file" accept=".ibt" onChange={handleFile} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, background: COLORS.card, borderBottom: `1px solid ${COLORS.cardBorder}`, overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "12px 20px", border: "none", background: "transparent", color: activeTab === t.id ? COLORS.accent : COLORS.textMuted,
            borderBottom: activeTab === t.id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
            cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>
        
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            {/* Lap Times */}
            <Card title="Lap Times" icon="⏱️" span={2}>
              <div style={{ height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={a.lapTimes}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
                    <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={v => `L${v}`} />
                    <YAxis stroke={COLORS.textMuted} fontSize={11} domain={[Math.floor(a.bestTime - 2), Math.ceil(a.bestTime + 5)]} />
                    <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="time" radius={[4, 4, 0, 0]}>
                      {a.lapTimes.map((d, i) => (
                        <Cell key={i} fill={Math.abs(d.time - a.bestTime) < 0.01 ? COLORS.accent : COLORS.blue} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 12, flexWrap: "wrap" }}>
                <MetricRow label="Best" value={a.lapTimes.find(l => Math.abs(l.time - a.bestTime) < 0.01)?.timeStr} />
                <MetricRow label="Spread" value={(Math.max(...a.lapTimes.map(l => l.time)) - a.bestTime).toFixed(2)} unit="s" />
                <MetricRow label="Valid Laps" value={a.validLaps.length} />
              </div>
            </Card>

            {/* Session Summary */}
            <Card title="Session" icon="📋">
              <MetricRow label="Air Temp" value={a.header.airTemp} />
              <MetricRow label="Track Temp" value={a.header.trackTemp} />
              <MetricRow label="Fuel Start" value={a.fuel.start?.toFixed(1)} unit="L" />
              <MetricRow label="Fuel/Lap" value={a.fuel.perLap?.toFixed(2)} unit="L" />
              <MetricRow label="Range" value={`~${Math.floor(a.fuel.range)}`} unit="laps" />
            </Card>

            {/* Platform Safety */}
            <Card title="Platform Safety" icon="🛡️">
              <MetricRow label="Clean Bottoming" value={a.bottoming.clean} status={a.bottoming.clean === 0 ? "SAFE" : "RISK"} />
              <MetricRow label="Kerb Bottoming" value={a.bottoming.kerb} status="OK" />
              {a.shockVelStats.RR && (
                <>
                  <MetricRow label="RR Peak Vel" value={a.shockVelStats.RR.peak.toFixed(0)} unit="mm/s" status={a.shockVelStats.RR.peak > 700 ? "HOT" : "OK"} />
                  <MetricRow label="RF Peak Vel" value={(a.shockVelStats.RF?.peak || 0).toFixed(0)} unit="mm/s" status={(a.shockVelStats.RF?.peak || 0) > 700 ? "HOT" : "OK"} />
                </>
              )}
            </Card>

            {/* G-Force */}
            <Card title="G-Force Envelope" icon="⚡">
              <MetricRow label="Peak Lateral" value={a.peakLatG.toFixed(2)} unit="g" />
              <MetricRow label="Peak Braking" value={a.peakBrakeG.toFixed(2)} unit="g" />
              <MetricRow label="Peak Accel" value={a.peakAccelG.toFixed(2)} unit="g" />
            </Card>

            {/* Driver Aids */}
            <Card title="Driver Aids" icon="🎛️">
              {Object.entries(a.aids).map(([name, d]) => (
                <MetricRow key={name} label={name} value={d.avg.toFixed(1)} status={d.constant ? "OK" : "HIGH"} />
              ))}
            </Card>

            {/* Conditioning */}
            {a.conditioning && (
              <Card title="Tyre Conditioning" icon="🌡️">
                {Object.entries(a.conditioning).map(([corner, d]) => (
                  <MetricRow key={corner} label={corner} value={`${d.rate > 0 ? "+" : ""}${d.rate.toFixed(1)}°C/lap`} unit={d.lapsTo85 < 50 ? `${d.lapsTo85} to 85°C` : "—"} status={d.last > 85 ? "OK" : "COLD"} />
                ))}
              </Card>
            )}
          </div>
        )}

        {activeTab === "tyres" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            {/* Temp chart */}
            <Card title="Surface Temperatures" icon="🔥" span={2}>
              <div style={{ height: 250 }}>
                <ResponsiveContainer>
                  <LineChart data={a.tyreTempData.map(d => ({
                    lap: d.lap,
                    LF: ((d.LF.O + d.LF.M + d.LF.I) / 3).toFixed(1),
                    RF: ((d.RF.O + d.RF.M + d.RF.I) / 3).toFixed(1),
                    LR: ((d.LR.O + d.LR.M + d.LR.I) / 3).toFixed(1),
                    RR: ((d.RR.O + d.RR.M + d.RR.I) / 3).toFixed(1),
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
                    <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={v => `L${v}`} />
                    <YAxis stroke={COLORS.textMuted} fontSize={11} />
                    <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 12 }} />
                    <ReferenceLine y={85} stroke={COLORS.green} strokeDasharray="5 5" label={{ value: "85°C", fill: COLORS.green, fontSize: 10 }} />
                    <ReferenceLine y={105} stroke={COLORS.red} strokeDasharray="5 5" label={{ value: "105°C", fill: COLORS.red, fontSize: 10 }} />
                    <Line dataKey="LF" stroke={COLORS.LF} strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="RF" stroke={COLORS.RF} strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="LR" stroke={COLORS.LR} strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="RR" stroke={COLORS.RR} strokeWidth={2} dot={{ r: 3 }} />
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Per-corner detail */}
            {a.tyreTempData.length > 0 && (() => {
              const last = a.tyreTempData[a.tyreTempData.length - 1];
              return ["LF", "RF", "LR", "RR"].map(corner => {
                const d = last[corner];
                const avg = (d.O + d.M + d.I) / 3;
                const midVsEdges = d.M - (d.O + d.I) / 2;
                return (
                  <Card key={corner} title={`${corner} Detail (Lap ${last.lap})`} icon={avg < 70 ? "🔵" : avg <= 105 ? "🟢" : "🔴"}>
                    <MetricRow label="Outer" value={d.O.toFixed(1)} unit="°C" />
                    <MetricRow label="Middle" value={d.M.toFixed(1)} unit="°C" />
                    <MetricRow label="Inner" value={d.I.toFixed(1)} unit="°C" />
                    <MetricRow label="Average" value={avg.toFixed(1)} unit="°C" status={avg < 70 ? "COLD" : avg <= 105 ? "OK" : "HOT"} />
                    <MetricRow label="I-O Spread" value={(d.I - d.O).toFixed(1)} unit="°C" />
                    <MetricRow label="Shape" value={midVsEdges > 3 ? "Crown (high psi)" : midVsEdges < -3 ? "Cup (low psi)" : "Good"} />
                  </Card>
                );
              });
            })()}

            {/* Pressures */}
            <Card title="Hot Pressures (PSI)" icon="💨" span={2}>
              <div style={{ height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={a.tyrePressureData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
                    <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={v => `L${v}`} />
                    <YAxis stroke={COLORS.textMuted} fontSize={11} domain={[20, 30]} />
                    <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 12 }} />
                    <ReferenceLine y={24} stroke={COLORS.accent} strokeDasharray="5 5" label={{ value: "24 PSI", fill: COLORS.accent, fontSize: 10 }} />
                    <Line dataKey="LF" stroke={COLORS.LF} strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="RF" stroke={COLORS.RF} strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="LR" stroke={COLORS.LR} strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="RR" stroke={COLORS.RR} strokeWidth={2} dot={{ r: 3 }} />
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 8 }}>
                Min cold: 152 kPa (22.0 PSI). Hot pressures 25-27 PSI expected — sim constraint.
              </p>
            </Card>
          </div>
        )}

        {activeTab === "platform" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <Card title="Ride Heights at Speed (>200 km/h)" icon="📐">
              <div style={{ height: 300 }}>
                <ResponsiveContainer>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
                    <XAxis dataKey="pct" name="Track %" stroke={COLORS.textMuted} fontSize={11} domain={[0, 100]} />
                    <YAxis name="RH (mm)" stroke={COLORS.textMuted} fontSize={11} domain={[-15, 60]} />
                    <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 11 }} formatter={(v, name) => [`${v.toFixed(1)} mm`, name]} />
                    <ReferenceLine y={0} stroke={COLORS.red} strokeWidth={2} label={{ value: "BOTTOMING", fill: COLORS.red, fontSize: 10 }} />
                    <Scatter data={a.rideHeightData} dataKey="LR" fill={COLORS.LR} fillOpacity={0.3} r={1} name="LR" />
                    <Scatter data={a.rideHeightData} dataKey="RR" fill={COLORS.RR} fillOpacity={0.3} r={1} name="RR" />
                    <Legend />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <MetricRow label="Clean-Track Bottoming" value={a.bottoming.clean} status={a.bottoming.clean === 0 ? "SAFE" : "RISK"} />
                  <MetricRow label="Kerb Bottoming" value={a.bottoming.kerb} />
                </div>
                <div>
                  <p style={{ color: COLORS.textMuted, fontSize: 11, margin: 0 }}>
                    Kerb strikes are driving choices, not setup failures. Only clean-track bottoming indicates a platform problem.
                  </p>
                </div>
              </div>
            </Card>

            <Card title="Shock Velocity Analysis" icon="📈">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                {Object.entries(a.shockVelStats).map(([corner, d]) => (
                  <div key={corner} style={{ padding: 12, background: COLORS.bg, borderRadius: 8 }}>
                    <h4 style={{ margin: "0 0 8px", color: COLORS[corner] || COLORS.text, fontSize: 14 }}>{corner}</h4>
                    <MetricRow label="p95" value={d.p95.toFixed(0)} unit="mm/s" />
                    <MetricRow label="p99" value={d.p99.toFixed(0)} unit="mm/s" />
                    <MetricRow label="Peak" value={d.peak.toFixed(0)} unit="mm/s" status={d.peak > 700 ? "HOT" : d.peak > 500 ? "HIGH" : "OK"} />
                  </div>
                ))}
              </div>
              <p style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 12 }}>
                Penske: &lt;75 mm/s = low-speed damper regime. &gt;700 mm/s = extreme events → consider digressive HS comp slope.
              </p>
            </Card>
          </div>
        )}

        {activeTab === "dynamics" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 }}>
            <Card title="G-Force Scatter" icon="⚡">
              <div style={{ height: 350 }}>
                <ResponsiveContainer>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
                    <XAxis dataKey="lat" name="Lateral G" stroke={COLORS.textMuted} fontSize={11} domain={[-4, 4]} />
                    <YAxis dataKey="long" name="Long G" stroke={COLORS.textMuted} fontSize={11} domain={[-5, 2]} />
                    <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 11 }} formatter={(v) => `${v.toFixed(2)} g`} />
                    <Scatter data={a.gForceData} fill={COLORS.accent} fillOpacity={0.15} r={1} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
                <MetricRow label="Peak Lat" value={a.peakLatG.toFixed(2)} unit="g" />
                <MetricRow label="Peak Brake" value={a.peakBrakeG.toFixed(2)} unit="g" />
                <MetricRow label="Peak Accel" value={a.peakAccelG.toFixed(2)} unit="g" />
              </div>
            </Card>

            <Card title="Driver Aids" icon="🎛️">
              {Object.entries(a.aids).map(([name, d]) => (
                <div key={name} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: COLORS.textDim, fontSize: 13 }}>{name}</span>
                    <span style={{ fontSize: 12 }}>
                      {d.constant ? <StatusBadge status="OK" /> : <StatusBadge status="HIGH" />}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: COLORS.textMuted, fontSize: 11, width: 40 }}>{d.min.toFixed(1)}</span>
                    <div style={{ flex: 1, height: 6, background: COLORS.bg, borderRadius: 3, position: "relative" }}>
                      <div style={{ position: "absolute", left: "0%", right: `${100 - ((d.avg - d.min) / (d.max - d.min + 0.01)) * 100}%`, height: "100%", background: d.constant ? COLORS.green : COLORS.accent, borderRadius: 3 }} />
                    </div>
                    <span style={{ color: COLORS.textMuted, fontSize: 11, width: 40, textAlign: "right" }}>{d.max.toFixed(1)}</span>
                  </div>
                </div>
              ))}
              <p style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 16 }}>
                Changing aids = ⚠. If RARB changes correlate with speed bands (low blades in slow corners, high at speed), that's intentional live management.
              </p>
            </Card>
          </div>
        )}

        {activeTab === "setup" && (
          <Card title="Full Setup (from IBT Session Info)" icon="🔧">
            <button onClick={() => setShowSetup(!showSetup)} style={{ background: COLORS.accent, color: "#000", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
              {showSetup ? "Hide Setup" : "Show Full Setup"}
            </button>
            {showSetup && (
              <div style={{ maxHeight: 500, overflow: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.8 }}>
                {a.setup.map(([k, v], i) => (
                  <div key={i} style={{ display: "flex", borderBottom: `1px solid ${COLORS.cardBorder}`, padding: "2px 0" }}>
                    <span style={{ color: COLORS.textDim, minWidth: 340, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: COLORS.text, fontWeight: 600 }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
