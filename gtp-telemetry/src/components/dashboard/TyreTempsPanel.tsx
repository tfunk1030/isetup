import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import { Flame } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS, RECOMMENDATION, TYRE_TEMP } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function TyreTempsPanel({ analysis }: Props) {
  const { tyreTempData } = analysis;

  const chartData = tyreTempData.map((d) => ({
    lap: d.lap,
    LF: +((d.LF.O + d.LF.M + d.LF.I) / 3).toFixed(1),
    RF: +((d.RF.O + d.RF.M + d.RF.I) / 3).toFixed(1),
    LR: +((d.LR.O + d.LR.M + d.LR.I) / 3).toFixed(1),
    RR: +((d.RR.O + d.RR.M + d.RR.I) / 3).toFixed(1),
  }));

  const last = tyreTempData[tyreTempData.length - 1];

  return (
    <>
      <Card title="Surface Temperatures" icon={<Flame className="w-4 h-4" />} span={2}>
        <div style={{ height: 250 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} vertical={false} />
              <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={(v) => `L${v}`} />
              <YAxis stroke={COLORS.textMuted} fontSize={11} />
              <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 4, fontSize: 12 }} />
              <ReferenceLine y={TYRE_TEMP.OPERATING_TARGET} stroke={COLORS.green} strokeDasharray="5 5" label={{ value: '85\u00B0C', fill: COLORS.green, fontSize: 10 }} />
              <ReferenceLine y={TYRE_TEMP.HOT} stroke={COLORS.red} strokeDasharray="5 5" label={{ value: '105\u00B0C', fill: COLORS.red, fontSize: 10 }} />
              <Line dataKey="LF" stroke={COLORS.LF} strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="RF" stroke={COLORS.RF} strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="LR" stroke={COLORS.LR} strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="RR" stroke={COLORS.RR} strokeWidth={2} dot={{ r: 3 }} />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {last && (
        <Card title={`Contact Patch Shape (Lap ${last.lap})`} icon={<Flame className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {(['LF', 'RF', 'LR', 'RR'] as const).map((corner) => {
              const d = last[corner] as { O: number; M: number; I: number };
              const avg = (d.O + d.M + d.I) / 3;
              const midVsEdges = d.M - (d.O + d.I) / 2;
              const shape = midVsEdges > RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C
                ? 'Crown (high psi)'
                : midVsEdges < -RECOMMENDATION.TYRE_SHAPE_DELTA_WARN_C
                  ? 'Cup (low psi)'
                  : 'Good';
              return (
                <div key={corner} className="rounded-lg bg-[var(--color-bg-subtle)] p-3">
                  <p className="mb-1 text-xs font-semibold text-[var(--color-text)]">{corner}</p>
                  <MetricRow label="Avg" value={avg.toFixed(1)} unit={'\u00B0C'} status={avg < TYRE_TEMP.COLD ? 'COLD' : avg <= TYRE_TEMP.HOT ? 'OK' : 'HOT'} />
                  <MetricRow label="Shape" value={shape} />
                  <MetricRow label="Spread" value={(d.I - d.O).toFixed(1)} unit={'\u00B0C'} />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}
