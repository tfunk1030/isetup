import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { SlidersHorizontal, BarChart3, FileText } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function RARBAnalysis({ analysis }: Props) {
  const rarb = analysis.rarb;

  if (!rarb || !rarb.available) {
    return null;
  }

  const totalChanges = rarb.perLapChanges.reduce((a, b) => a + b.changeCount, 0);

  return (
    <>
      <Card title="RARB Speed-Band Correlation" icon={<SlidersHorizontal className="w-4 h-4" />} span={2}>
        <div className="grid grid-cols-4 gap-3">
          {rarb.speedBands.map((band) => (
            <div key={band.range} className="p-4 bg-[var(--color-bg-subtle)] rounded-xl text-center">
              <div className="text-[var(--color-text-muted)] text-[11px] mb-1.5">{band.range}</div>
              <div className="text-[var(--color-text)] font-mono font-semibold text-lg">
                {band.sampleCount > 0 ? band.avgValue.toFixed(1) : 'N/A'}
              </div>
              {band.sampleCount > 0 && band.maxValue !== band.minValue && (
                <div className="text-[var(--color-text-muted)] text-[10px] mt-1">
                  {band.minValue.toFixed(1)} — {band.maxValue.toFixed(1)}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3">
          <MetricRow label="Total RARB changes" value={totalChanges} />
        </div>
      </Card>

      <Card title="RARB Changes Per Lap" icon={<BarChart3 className="w-4 h-4" />}>
        <div style={{ height: 150 }}>
          <ResponsiveContainer>
            <BarChart data={rarb.perLapChanges}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} vertical={false} />
              <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={(v) => `L${v}`} />
              <YAxis stroke={COLORS.textMuted} fontSize={11} />
              <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 4, fontSize: 12 }} />
              <Bar dataKey="changeCount" fill={COLORS.accent} radius={[6, 6, 0, 0]} name="Changes" fillOpacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {rarb.bestLapLog.length > 0 && (
        <Card title="Best Lap RARB Log" icon={<FileText className="w-4 h-4" />}>
          <div className="max-h-48 overflow-auto text-xs font-mono">
            <div className="grid grid-cols-4 gap-2 text-[var(--color-text-muted)] border-b border-[var(--color-card-border)] pb-2 mb-2">
              <span>Track %</span>
              <span>Speed</span>
              <span>From</span>
              <span>To</span>
            </div>
            {rarb.bestLapLog.map((e, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 text-[var(--color-text)] py-1 hover:bg-[var(--color-surface)] rounded transition-colors">
                <span>{e.pct.toFixed(1)}%</span>
                <span>{e.speed.toFixed(0)} km/h</span>
                <span>{e.fromValue.toFixed(1)}</span>
                <span>{e.toValue.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
