import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import { Wind } from 'lucide-react';
import { Card } from '../shared/Card';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function TyrePressuresChart({ analysis }: Props) {
  return (
    <Card title="Hot Pressures (PSI)" icon={<Wind className="w-4 h-4" />} span={2}>
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={analysis.tyrePressureData}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} vertical={false} />
            <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={(v) => `L${v}`} />
            <YAxis stroke={COLORS.textMuted} fontSize={11} domain={[20, 30]} />
            <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 4, fontSize: 12 }} />
            <Line dataKey="LF" stroke={COLORS.LF} strokeWidth={2} dot={{ r: 3 }} />
            <Line dataKey="RF" stroke={COLORS.RF} strokeWidth={2} dot={{ r: 3 }} />
            <Line dataKey="LR" stroke={COLORS.LR} strokeWidth={2} dot={{ r: 3 }} />
            <Line dataKey="RR" stroke={COLORS.RR} strokeWidth={2} dot={{ r: 3 }} />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
