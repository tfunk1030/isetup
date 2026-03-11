import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { RulerIcon } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function SplitterAnalysis({ analysis }: Props) {
  const s = analysis.splitter;

  if (!s) {
    return null;
  }

  return (
    <Card title="Splitter Ride Height (CFSRrideHeight)" icon={<RulerIcon className="w-4 h-4" />}>
      <div style={{ height: 250 }}>
        <ResponsiveContainer>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} vertical={false} />
            <XAxis dataKey="pct" name="Track %" stroke={COLORS.textMuted} fontSize={11} domain={[0, 100]} />
            <YAxis dataKey="height" name="Height (mm)" stroke={COLORS.textMuted} fontSize={11} />
            <Tooltip
              contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, fontSize: 11 }}
              formatter={(v, name) => [`${Number(v).toFixed(1)} mm`, name]}
            />
            <ReferenceLine y={0} stroke={COLORS.red} strokeWidth={2} label={{ value: 'SCRAPING', fill: COLORS.red, fontSize: 10 }} />
            <Scatter data={s.samples} fill={COLORS.purple} fillOpacity={0.3} r={1} name="Splitter RH" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-4 mt-4">
        <MetricRow label="Min" value={s.minHeight.toFixed(1)} unit="mm" />
        <MetricRow label="Avg" value={s.avgHeight.toFixed(1)} unit="mm" />
        <MetricRow label="Scraping Events" value={s.bottomingCount} />
      </div>
    </Card>
  );
}
