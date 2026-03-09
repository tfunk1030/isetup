import { useSessionStore } from './store/session-store';
import { DropZone } from './components/upload/DropZone';
import { SessionHeader } from './components/dashboard/SessionHeader';
import { TabBar } from './components/shared/TabBar';
import { TABS } from './lib/constants';
import { LapTimesChart } from './components/dashboard/LapTimesChart';
import { TyreTempsPanel } from './components/dashboard/TyreTempsPanel';
import { TyrePressuresChart } from './components/dashboard/TyrePressuresChart';
import { TyreWearPanel } from './components/dashboard/TyreWearPanel';
import { RideHeightScatter } from './components/dashboard/RideHeightScatter';
import { ShockVelocityPanel } from './components/dashboard/ShockVelocityPanel';
import { SplitterAnalysis } from './components/dashboard/SplitterAnalysis';
import { GForceScatter } from './components/dashboard/GForceScatter';
import { FuelPanel } from './components/dashboard/FuelPanel';
import { DriverAidsPanel } from './components/dashboard/DriverAidsPanel';
import { ConditioningTrend } from './components/dashboard/ConditioningTrend';
import { EngineTempsPanel } from './components/dashboard/EngineTempsPanel';
import { RARBAnalysis } from './components/dashboard/RARBAnalysis';
import { SetupDump } from './components/dashboard/SetupDump';
import { Card } from './components/shared/Card';
import { MetricRow } from './components/shared/MetricRow';

function Dashboard() {
  const { analysis, activeTab, setActiveTab } = useSessionStore();
  if (!analysis) return null;

  const a = analysis;

  return (
    <div className="min-h-screen">
      <SessionHeader />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="p-5 max-w-[1400px] mx-auto">
        {activeTab === 'overview' && (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <LapTimesChart analysis={a} />

            <Card title="Session" icon={'\u{1F4CB}'}>
              <MetricRow label="Air Temp" value={a.header.airTemp} />
              <MetricRow label="Track Temp" value={a.header.trackTemp} />
              <MetricRow label="Fuel Start" value={a.fuel.start?.toFixed(1)} unit="L" />
              <MetricRow label="Fuel/Lap" value={a.fuel.perLap?.toFixed(2)} unit="L" />
              <MetricRow label="Range" value={`~${Math.floor(a.fuel.range)}`} unit="laps" />
            </Card>

            <Card title="Platform Safety" icon={'\u{1F6E1}\uFE0F'}>
              <MetricRow label="Clean Bottoming" value={a.bottoming.clean} status={a.bottoming.clean === 0 ? 'SAFE' : 'RISK'} />
              <MetricRow label="Kerb Bottoming" value={a.bottoming.kerb} status="OK" />
              {a.shockVelStats.RR && (
                <>
                  <MetricRow label="RR Peak Vel" value={a.shockVelStats.RR.peak.toFixed(0)} unit="mm/s" status={a.shockVelStats.RR.peak > 700 ? 'HOT' : 'OK'} />
                  <MetricRow label="RF Peak Vel" value={(a.shockVelStats.RF?.peak || 0).toFixed(0)} unit="mm/s" status={(a.shockVelStats.RF?.peak || 0) > 700 ? 'HOT' : 'OK'} />
                </>
              )}
            </Card>

            <Card title="G-Force Envelope" icon={'\u26A1'}>
              <MetricRow label="Peak Lateral" value={a.peakLatG.toFixed(2)} unit="g" />
              <MetricRow label="Peak Braking" value={a.peakBrakeG.toFixed(2)} unit="g" />
              <MetricRow label="Peak Accel" value={a.peakAccelG.toFixed(2)} unit="g" />
            </Card>

            <Card title="Driver Aids" icon={'\u{1F39B}\uFE0F'}>
              {Object.entries(a.aids).map(([name, d]) => (
                <MetricRow key={name} label={name} value={d.avg.toFixed(1)} status={d.constant ? 'OK' : 'HIGH'} />
              ))}
            </Card>

            <ConditioningTrend analysis={a} />
          </div>
        )}

        {activeTab === 'tyres' && (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <TyreTempsPanel analysis={a} />
            <TyrePressuresChart analysis={a} />
            <TyreWearPanel analysis={a} />
          </div>
        )}

        {activeTab === 'platform' && (
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr' }}>
            <RideHeightScatter analysis={a} />
            <SplitterAnalysis analysis={a} />
            <ShockVelocityPanel analysis={a} />
          </div>
        )}

        {activeTab === 'dynamics' && (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
            <GForceScatter analysis={a} />
            <DriverAidsPanel analysis={a} />
            <RARBAnalysis analysis={a} />
            <EngineTempsPanel analysis={a} />
            <FuelPanel analysis={a} />
          </div>
        )}

        {activeTab === 'setup' && (
          <SetupDump analysis={a} />
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { analysis } = useSessionStore();

  if (!analysis) {
    return <DropZone />;
  }

  return <Dashboard />;
}
