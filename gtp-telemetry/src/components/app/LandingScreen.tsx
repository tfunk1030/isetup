import {
  Flag,
  GitCompare,
  Radar,
  Sparkles,
  Stethoscope,
  Wrench,
} from 'lucide-react';
import { DropZone } from '../upload/DropZone';
import { useSessionStore } from '../../store/session-store';

const SUPPORTED_CARS = [
  'BMW M Hybrid V8',
  'Porsche 963',
  'Cadillac V-Series.R',
  'Acura ARX-06',
  'Ferrari 499P',
] as const;

const WORKFLOW_PILLARS = [
  {
    icon: Wrench,
    title: 'Current setup decoded',
    body: 'See grouped garage parameters in a readable command-center layout instead of raw YAML.',
  },
  {
    icon: Sparkles,
    title: 'Exact change queue',
    body: 'Promote deterministic setup changes first, then layer AI review as a second opinion.',
  },
  {
    icon: Radar,
    title: 'Minimal evidence',
    body: 'Keep telemetry compact and expandable so each chart supports a specific decision.',
  },
] as const;

export function LandingScreen() {
  const { setAppView } = useSessionStore();

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto grid max-w-[1600px] gap-8 px-6 py-10 xl:grid-cols-[minmax(0,1.15fr)_420px] xl:px-8">
        <section className="relative overflow-hidden rounded-[32px] border border-[var(--color-card-border)] bg-[linear-gradient(135deg,rgba(9,15,27,0.98),rgba(6,10,18,0.88))] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.32)] xl:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(250,180,57,0.14),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.10),transparent_38%)]" />
          <div className="relative">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <Flag className="h-6 w-6" />
              </div>
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-text-muted)]">
                  GTP Telemetry
                </p>
                <p className="text-sm text-[var(--color-text-dim)]">
                  Desktop-first setup optimizer for iRacing hypercars
                </p>
              </div>
            </div>

            <h1 className="max-w-[900px] font-display text-5xl font-semibold leading-[1.02] tracking-tight text-[var(--color-text)] xl:text-6xl">
              Build faster, clearer setup decisions without drowning in telemetry.
            </h1>
            <p className="mt-5 max-w-[760px] text-lg leading-8 text-[var(--color-text-dim)]">
              Upload an `.ibt` and land directly in a setup command center: readable current setup, exact parameter changes, AI review, and only the telemetry evidence needed to defend the recommendation.
            </p>

            <div className="mt-10 grid gap-4 xl:grid-cols-3">
              {WORKFLOW_PILLARS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-[var(--color-card-border)] bg-[rgba(11,18,31,0.78)] p-5 backdrop-blur"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface)] text-[var(--color-accent)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">{title}</h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-text-dim)]">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 rounded-2xl border border-[var(--color-card-border)] bg-[rgba(8,13,24,0.84)] p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Supported Cars
                </span>
                {SUPPORTED_CARS.map((car) => (
                  <span
                    key={car}
                    className="rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-dim)]"
                  >
                    {car}
                  </span>
                ))}
              </div>
              <div className="mt-5 grid gap-3 xl:grid-cols-3">
                <div className="command-note">
                  <strong>1. Decode</strong>
                  <span>Session setup grouped by aero, platform, dampers, tyres, and electronics.</span>
                </div>
                <div className="command-note">
                  <strong>2. Optimize</strong>
                  <span>Prioritized exact changes with clear current-to-target deltas and verify-after checks.</span>
                </div>
                <div className="command-note">
                  <strong>3. Defend</strong>
                  <span>Expandable telemetry evidence for tyres, platform, dynamics, and stint quality.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <DropZone />

          <div className="rounded-[28px] border border-[var(--color-card-border)] bg-[var(--color-card)] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
              Quick Tools
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--color-text-dim)]">
              Start with standalone tools when you want to diagnose a symptom or compare a setup before logging a fresh telemetry run.
            </p>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => setAppView('diagnose')}
                className="tool-launch"
              >
                <span className="tool-launch-icon">
                  <Stethoscope className="h-4 w-4" />
                </span>
                <span>
                  <strong>Diagnose handling</strong>
                  <small>Translate driver symptoms into likely setup moves.</small>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAppView('compare')}
                className="tool-launch"
              >
                <span className="tool-launch-icon">
                  <GitCompare className="h-4 w-4" />
                </span>
                <span>
                  <strong>Compare setups</strong>
                  <small>Read parameter deltas and handling impact without telemetry loaded.</small>
                </span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
