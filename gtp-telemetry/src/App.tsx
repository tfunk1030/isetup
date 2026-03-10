import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, Stethoscope, GitCompare } from 'lucide-react';
import { useSessionStore } from './store/session-store';
import { DropZone } from './components/upload/DropZone';
import { SessionHeader } from './components/dashboard/SessionHeader';
import { TabBar } from './components/shared/TabBar';
import { TABS } from './lib/constants';
import { Card } from './components/shared/Card';
import { MetricRow } from './components/shared/MetricRow';
import {
  ClipboardList, Shield, Zap, SlidersHorizontal,
} from 'lucide-react';

const LapTimesChart = lazy(() =>
  import('./components/dashboard/LapTimesChart').then((m) => ({ default: m.LapTimesChart }))
);
const TyreTempsPanel = lazy(() =>
  import('./components/dashboard/TyreTempsPanel').then((m) => ({ default: m.TyreTempsPanel }))
);
const TyrePressuresChart = lazy(() =>
  import('./components/dashboard/TyrePressuresChart').then((m) => ({ default: m.TyrePressuresChart }))
);
const TyreWearPanel = lazy(() =>
  import('./components/dashboard/TyreWearPanel').then((m) => ({ default: m.TyreWearPanel }))
);
const RideHeightScatter = lazy(() =>
  import('./components/dashboard/RideHeightScatter').then((m) => ({ default: m.RideHeightScatter }))
);
const ShockVelocityPanel = lazy(() =>
  import('./components/dashboard/ShockVelocityPanel').then((m) => ({ default: m.ShockVelocityPanel }))
);
const SplitterAnalysis = lazy(() =>
  import('./components/dashboard/SplitterAnalysis').then((m) => ({ default: m.SplitterAnalysis }))
);
const GForceScatter = lazy(() =>
  import('./components/dashboard/GForceScatter').then((m) => ({ default: m.GForceScatter }))
);
const FuelPanel = lazy(() =>
  import('./components/dashboard/FuelPanel').then((m) => ({ default: m.FuelPanel }))
);
const DriverAidsPanel = lazy(() =>
  import('./components/dashboard/DriverAidsPanel').then((m) => ({ default: m.DriverAidsPanel }))
);
const ConditioningTrend = lazy(() =>
  import('./components/dashboard/ConditioningTrend').then((m) => ({ default: m.ConditioningTrend }))
);
const EngineTempsPanel = lazy(() =>
  import('./components/dashboard/EngineTempsPanel').then((m) => ({ default: m.EngineTempsPanel }))
);
const RARBAnalysis = lazy(() =>
  import('./components/dashboard/RARBAnalysis').then((m) => ({ default: m.RARBAnalysis }))
);
const SetupDump = lazy(() =>
  import('./components/dashboard/SetupDump').then((m) => ({ default: m.SetupDump }))
);
const SetupRecommendationsPanel = lazy(() =>
  import('./components/dashboard/SetupRecommendationsPanel').then((m) => ({ default: m.SetupRecommendationsPanel }))
);
const AIRecommendationAssistant = lazy(() =>
  import('./components/dashboard/AIRecommendationAssistant').then((m) => ({ default: m.AIRecommendationAssistant }))
);
const DiagnosePanel = lazy(() =>
  import('./components/diagnose/DiagnosePanel').then((m) => ({ default: m.DiagnosePanel }))
);
const ComparePanel = lazy(() =>
  import('./components/compare/ComparePanel').then((m) => ({ default: m.ComparePanel }))
);

function LoadingFallback() {
  return (
    <div className="flex items-center gap-3 px-4 py-6">
      <div className="w-4 h-4 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
      <span className="text-sm text-[var(--color-text-muted)]">Loading analysis modules...</span>
    </div>
  );
}

function Dashboard() {
  const { analysis, activeTab, setActiveTab } = useSessionStore();
  if (!analysis) return null;

  const a = analysis;

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <SessionHeader />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="p-6 max-w-[1440px] mx-auto">
        <Suspense fallback={<LoadingFallback />}>
          {activeTab === 'overview' && (
            <div
              id="tabpanel-overview"
              role="tabpanel"
              aria-labelledby="tab-overview"
              tabIndex={0}
              className="space-y-6"
            >
              <SetupRecommendationsPanel analysis={a} />
              <AIRecommendationAssistant analysis={a} />
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
                <LapTimesChart analysis={a} />

                <Card title="Session" icon={<ClipboardList className="w-4 h-4" />}>
                  <MetricRow label="Air Temp" value={a.header.airTemp} />
                  <MetricRow label="Track Temp" value={a.header.trackTemp} />
                  <MetricRow label="Fuel Start" value={a.fuel.start?.toFixed(1)} unit="L" />
                  <MetricRow label="Fuel/Lap" value={a.fuel.perLap?.toFixed(2)} unit="L" />
                  <MetricRow label="Range" value={`~${Math.floor(a.fuel.range)}`} unit="laps" />
                </Card>

                <Card title="Platform Safety" icon={<Shield className="w-4 h-4" />}>
                  <MetricRow label="Clean Bottoming" value={a.bottoming.clean} status={a.bottoming.clean === 0 ? 'SAFE' : 'RISK'} />
                  <MetricRow label="Kerb Bottoming" value={a.bottoming.kerb} status="OK" />
                  {a.shockVelStats.RR && (
                    <>
                      <MetricRow label="RR Peak Vel" value={a.shockVelStats.RR.peak.toFixed(0)} unit="mm/s" status={a.shockVelStats.RR.peak > 700 ? 'HOT' : 'OK'} />
                      <MetricRow label="RF Peak Vel" value={(a.shockVelStats.RF?.peak || 0).toFixed(0)} unit="mm/s" status={(a.shockVelStats.RF?.peak || 0) > 700 ? 'HOT' : 'OK'} />
                    </>
                  )}
                </Card>

                <Card title="G-Force Envelope" icon={<Zap className="w-4 h-4" />}>
                  <MetricRow label="Peak Lateral" value={a.peakLatG.toFixed(2)} unit="g" />
                  <MetricRow label="Peak Braking" value={a.peakBrakeG.toFixed(2)} unit="g" />
                  <MetricRow label="Peak Accel" value={a.peakAccelG.toFixed(2)} unit="g" />
                </Card>

                <Card title="Driver Aids" icon={<SlidersHorizontal className="w-4 h-4" />}>
                  {Object.entries(a.aids).map(([name, d]) => (
                    <MetricRow key={name} label={name} value={d.avg.toFixed(1)} status={d.constant ? 'OK' : 'HIGH'} />
                  ))}
                </Card>

                <ConditioningTrend analysis={a} />
              </div>
            </div>
          )}

          {activeTab === 'tyres' && (
            <div
              id="tabpanel-tyres"
              role="tabpanel"
              aria-labelledby="tab-tyres"
              tabIndex={0}
              className="grid gap-5"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}
            >
              <TyreTempsPanel analysis={a} />
              <TyrePressuresChart analysis={a} />
              <TyreWearPanel analysis={a} />
            </div>
          )}

          {activeTab === 'platform' && (
            <div
              id="tabpanel-platform"
              role="tabpanel"
              aria-labelledby="tab-platform"
              tabIndex={0}
              className="grid gap-5"
              style={{ gridTemplateColumns: '1fr' }}
            >
              <RideHeightScatter analysis={a} />
              <SplitterAnalysis analysis={a} />
              <ShockVelocityPanel analysis={a} />
            </div>
          )}

          {activeTab === 'dynamics' && (
            <div
              id="tabpanel-dynamics"
              role="tabpanel"
              aria-labelledby="tab-dynamics"
              tabIndex={0}
              className="grid gap-5"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}
            >
              <GForceScatter analysis={a} />
              <DriverAidsPanel analysis={a} />
              <RARBAnalysis analysis={a} />
              <EngineTempsPanel analysis={a} />
              <FuelPanel analysis={a} />
            </div>
          )}

          {activeTab === 'diagnose' && (
            <div
              id="tabpanel-diagnose"
              role="tabpanel"
              aria-labelledby="tab-diagnose"
              tabIndex={0}
            >
              <DiagnosePanel />
            </div>
          )}

          {activeTab === 'compare' && (
            <div
              id="tabpanel-compare"
              role="tabpanel"
              aria-labelledby="tab-compare"
              tabIndex={0}
            >
              <ComparePanel />
            </div>
          )}

          {activeTab === 'setup' && (
            <div
              id="tabpanel-setup"
              role="tabpanel"
              aria-labelledby="tab-setup"
              tabIndex={0}
            >
              <SetupDump analysis={a} />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}

function StandaloneTools() {
  const [tool, setTool] = useState<'none' | 'diagnose' | 'compare'>('none');

  if (tool === 'diagnose') {
    return (
      <div className="min-h-screen p-6 max-w-[1440px] mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setTool('none')}
            className="btn-secondary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <h2 className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-[var(--color-accent)]" />
            Standalone Diagnose
          </h2>
        </div>
        <Suspense fallback={<LoadingFallback />}>
          <DiagnosePanel />
        </Suspense>
      </div>
    );
  }

  if (tool === 'compare') {
    return (
      <div className="min-h-screen p-6 max-w-[1440px] mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setTool('none')}
            className="btn-secondary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <h2 className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-[var(--color-accent)]" />
            Standalone Compare
          </h2>
        </div>
        <Suspense fallback={<LoadingFallback />}>
          <ComparePanel />
        </Suspense>
      </div>
    );
  }

  return (
    <div>
      <DropZone />
      <div className="max-w-[600px] mx-auto px-6 pb-12 -mt-4">
        <p className="text-xs text-[var(--color-text-muted)] text-center mb-4">
          Or use setup tools without telemetry:
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setTool('diagnose')}
            className="btn-secondary inline-flex items-center gap-2 text-xs px-5 py-2.5 rounded-xl"
          >
            <Stethoscope className="w-4 h-4" />
            Diagnose Handling
          </button>
          <button
            onClick={() => setTool('compare')}
            className="btn-secondary inline-flex items-center gap-2 text-xs px-5 py-2.5 rounded-xl"
          >
            <GitCompare className="w-4 h-4" />
            Compare Setups
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { analysis } = useSessionStore();

  if (!analysis) {
    return <StandaloneTools />;
  }

  return <Dashboard />;
}
