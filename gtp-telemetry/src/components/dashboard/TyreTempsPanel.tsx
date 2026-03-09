import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS, TYRE_TEMP } from '../../lib/constants';
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
      <Card title="Surface Temperatures" icon={'\u{1F525}'} span={2}>
        <div style={{ height: 250 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
              <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={(v) => `L${v}`} />
              <YAxis stroke={COLORS.textMuted} fontSize={11} />
              <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 12 }} />
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

      {last && ['LF', 'RF', 'LR', 'RR'].map((corner) => {
        const d = last[corner as keyof typeof last] as { O: number; M: number; I: number };
        const avg = (d.O + d.M + d.I) / 3;
        const midVsEdges = d.M - (d.O + d.I) / 2;
        const icon = avg < TYRE_TEMP.COLD ? '\u{1F535}' : avg <= TYRE_TEMP.HOT ? '\u{1F7E2}' : '\u{1F534}';

        return (
          <Card key={corner} title={`${corner} Detail (Lap ${last.lap})`} icon={icon}>
            <MetricRow label="Outer" value={d.O.toFixed(1)} unit={'\u00B0C'} />
            <MetricRow label="Middle" value={d.M.toFixed(1)} unit={'\u00B0C'} />
            <MetricRow label="Inner" value={d.I.toFixed(1)} unit={'\u00B0C'} />
            <MetricRow
              label="Average"
              value={avg.toFixed(1)}
              unit={'\u00B0C'}
              status={avg < TYRE_TEMP.COLD ? 'COLD' : avg <= TYRE_TEMP.HOT ? 'OK' : 'HOT'}
            />
            <MetricRow label="I-O Spread" value={(d.I - d.O).toFixed(1)} unit={'\u00B0C'} />
            <MetricRow
              label="Shape"
              value={midVsEdges > 3 ? 'Crown (high psi)' : midVsEdges < -3 ? 'Cup (low psi)' : 'Good'}
            />
          </Card>
        );
      })}
    </>
  );
}
