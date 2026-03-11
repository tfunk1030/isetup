import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import { Thermometer } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function EngineTempsPanel({ analysis }: Props) {
  const { engineTemps } = analysis;

  if (engineTemps.length === 0) {
    return (
      <Card title="Engine Temps" icon={<Thermometer className="w-4 h-4" />}>
        <p className="text-[var(--color-text-muted)] text-sm">
          Engine temperature channels not available.
        </p>
      </Card>
    );
  }

  const lastLap = engineTemps[engineTemps.length - 1];

  return (
    <Card title="Engine Temps" icon={<Thermometer className="w-4 h-4" />} span={2}>
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={engineTemps}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} vertical={false} />
            <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={(v) => `L${v}`} />
            <YAxis stroke={COLORS.textMuted} fontSize={11} />
            <Tooltip contentStyle={{ background: COLORS.surface, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 4, fontSize: 12 }} />
            <Line dataKey="waterTemp" stroke={COLORS.blue} strokeWidth={2} dot={{ r: 3 }} name="Water" />
            <Line dataKey="oilTemp" stroke={COLORS.accent} strokeWidth={2} dot={{ r: 3 }} name="Oil" />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <MetricRow
          label="Water (last lap)"
          value={lastLap.waterTemp.toFixed(1)}
          unit={'\u00B0C'}
        />
        <MetricRow
          label="Oil (last lap)"
          value={lastLap.oilTemp.toFixed(1)}
          unit={'\u00B0C'}
        />
      </div>
    </Card>
  );
}
