import { create } from 'zustand';
import { parseIBT, validateIBT } from '../lib/ibt-parser';
import { analyzeSession } from '../lib/analysis-engine';
import { detectCar } from '../lib/car-profiles';
import { detectTrack, getDefaultTrackProfile } from '../lib/track-profiles';
import {
  saveSession,
  getSessionHistory,
  attachRecommendations,
} from '../lib/session-memory';
import { compareSessionAnalyses } from '../lib/session-comparison';
import type { SessionAnalysis, CarProfile, TrackProfile, IBTParsed, AISetupBrief } from '../lib/types';
import type { AppView, EvidencePanelId, WorkspaceTab } from '../lib/ui-types';
import type { SessionRecord } from '../lib/session-memory';
import type { SessionComparisonResult } from '../lib/session-comparison';

interface SessionStore {
  file: File | null;
  loading: boolean;
  progress: string;
  error: string | null;
  parsedData: IBTParsed | null;
  validationWarnings: string[];
  analysis: SessionAnalysis | null;
  carProfile: CarProfile | null;
  trackProfile: TrackProfile | null;
  appView: AppView;
  openEvidenceId: EvidencePanelId | null;
  openEvidenceIds: Set<EvidencePanelId>;
  workspaceTab: WorkspaceTab;
  aiDriverFeedback: string;

  // ── Multi-session state ──
  /** Previous session record from localStorage (same car+track) */
  previousSession: SessionRecord | null;
  /** Full session history for current car+track combo */
  sessionHistory: SessionRecord[];
  /** Current session's record after being saved */
  currentSessionRecord: SessionRecord | null;
  /** Rich comparison between current and previous session */
  sessionComparison: SessionComparisonResult | null;
  /** How many sessions exist for this car+track combo */
  sessionCount: number;

  loadFile: (file: File) => Promise<void>;
  runAnalysis: () => void;
  reset: () => void;
  setAppView: (view: AppView) => void;
  setOpenEvidenceId: (id: EvidencePanelId | null) => void;
  toggleEvidencePanel: (id: EvidencePanelId) => void;
  collapseAllEvidence: () => void;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
  setAIDriverFeedback: (feedback: string) => void;
  attachAIBrief: (brief: AISetupBrief) => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  file: null,
  loading: false,
  progress: '',
  error: null,
  parsedData: null,
  validationWarnings: [],
  analysis: null,
  carProfile: null,
  trackProfile: null,
  appView: 'landing',
  openEvidenceId: null,
  openEvidenceIds: new Set(),
  workspaceTab: 'queue',
  aiDriverFeedback: '',

  // Multi-session defaults
  previousSession: null,
  sessionHistory: [],
  currentSessionRecord: null,
  sessionComparison: null,
  sessionCount: 0,

  loadFile: async (file: File) => {
    set({ loading: true, error: null, progress: 'Reading file...' });

    try {
      const buffer = await file.arrayBuffer();

      set({ progress: 'Validating IBT file...' });
      const validation = validateIBT(buffer);
      if (!validation.valid) {
        set({ loading: false, error: validation.errors.join('. ') });
        return;
      }

      set({ progress: 'Parsing IBT binary data...' });
      const parsed = parseIBT(buffer);

      set({ progress: 'Detecting car and track...' });
      const drivers = parsed.sessionInfo?.DriverInfo?.Drivers || [];
      const carIdx = parsed.sessionInfo?.DriverInfo?.DriverCarIdx;
      let carName = '';
      for (const d of drivers) {
        if (d.CarIdx === carIdx && !d.CarIsPaceCar) {
          carName = d.CarScreenName || '';
          break;
        }
      }
      if (!carName) {
        for (const d of drivers) {
          if (!d.CarIsPaceCar) {
            carName = d.CarScreenName || '';
            break;
          }
        }
      }

      const carProfile = detectCar(carName);
      const trackName = (parsed.sessionInfo?.WeekendInfo?.TrackDisplayName as string) || '';
      const trackLength = (parsed.sessionInfo?.WeekendInfo?.TrackLength as string) || '5.0';
      const trackProfile = detectTrack(trackName) || getDefaultTrackProfile(trackLength);

      // Load session history for this car+track combo
      const car = carProfile?.name || carName || 'Unknown Car';
      const track = trackProfile?.name || trackName || 'Unknown Track';
      const history = getSessionHistory(car, track);
      const prevSession = history.length > 0 ? history[history.length - 1] : null;

      set({
        file,
        loading: false,
        progress: '',
        parsedData: parsed,
        validationWarnings: validation.warnings,
        analysis: null,
        carProfile,
        trackProfile,
        appView: 'optimizer',
        openEvidenceId: null,
        openEvidenceIds: new Set(),
        workspaceTab: 'queue',
        aiDriverFeedback: '',
        // Multi-session state
        previousSession: prevSession,
        sessionHistory: history,
        currentSessionRecord: null,
        sessionComparison: null,
        sessionCount: history.length,
      });
    } catch (err) {
      set({
        loading: false,
        error: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  runAnalysis: () => {
    const { parsedData, carProfile, trackProfile, validationWarnings, previousSession } = get();
    if (!parsedData || !trackProfile) return;

    set({ loading: true, progress: 'Running 14-item analysis checklist...' });

    try {
      const result = analyzeSession(parsedData, carProfile || undefined, trackProfile, validationWarnings);

      if ('error' in result) {
        set({ loading: false, progress: '', error: result.error });
        return;
      }

      // Save to session memory (auto-validates previous session)
      set({ progress: 'Saving session to memory...' });
      const record = saveSession(result);

      // Build comparison if we have a previous session
      let comparison: SessionComparisonResult | null = null;
      if (previousSession) {
        try {
          comparison = compareSessionAnalyses(result, previousSession);
        } catch {
          // Comparison failed — not critical
        }
      }

      // Refresh history after saving
      const car = result.header.car;
      const track = result.header.track;
      const updatedHistory = getSessionHistory(car, track);

      set({
        loading: false,
        progress: '',
        analysis: result,
        openEvidenceId: null,
        openEvidenceIds: new Set(),
        workspaceTab: comparison ? 'sessions' : 'queue',
        // Multi-session state
        currentSessionRecord: record,
        sessionComparison: comparison,
        sessionHistory: updatedHistory,
        sessionCount: updatedHistory.length,
      });
    } catch (err) {
      set({
        loading: false,
        progress: '',
        error: `Analysis error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  reset: () => {
    set({
      file: null,
      loading: false,
      progress: '',
      error: null,
      parsedData: null,
      validationWarnings: [],
      analysis: null,
      carProfile: null,
      trackProfile: null,
      appView: 'landing',
      openEvidenceId: null,
      openEvidenceIds: new Set(),
      workspaceTab: 'queue',
      aiDriverFeedback: '',
      previousSession: null,
      sessionHistory: [],
      currentSessionRecord: null,
      sessionComparison: null,
      sessionCount: 0,
    });
  },

  setAppView: (view: AppView) => set({ appView: view }),


  setOpenEvidenceId: (id: EvidencePanelId | null) => set({ openEvidenceId: id }),

  toggleEvidencePanel: (id: EvidencePanelId) => {
    const current = new Set(get().openEvidenceIds);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    set({ openEvidenceIds: current, openEvidenceId: current.has(id) ? id : null });
  },

  collapseAllEvidence: () => set({ openEvidenceIds: new Set(), openEvidenceId: null }),

  setWorkspaceTab: (tab: WorkspaceTab) => set({ workspaceTab: tab }),

  setAIDriverFeedback: (feedback: string) => set({ aiDriverFeedback: feedback }),

  attachAIBrief: (brief: AISetupBrief) => {
    const { currentSessionRecord } = get();
    if (!currentSessionRecord) return;
    attachRecommendations(
      currentSessionRecord.id,
      currentSessionRecord.car,
      currentSessionRecord.track,
      brief,
    );
  },
}));
