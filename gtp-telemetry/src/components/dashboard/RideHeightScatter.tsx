import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function RideHeightScatter({ analysis }: Props) {
  return (
    <Card title="Ride Heights at Speed (>200 km/h)" icon={'\u{1F4D0}'}>
      <div style={{ height: 300 }}>
        <ResponsiveContainer>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
            <XAxis dataKey="pct" name="Track %" stroke={COLORS.textMuted} fontSize={11} domain={[0, 100]} />
            <YAxis name="RH (mm)" stroke={COLORS.textMuted} fontSize={11} domain={[-15, 60]} />
            <Tooltip
              contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 11 }}
              formatter={(v, name) => [`${Number(v).toFixed(1)} mm`, name]}
            />
            <ReferenceLine y={0} stroke={COLORS.red} strokeWidth={2} label={{ value: 'BOTTOMING', fill: COLORS.red, fontSize: 10 }} />
            <Scatter data={analysis.rideHeightData} dataKey="LR" fill={COLORS.LR} fillOpacity={0.3} r={1} name="LR" />
            <Scatter data={analysis.rideHeightData} dataKey="RR" fill={COLORS.RR} fillOpacity={0.3} r={1} name="RR" />
            <Legend />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <MetricRow label="Clean-Track Bottoming" value={analysis.bottoming.clean} status={analysis.bottoming.clean === 0 ? 'SAFE' : 'RISK'} />
          <MetricRow label="Kerb Bottoming" value={analysis.bottoming.kerb} />
        </div>
        <div>
          <p className="text-[var(--color-text-muted)] text-[11px]">
            Kerb strikes are driving choices, not setup failures. Only clean-track bottoming indicates a platform problem.
          </p>
        </div>
      </div>
    </Card>
  );
}
