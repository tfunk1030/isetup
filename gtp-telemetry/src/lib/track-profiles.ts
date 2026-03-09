import type { TrackProfile } from './types';

import sebring from '../data/tracks/sebring.json';
import daytona from '../data/tracks/daytona.json';
import cota from '../data/tracks/cota.json';
import watkinsGlen from '../data/tracks/watkins-glen.json';
import roadAtlanta from '../data/tracks/road-atlanta.json';
import roadAmerica from '../data/tracks/road-america.json';
import spa from '../data/tracks/spa.json';
import leMans from '../data/tracks/le-mans.json';
import indianapolis from '../data/tracks/indianapolis-gp.json';
import lagunaSeca from '../data/tracks/laguna-seca.json';
import monza from '../data/tracks/monza.json';
import nurburgring from '../data/tracks/nurburgring-gp.json';
import imola from '../data/tracks/imola.json';
import suzuka from '../data/tracks/suzuka.json';
import bathurst from '../data/tracks/bathurst.json';

const ALL_TRACKS: TrackProfile[] = [
  sebring, daytona, cota, watkinsGlen, roadAtlanta, roadAmerica,
  spa, leMans, indianapolis, lagunaSeca, monza, nurburgring,
  imola, suzuka, bathurst,
] as TrackProfile[];

export function detectTrack(trackDisplayName: string): TrackProfile | null {
  if (!trackDisplayName) return null;
  const lower = trackDisplayName.toLowerCase();
  for (const track of ALL_TRACKS) {
    for (const match of track.displayNameMatch) {
      if (lower.includes(match.toLowerCase())) return track;
    }
  }
  return null;
}

export function getDefaultTrackProfile(trackLength: string): TrackProfile {
  const len = parseFloat(trackLength) || 5.0;
  const minLap = len > 10 ? 150 : len > 3 ? 80 : 40;
  const maxLap = len > 10 ? 300 : len > 3 ? 160 : 90;

  return {
    id: 'unknown',
    name: 'Unknown Track',
    displayNameMatch: [],
    length_km: len,
    type: 'unknown',
    kerbZones: [],
    validLapWindow: [minLap, maxLap],
    setupFocus: '',
    mandatoryGearStack: null,
  };
}

export function getAllTracks(): TrackProfile[] {
  return ALL_TRACKS;
}
