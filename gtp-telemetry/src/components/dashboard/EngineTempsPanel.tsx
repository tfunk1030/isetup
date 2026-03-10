import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import { Thermometer } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS, ENGINE_TEMP } from '../../lib/constants';
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
  const maxWater = Math.max(...engineTemps.map((d) => d.waterTemp));
  const maxOil = Math.max(...engineTemps.map((d) => d.oilTemp));

  return (
    <Card title="Engine Temps" icon={<Thermometer className="w-4 h-4" />} span={2}>
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={engineTemps}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} vertical={false} />
            <XAxis dataKey="lap" stroke={COLORS.textMuted} fontSize={11} tickFormatter={(v) => `L${v}`} />
            <YAxis stroke={COLORS.textMuted} fontSize={11} />
            <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
            <ReferenceLine y={ENGINE_TEMP.WATER_WARNING} stroke={COLORS.red} strokeDasharray="5 5" label={{ value: `${ENGINE_TEMP.WATER_WARNING}\u00B0C`, fill: COLORS.red, fontSize: 10 }} />
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
          status={maxWater > ENGINE_TEMP.WATER_WARNING ? 'HOT' : 'OK'}
        />
        <MetricRow
          label="Oil (last lap)"
          value={lastLap.oilTemp.toFixed(1)}
          unit={'\u00B0C'}
          status={maxOil > ENGINE_TEMP.OIL_WARNING ? 'HOT' : 'OK'}
        />
      </div>
    </Card>
  );
}
