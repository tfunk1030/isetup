import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Zap } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function GForceScatter({ analysis }: Props) {
  return (
    <Card title="G-Force Scatter" icon={<Zap className="w-4 h-4" />}>
      <div style={{ height: 350 }}>
        <ResponsiveContainer>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} vertical={false} />
            <XAxis dataKey="lat" name="Lateral G" stroke={COLORS.textMuted} fontSize={11} domain={[-4, 4]} />
            <YAxis dataKey="long" name="Long G" stroke={COLORS.textMuted} fontSize={11} domain={[-5, 2]} />
            <Tooltip
              contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, fontSize: 11 }}
              formatter={(v) => `${Number(v).toFixed(2)} g`}
            />
            <Scatter data={analysis.gForceData} fill={COLORS.accent} fillOpacity={0.15} r={1} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-6 mt-3">
        <MetricRow label="Peak Lat" value={analysis.peakLatG.toFixed(2)} unit="g" />
        <MetricRow label="Peak Brake" value={analysis.peakBrakeG.toFixed(2)} unit="g" />
        <MetricRow label="Peak Accel" value={analysis.peakAccelG.toFixed(2)} unit="g" />
      </div>
    </Card>
  );
}
