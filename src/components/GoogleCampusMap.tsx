import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  AlertCircle,
  Layers,
  Compass,
  CheckCircle2,
  Sparkles,
  Building2,
  FlaskConical,
  Radio,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { GeofenceConfig } from '../types/attendance';

interface GoogleCampusMapProps {
  geofence: GeofenceConfig;
  userCoords?: { lat: number; lng: number } | null;
  onSelectCoords?: (lat: number, lng: number) => void;
  isStudent?: boolean;
}

const CUK_CHEM_COORDS = { lat: 17.4320, lng: 76.6710 };

const CAMPUS_LOCATIONS = [
  {
    id: 'chem-dept',
    title: 'Department of Chemistry',
    subtitle: 'Lecture Hall 101, 102 & Research Labs (Kadaganchi)',
    coords: { lat: 17.4320, lng: 76.6710 },
    type: 'Academic',
    description:
      'Main lecture theatre and Organic/Inorganic research facilities at CUK Kadaganchi. Designated 500m geofence center point.',
    isGeofenceCenter: true,
    offsetX: 0,
    offsetY: 0,
  },
  {
    id: 'cif-lab',
    title: 'Central Instrumentation Facility (CIF)',
    subtitle: 'NMR, XRD, SEM & Analytical Suite',
    coords: { lat: 17.4328, lng: 76.6718 },
    type: 'Laboratory',
    description:
      'High-end spectroscopic and crystallographic characterization center for postgraduate scholars.',
    isGeofenceCenter: false,
    offsetX: 85,
    offsetY: -75,
  },
  {
    id: 'science-block',
    title: 'School of Chemical & Physical Sciences',
    subtitle: 'Administrative Dean Office',
    coords: { lat: 17.4314, lng: 76.6703 },
    type: 'Administration',
    description: 'Faculty chambers, department board room, and student notice board.',
    isGeofenceCenter: false,
    offsetX: -80,
    offsetY: 65,
  },
  {
    id: 'central-library',
    title: 'Central University Library',
    subtitle: 'Knowledge Resource Center',
    coords: { lat: 17.4306, lng: 76.6724 },
    type: 'Facility',
    description: 'Digital journal repository and academic reading halls.',
    isGeofenceCenter: false,
    offsetX: 115,
    offsetY: 110,
  },
];

export const GoogleCampusMap: React.FC<GoogleCampusMapProps> = ({
  geofence,
  userCoords,
  onSelectCoords,
}) => {
  const [selectedPoi, setSelectedPoi] = useState<(typeof CAMPUS_LOCATIONS)[0] | null>(
    CAMPUS_LOCATIONS[0]
  );
  const [liveLocation, setLiveLocation] = useState<{ lat: number; lng: number } | null>(
    userCoords || null
  );
  const [detectingGps, setDetectingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);

  useEffect(() => {
    if (userCoords) {
      setLiveLocation(userCoords);
    }
  }, [userCoords?.lat, userCoords?.lng]);

  // Automatically watch live hardware GPS location on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    setDetectingGps(true);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLiveLocation(coords);
        if (onSelectCoords) onSelectCoords(coords.lat, coords.lng);
        setDetectingGps(false);
        setGpsError(null);
      },
      () => {
        setDetectingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Calculate Haversine distance from geofence center in km
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
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
  };

  const currentDist = liveLocation
    ? calculateDistance(
        liveLocation.lat,
        liveLocation.lng,
        geofence.centerLat,
        geofence.centerLon
      )
    : null;

  const isInside = currentDist !== null && currentDist <= geofence.allowedRadiusKm;

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setDetectingGps(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLiveLocation(coords);
        if (onSelectCoords) onSelectCoords(coords.lat, coords.lng);
        setDetectingGps(false);
      },
      (err) => {
        setGpsError(err.message || 'Unable to retrieve your location.');
        setDetectingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                <Compass className="w-3.5 h-3.5" /> CUK Campus Spatial Radar
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {(geofence.allowedRadiusKm * 1000).toFixed(0)}m Geofence Active
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              Campus Geofence & Real-Time Location Verification
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Central University of Karnataka, Department of Chemistry (Kadaganchi, Aland Road, Kalaburagi · 17.4320°N, 76.6710°E).
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleDetectGps}
              disabled={detectingGps}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              <Navigation className={`w-3.5 h-3.5 ${detectingGps ? 'animate-spin' : ''}`} />
              {detectingGps ? 'Locating GPS...' : 'Detect My Live GPS'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPoi(CAMPUS_LOCATIONS[0]);
                setZoomScale(1);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Center on Chemistry Wing
            </button>
          </div>
        </div>

        {/* Live Geofence Status Pill */}
        {liveLocation && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isInside
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                }`}
              >
                {isInside ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {isInside ? 'Within Attendance Zone' : 'Outside Geofence Perimeter'}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      isInside
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    {currentDist !== null ? `${currentDist.toFixed(3)} km away` : 'Calculating...'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                  GPS: {liveLocation.lat.toFixed(5)}°N, {liveLocation.lng.toFixed(5)}°E · Allowed radius:{' '}
                  {geofence.allowedRadiusKm} km
                </p>
              </div>
            </div>
          </div>
        )}

        {gpsError && (
          <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs rounded-xl border border-rose-200 dark:border-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{gpsError}</span>
          </div>
        )}
      </div>

      {/* Main Interactive Map Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Interactive Department Map & Building Navigator</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoomScale((z) => Math.min(1.5, Number((z + 0.15).toFixed(2))))}
              className="cursor-pointer p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoomScale((z) => Math.max(0.75, Number((z - 0.15).toFixed(2))))}
              className="cursor-pointer p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Reset zoom"
              onClick={() => setZoomScale(1)}
              className="cursor-pointer p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Interactive Vector Campus Radar Canvas */}
        <div className="relative w-full h-[500px] bg-slate-950 text-white p-6 flex flex-col justify-between overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-mono text-indigo-300 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg">
              Anchor: {geofence.centerLat.toFixed(4)}°N, {geofence.centerLon.toFixed(4)}°E · Radius:{' '}
              {(geofence.allowedRadiusKm * 1000).toFixed(0)}m
            </div>
            <span className="text-[11px] text-slate-400">
              CUK Kadaganchi Campus Geofence Grid · Click any building pin to inspect coordinates
            </span>
          </div>

          {/* Scaled Geofence Perimeter Circle */}
          <div
            style={{ transform: `scale(${zoomScale})` }}
            className="relative z-10 my-auto mx-auto w-72 h-72 sm:w-80 sm:h-80 rounded-full border-2 border-indigo-500/70 bg-indigo-950/25 flex items-center justify-center transition-transform duration-200"
          >
            <div className="w-40 h-40 rounded-full border border-indigo-400/30 pointer-events-none" />
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded bg-slate-900 border border-indigo-500/50 text-[10px] font-mono text-indigo-300 whitespace-nowrap">
              {(geofence.allowedRadiusKm * 1000).toFixed(0)}m Verified Perimeter
            </div>

            {CAMPUS_LOCATIONS.map((poi) => {
              const active = selectedPoi?.id === poi.id;
              return (
                <button
                  key={poi.id}
                  type="button"
                  style={{
                    transform: `translate(${poi.offsetX}px, ${poi.offsetY}px)`,
                  }}
                  onClick={() => setSelectedPoi(poi)}
                  className={`cursor-pointer absolute px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border ${
                    active
                      ? 'bg-indigo-600 text-white border-white shadow-lg z-20'
                      : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:border-indigo-400 z-10'
                  }`}
                >
                  <MapPin className="w-3 h-3 text-indigo-300 shrink-0" />
                  <span className="truncate max-w-[135px]">{poi.title}</span>
                </button>
              );
            })}

            {liveLocation && (
              <div
                title="Live GPS Position"
                className={`absolute bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  isInside
                    ? 'bg-emerald-600/90 border-emerald-300 text-white'
                    : 'bg-rose-600/90 border-rose-300 text-white'
                }`}
              >
                GPS: {liveLocation.lat.toFixed(4)}°N, {liveLocation.lng.toFixed(4)}°E
              </div>
            )}
          </div>

          {selectedPoi && (
            <div className="relative z-10 bg-slate-900/95 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  {selectedPoi.type} · {selectedPoi.coords.lat.toFixed(4)}°N,{' '}
                  {selectedPoi.coords.lng.toFixed(4)}°E
                </div>
                <div className="font-bold text-sm text-white mt-0.5">{selectedPoi.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{selectedPoi.description}</div>
              </div>
              {onSelectCoords && (
                <button
                  type="button"
                  onClick={() => {
                    setLiveLocation(selectedPoi.coords);
                    onSelectCoords(selectedPoi.coords.lat, selectedPoi.coords.lng);
                  }}
                  className="cursor-pointer shrink-0 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                >
                  Use Coordinates for Check-In
                </button>
              )}
            </div>
          )}
        </div>

        {/* POI Directory Pills */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Campus Buildings & Locations:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {CAMPUS_LOCATIONS.map((poi) => (
              <button
                key={poi.id}
                type="button"
                onClick={() => setSelectedPoi(poi)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  selectedPoi?.id === poi.id
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-200 dark:ring-indigo-900'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {poi.id === 'chem-dept' ? (
                    <FlaskConical className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  ) : poi.id === 'cif-lab' ? (
                    <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  ) : (
                    <Building2 className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  )}
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {poi.title}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                  {poi.subtitle}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
