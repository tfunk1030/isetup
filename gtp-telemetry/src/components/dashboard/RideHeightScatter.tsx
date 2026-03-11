import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import { Ruler } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function RideHeightScatter({ analysis }: Props) {
  return (
    <Card title="Ride Heights at Speed (>200 km/h)" icon={<Ruler className="w-4 h-4" />}>
      <div style={{ height: 300 }}>
        <ResponsiveContainer>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} vertical={false} />
            <XAxis dataKey="pct" name="Track %" stroke={COLORS.textMuted} fontSize={11} domain={[0, 100]} />
            <YAxis name="RH (mm)" stroke={COLORS.textMuted} fontSize={11} domain={[-15, 60]} />
            <Tooltip
              contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, fontSize: 11 }}
              formatter={(v, name) => [`${Number(v).toFixed(1)} mm`, name]}
            />
            <ReferenceLine y={0} stroke={COLORS.red} strokeWidth={2} label={{ value: 'BOTTOMING', fill: COLORS.red, fontSize: 10 }} />
            <Scatter data={analysis.rideHeightData} dataKey="LR" fill={COLORS.LR} fillOpacity={0.3} r={1} name="LR" />
            <Scatter data={analysis.rideHeightData} dataKey="RR" fill={COLORS.RR} fillOpacity={0.3} r={1} name="RR" />
            <Legend />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4">
        <MetricRow label="Clean-Track Bottoming" value={analysis.bottoming.clean} />
        <MetricRow label="Kerb Bottoming" value={analysis.bottoming.kerb} />
      </div>
    </Card>
  );
}
