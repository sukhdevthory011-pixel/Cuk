// Real Satellite Coordinates of Central University of Karnataka (Kadaganchi, Aland Road, Kalaburagi - 585367)
// DMS: 17° 25′ 55″ N, 76° 40′ 16″ E
export const CUK_CAMPUS = {
  name: 'Central University of Karnataka (Kadaganchi)',
  department: 'Department of Chemistry, School of Chemical Sciences',
  lat: 17.4320,
  lon: 76.6710,
  defaultMaxDistanceKm: 0.5, // 500 meters
};

export interface CampusAnchorConfig {
  lat: number;
  lon: number;
  label: string;
  isCustomCalibrated: boolean;
}

const CUSTOM_ANCHOR_KEY = 'cuk_custom_geofence_anchor';

export const CUK_LOCATION_ANCHOR_PRESETS = [
  {
    id: 'science-block',
    room: 'Lecture Hall CH-101',
    label: 'CUK Science Block · Dept of Chemistry (17.4320°N, 76.6710°E)',
    lat: 17.4320,
    lon: 76.6710,
  },
  {
    id: 'cif-nmr',
    room: 'CIF NMR Block G-02',
    label: 'CIF & NMR Instrumentation Wing (17.4326°N, 76.6715°E)',
    lat: 17.4326,
    lon: 76.6715,
  },
  {
    id: 'wet-lab',
    room: 'Synthesis Wet Lab L-1',
    label: 'Organic Synthesis Wet Lab L-1 (17.4322°N, 76.6712°E)',
    lat: 17.4322,
    lon: 76.6712,
  },
  {
    id: 'seminar-hall',
    room: 'Seminar Room CH-204',
    label: 'Chemical Sciences Seminar Complex (17.4314°N, 76.6704°E)',
    lat: 17.4314,
    lon: 76.6704,
  },
  {
    id: 'library-auditorium',
    room: 'Central Library Auditorium',
    label: 'CUK Central Library Block (17.4335°N, 76.6725°E)',
    lat: 17.4335,
    lon: 76.6725,
  },
];

export function getActiveCampusAnchor(): CampusAnchorConfig {
  try {
    const saved = localStorage.getItem(CUSTOM_ANCHOR_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
        return {
          lat: parsed.lat,
          lon: parsed.lon,
          label: parsed.label || 'Calibrated Live Classroom GPS Anchor',
          isCustomCalibrated: true,
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return {
    lat: CUK_CAMPUS.lat,
    lon: CUK_CAMPUS.lon,
    label: 'CUK Kadaganchi Science Block (17.4320°N, 76.6710°E)',
    isCustomCalibrated: false,
  };
}

export function setCustomCampusAnchor(lat: number, lon: number, label = 'Calibrated Live Device GPS Anchor'): CampusAnchorConfig {
  const config: CampusAnchorConfig = {
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    label,
    isCustomCalibrated: true,
  };
  try {
    localStorage.setItem(CUSTOM_ANCHOR_KEY, JSON.stringify(config));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cuk-anchor-updated', { detail: config }));
    }
  } catch {
    // ignore storage errors
  }
  return config;
}

export function resetCampusAnchor(): CampusAnchorConfig {
  const defaultConfig: CampusAnchorConfig = {
    lat: CUK_CAMPUS.lat,
    lon: CUK_CAMPUS.lon,
    label: 'CUK Kadaganchi Science Block (17.4320°N, 76.6710°E)',
    isCustomCalibrated: false,
  };
  try {
    localStorage.removeItem(CUSTOM_ANCHOR_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cuk-anchor-updated', { detail: defaultConfig }));
    }
  } catch {
    // ignore
  }
  return defaultConfig;
}

/**
 * Calculate distance between two coordinates using Haversine formula (km)
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format distance in human friendly meters or kilometers
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${meters} m`;
  }
  return `${distanceKm.toFixed(2)} km`;
}

/**
 * Get standard daily code for CUK: CUK + Date of month (e.g., CUK20)
 */
export function getDailyCode(date: Date = new Date()): string {
  const day = date.getDate();
  return `CUK${day}`;
}

/**
 * Generate a unique verification hash for digital receipts
 */
export function generateVerificationHash(rollNo: string, subject: string, timestamp: string): string {
  const base = `${rollNo}-${subject}-${timestamp}-${Math.random().toString(36).substring(2, 7)}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  return `CUK-VER-${hex}`;
}

/**
 * Device fingerprint management to mitigate proxy marking on the same hardware
 */
export function getDeviceId(): string {
  const KEY = 'cuk_device_fingerprint_id';
  let devId = localStorage.getItem(KEY);
  if (!devId) {
    devId = 'DEV-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    localStorage.setItem(KEY, devId);
  }
  return devId;
}

export function checkDeviceProxy(rollNo: string, dateStr: string): { isProxy: boolean; existingRoll?: string } {
  const devId = getDeviceId();
  const bindingKey = `cuk_device_bound_${dateStr}`;
  const boundRoll = localStorage.getItem(bindingKey);

  if (boundRoll && boundRoll.toUpperCase() !== rollNo.toUpperCase()) {
    return { isProxy: true, existingRoll: boundRoll };
  }

  // Bind this device to current roll number for today
  if (!boundRoll) {
    localStorage.setItem(bindingKey, rollNo.toUpperCase());
  }

  return { isProxy: false };
}
