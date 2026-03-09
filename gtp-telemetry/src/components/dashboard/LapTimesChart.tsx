import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function LapTimesChart({ analysis }: Props) {
  const { lapTimes, bestTime, validLaps } = analysis;
  const bestLap = lapTimes.find((l) => Math.abs(l.time - bestTime) < 0.01);
  const spread = Math.max(...lapTimes.map((l) => l.time)) - bestTime;

  return (
    <Card title="Lap Times" icon={'\u23F1\uFE0F'} span={2}>
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={lapTimes}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
            <XAxis
              dataKey="lap"
              stroke={COLORS.textMuted}
              fontSize={11}
              tickFormatter={(v) => `L${v}`}
            />
            <YAxis
              stroke={COLORS.textMuted}
              fontSize={11}
              domain={[Math.floor(bestTime - 2), Math.ceil(bestTime + 5)]}
            />
            <Tooltip
              contentStyle={{
                background: COLORS.card,
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="time" radius={[4, 4, 0, 0]}>
              {lapTimes.map((d, i) => (
                <Cell
                  key={i}
                  fill={Math.abs(d.time - bestTime) < 0.01 ? COLORS.accent : COLORS.blue}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-6 mt-3 flex-wrap">
        <MetricRow label="Best" value={bestLap?.timeStr} />
        <MetricRow label="Spread" value={spread.toFixed(2)} unit="s" />
        <MetricRow label="Valid Laps" value={validLaps.length} />
      </div>
    </Card>
  );
}
