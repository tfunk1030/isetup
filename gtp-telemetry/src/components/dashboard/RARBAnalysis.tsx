import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
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
      <Card title="RARB Speed-Band Correlation" icon={'\u{1F39B}\uFE0F'} span={2}>
        <div className="grid grid-cols-4 gap-3">
          {rarb.speedBands.map((band) => (
            <div key={band.range} className="p-3 bg-[var(--color-bg)] rounded-lg text-center">
              <div className="text-[var(--color-text-muted)] text-[11px] mb-1">{band.range}</div>
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
        <MetricRow label="Total RARB changes" value={totalChanges} />
      </Card>

      <Card title="RARB Changes Per Lap" icon={'\u{1F4CA}'}>
        <div style={{ height: 150 }}>
          <ResponsiveContainer>
            <BarChart data={rarb.perLapChanges}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
              <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={(v) => `L${v}`} />
              <YAxis stroke={COLORS.textMuted} fontSize={11} />
              <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="changeCount" fill={COLORS.accent} radius={[4, 4, 0, 0]} name="Changes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {rarb.bestLapLog.length > 0 && (
        <Card title="Best Lap RARB Log" icon={'\u{1F4DD}'}>
          <div className="max-h-48 overflow-auto text-xs font-mono">
            <div className="grid grid-cols-4 gap-2 text-[var(--color-text-muted)] border-b border-[var(--color-card-border)] pb-1 mb-1">
              <span>Track %</span>
              <span>Speed</span>
              <span>From</span>
              <span>To</span>
            </div>
            {rarb.bestLapLog.map((e, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 text-[var(--color-text)] py-0.5">
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
