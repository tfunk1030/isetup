import { lazy, Suspense } from 'react';
import { CommandCenterHeader } from './components/app/CommandCenterHeader';
import { LandingScreen } from './components/app/LandingScreen';
import { useSessionStore } from './store/session-store';

const OptimizerWorkspace = lazy(() =>
  import('./components/optimizer/OptimizerWorkspace').then((m) => ({
    default: m.OptimizerWorkspace,
  }))
);
const DriverBriefing = lazy(() =>
  import('./components/optimizer/DriverBriefing').then((m) => ({
    default: m.DriverBriefing,
  }))
);
const ComparePanel = lazy(() =>
  import('./components/compare/ComparePanel').then((m) => ({ default: m.ComparePanel }))
);
function LoadingFallback() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card)] px-4 py-6">
      <div className="h-4 w-4 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
      <span className="text-sm text-[var(--color-text-muted)]">Loading workspace...</span>
    </div>
  );
}

function ShellBody() {
  const { analysis, appView, parsedData } = useSessionStore();

  if (!analysis && !parsedData && appView === 'landing') {
    return <LandingScreen />;
  }

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-8 xl:px-8">
      <Suspense fallback={<LoadingFallback />}>
        {appView === 'compare' && <ComparePanel />}
        {appView === 'optimizer' && parsedData && !analysis && <DriverBriefing />}
        {(appView === 'optimizer' || (!!analysis && appView === 'landing')) && analysis && (
          <OptimizerWorkspace analysis={analysis} />
        )}
      </Suspense>
    </main>
  );
}

export default function App() {
  const { analysis } = useSessionStore();

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <CommandCenterHeader analysis={analysis} />
      <ShellBody />
    </div>
  );
}
