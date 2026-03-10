import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { CircleDot } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { ANALYSIS, COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function TyreWearPanel({ analysis }: Props) {
  const { tyreWearData } = analysis;

  if (tyreWearData.length === 0) {
    return (
      <Card title="Tyre Wear" icon={<CircleDot className="w-4 h-4" />}>
        <p className="text-[var(--color-text-muted)] text-sm">
          No tyre wear data available (new tyres or data not recorded).
        </p>
      </Card>
    );
  }

  const chartData = tyreWearData.map((d) => ({
    lap: d.lap,
    LF: +d.LF.avg.toFixed(1),
    RF: +d.RF.avg.toFixed(1),
    LR: +d.LR.avg.toFixed(1),
    RR: +d.RR.avg.toFixed(1),
  }));

  const last = tyreWearData[tyreWearData.length - 1];

  return (
    <Card title="Tyre Wear (% remaining)" icon={<CircleDot className="w-4 h-4" />} span={2}>
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} vertical={false} />
            <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={(v) => `L${v}`} />
            <YAxis stroke={COLORS.textMuted} fontSize={11} domain={[80, 101]} />
            <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
            <Line dataKey="LF" stroke={COLORS.LF} strokeWidth={2} dot={{ r: 3 }} />
            <Line dataKey="RF" stroke={COLORS.RF} strokeWidth={2} dot={{ r: 3 }} />
            <Line dataKey="LR" stroke={COLORS.LR} strokeWidth={2} dot={{ r: 3 }} />
            <Line dataKey="RR" stroke={COLORS.RR} strokeWidth={2} dot={{ r: 3 }} />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {last && (
        <div className="grid grid-cols-2 gap-3 mt-4">
          {(['LF', 'RF', 'LR', 'RR'] as const).map((corner) => (
            <MetricRow
              key={corner}
              label={corner}
              value={last[corner].avg.toFixed(1)}
              unit="%"
              status={last[corner].avg < ANALYSIS.TYRE_WEAR_RISK_THRESHOLD ? 'HIGH' : 'OK'}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
