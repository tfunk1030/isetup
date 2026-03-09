import { create } from 'zustand';
import { parseIBT, validateIBT } from '../lib/ibt-parser';
import { analyzeSession } from '../lib/analysis-engine';
import { detectCar } from '../lib/car-profiles';
import { detectTrack, getDefaultTrackProfile } from '../lib/track-profiles';
import type { SessionAnalysis, CarProfile, TrackProfile } from '../lib/types';

interface SessionStore {
  file: File | null;
  loading: boolean;
  progress: string;
  error: string | null;
  analysis: SessionAnalysis | null;
  carProfile: CarProfile | null;
  trackProfile: TrackProfile | null;
  activeTab: string;

  loadFile: (file: File) => Promise<void>;
  reset: () => void;
  setActiveTab: (tab: string) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  file: null,
  loading: false,
  progress: '',
  error: null,
  analysis: null,
  carProfile: null,
  trackProfile: null,
  activeTab: 'overview',

  loadFile: async (file: File) => {
    set({ loading: true, error: null, progress: 'Reading file...' });

    try {
      const buffer = await file.arrayBuffer();

      // Validate
      set({ progress: 'Validating IBT file...' });
      const validation = validateIBT(buffer);
      if (!validation.valid) {
        set({ loading: false, error: validation.errors.join('. ') });
        return;
      }

      // Parse
      set({ progress: 'Parsing IBT binary data...' });
      const parsed = parseIBT(buffer);

      // Detect car and track profiles
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

      // Analyze
      set({ progress: 'Running 14-item analysis checklist...' });
      const result = analyzeSession(parsed, carProfile || undefined, trackProfile, validation.warnings);

      if ('error' in result) {
        set({ loading: false, error: result.error });
        return;
      }

      set({
        file,
        loading: false,
        progress: '',
        analysis: result,
        carProfile,
        trackProfile,
      });
    } catch (err) {
      set({
        loading: false,
        error: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  reset: () => {
    set({
      file: null,
      loading: false,
      progress: '',
      error: null,
      analysis: null,
      carProfile: null,
      trackProfile: null,
      activeTab: 'overview',
    });
  },

  setActiveTab: (tab: string) => {
    set({ activeTab: tab });
  },
}));
