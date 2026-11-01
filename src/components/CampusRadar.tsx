import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Navigation, 
  ShieldCheck, 
  AlertTriangle, 
  Info, 
  Crosshair, 
  Compass, 
  CheckCircle2,
  Building
} from 'lucide-react';
import { CUK_CAMPUS, calculateHaversineDistance, formatDistance } from '../utils/geo';

interface CampusRadarProps {
  currentDistanceKm?: number | null;
  onSelectTestLocation?: (lat: number, lon: number, locationName: string) => void;
}

interface Landmark {
  name: string;
  type: string;
  lat: number;
  lon: number;
  description: string;
}

export const CampusRadar: React.FC<CampusRadarProps> = ({
  currentDistanceKm = 0.04,
  onSelectTestLocation,
}) => {
  const [selectedLandmark, setSelectedLandmark] = useState<Landmark>({
    name: 'Department of Chemistry (Kadaganchi)',
    type: 'Academic',
    lat: 17.4320,
    lon: 76.6710,
    description: 'Science Block, School of Chemical Sciences (Attendance Origin · 17.4320°N, 76.6710°E)',
  });

  const [liveDeviceGps, setLiveDeviceGps] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveDeviceGps({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const landmarks: Landmark[] = [
    {
      name: 'Department of Chemistry (Kadaganchi)',
      type: 'Core Anchor',
      lat: 17.4320,
      lon: 76.6710,
      description: 'Science Block (Ground & First Floor Laboratories)',
    },
    {
      name: 'Science Complex - Lecture Hall 1',
      type: 'Classroom',
      lat: 17.4324,
      lon: 76.6713,
      description: 'Adjacent to Organic Synthesis Lab (~55m away - VALID)',
    },
    {
      name: 'CUK Central Library',
      type: 'Campus Facility',
      lat: 17.4306,
      lon: 76.6724,
      description: 'Academic knowledge hub (~215m away - VALID)',
    },
    {
      name: 'Administrative Bhavan',
      type: 'Admin',
      lat: 17.4338,
      lon: 76.6695,
      description: 'Vice Chancellor & Registrar Secretariat (~255m - VALID)',
    },
    {
      name: 'Kadaganchi Boys Hostel Complex',
      type: 'Residential',
      lat: 17.4265,
      lon: 76.6752,
      description: 'Student Hostels on Southern Rim (~755m away - REJECTED)',
    },
    {
      name: 'CUK Main Entrance (Aland Road NH-50)',
      type: 'Campus Gate',
      lat: 17.4382,
      lon: 76.6760,
      description: 'Highway access gate (~870m away - REJECTED)',
    },
    {
      name: 'Kalaburagi City Center',
      type: 'Off-Campus',
      lat: 17.3297,
      lon: 76.8343,
      description: 'City center (~20.7 km away - REJECTED: Remote Proxy Attempt)',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Geofence & Spoof Detection Engine
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              CUK Kadaganchi Real Campus Radar
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Attendance verification relies on spatial mathematics using the Haversine trigonometric formula. Devices must report verifiable hardware GPS coordinates within 500 meters of the CUK Kadaganchi Chemistry Wing coordinate datum (17.4320° N, 76.6710° E).
            </p>
          </div>
          {liveDeviceGps && (
            <button
              type="button"
              onClick={() =>
                setSelectedLandmark({
                  name: 'My Real Hardware GPS Location',
                  type: 'Live Device GPS',
                  lat: liveDeviceGps.lat,
                  lon: liveDeviceGps.lon,
                  description: `Live Browser Geolocation Fix (±${liveDeviceGps.accuracy}m accuracy)`,
                })
              }
              className="cursor-pointer shrink-0 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs"
            >
              <Navigation className="w-4 h-4 animate-pulse" />
              <span>
                Inspect My Real GPS ({liveDeviceGps.lat.toFixed(4)}°N, {liveDeviceGps.lon.toFixed(4)}°E)
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Map & Radar Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Visual Campus Radar Canvas */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-600" />
                Live Boundary Simulation Radar
              </h2>
              <p className="text-xs text-slate-500">Center: 17.4320° N, 76.6710° E · Radius: 500 meters</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
              <Crosshair className="w-3.5 h-3.5 text-indigo-600" />
              Real-Time Geofence
            </div>
          </div>

          {/* Radar Visual Canvas Container */}
          <div className="relative w-full aspect-4/3 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 p-4 flex items-center justify-center select-none">
            {/* Grid Lines */}
            <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

            {/* Radar Circular Rings */}
            <div className="absolute w-[80%] h-[80%] rounded-full border border-slate-800 pointer-events-none" />
            <div className="absolute w-[56%] h-[56%] rounded-full border border-indigo-500/40 pointer-events-none">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-mono text-indigo-400 bg-slate-950 px-1">
                500m Authorized Geofence
              </span>
            </div>
            <div className="absolute w-[28%] h-[28%] rounded-full border border-slate-800 pointer-events-none" />

            {/* Crosshairs */}
            <div className="absolute inset-x-0 top-1/2 h-px bg-slate-800/80 pointer-events-none" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-slate-800/80 pointer-events-none" />

            {/* Center Anchor: CUK Chemistry Department */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center ring-4 ring-indigo-500/30 shadow-lg animate-pulse">
                <Building className="w-5 h-5" />
              </div>
              <span className="mt-1 text-[11px] font-bold text-white bg-slate-900/90 px-2 py-0.5 rounded border border-indigo-500/50">
                CUK Chemistry Wing (0m)
              </span>
            </div>

            {/* Landmark Plot Pins */}
            {/* Science Complex LH-1 (60m) */}
            <div
              onClick={() => setSelectedLandmark(landmarks[1])}
              className="absolute top-[44%] left-[58%] z-20 cursor-pointer group flex flex-col items-center"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-emerald-300" />
              <span className="text-[9px] text-emerald-300 opacity-80 group-hover:opacity-100 bg-slate-900 px-1 rounded mt-0.5 whitespace-nowrap">
                LH-1 (60m)
              </span>
            </div>

            {/* Central Library (240m) */}
            <div
              onClick={() => setSelectedLandmark(landmarks[2])}
              className="absolute top-[62%] left-[40%] z-20 cursor-pointer group flex flex-col items-center"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-emerald-300" />
              <span className="text-[9px] text-emerald-300 opacity-80 group-hover:opacity-100 bg-slate-900 px-1 rounded mt-0.5 whitespace-nowrap">
                Library (240m)
              </span>
            </div>

            {/* Admin Bhavan (380m) */}
            <div
              onClick={() => setSelectedLandmark(landmarks[3])}
              className="absolute top-[32%] left-[38%] z-20 cursor-pointer group flex flex-col items-center"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-emerald-300" />
              <span className="text-[9px] text-emerald-300 opacity-80 group-hover:opacity-100 bg-slate-900 px-1 rounded mt-0.5 whitespace-nowrap">
                Admin (380m)
              </span>
            </div>

            {/* Boys Hostel (820m - Outside) */}
            <div
              onClick={() => setSelectedLandmark(landmarks[4])}
              className="absolute bottom-[8%] right-[14%] z-20 cursor-pointer group flex flex-col items-center"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-rose-500 ring-2 ring-rose-300" />
              <span className="text-[9px] text-rose-300 opacity-80 group-hover:opacity-100 bg-slate-900 px-1 rounded mt-0.5 whitespace-nowrap">
                Hostel (820m ✗)
              </span>
            </div>

            {/* Main Gate (920m - Outside) */}
            <div
              onClick={() => setSelectedLandmark(landmarks[5])}
              className="absolute top-[8%] right-[10%] z-20 cursor-pointer group flex flex-col items-center"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-rose-500 ring-2 ring-rose-300" />
              <span className="text-[9px] text-rose-300 opacity-80 group-hover:opacity-100 bg-slate-900 px-1 rounded mt-0.5 whitespace-nowrap">
                Main Gate (920m ✗)
              </span>
            </div>

            {/* Legend Box in Corner */}
            <div className="absolute bottom-3 left-3 bg-slate-900/90 p-2 rounded-lg border border-slate-800 text-[10px] space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Inside 500m (Allowed)</span>
              </div>
              <div className="flex items-center gap-1.5 text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Outside 500m (Rejected)</span>
              </div>
            </div>
          </div>

          {/* Selected Landmark Details */}
          {selectedLandmark && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 text-xs">{selectedLandmark.name}</div>
                  <div className="text-slate-500 text-[11px]">{selectedLandmark.description}</div>
                </div>
                {(() => {
                  const dist = calculateHaversineDistance(
                    selectedLandmark.lat,
                    selectedLandmark.lon,
                    CUK_CAMPUS.lat,
                    CUK_CAMPUS.lon
                  );
                  const isPass = dist <= 0.5;

                  return (
                    <div className="text-right">
                      <div className="font-mono font-bold text-xs text-slate-900">
                        {formatDistance(dist)} away
                      </div>
                      <span className={`text-[10px] font-bold ${isPass ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {isPass ? '✓ Authorized' : '✗ Out of Bounds'}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Campus Landmarks & Formula Details */}
        <div className="lg:col-span-5 space-y-6">
          {/* Landmark Test Chooser */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600" />
              Simulate Testing Coordinates
            </h3>
            <p className="text-xs text-slate-500 mt-2 mb-3">
              Click any campus location below to inspect distance and geofence evaluation:
            </p>

            <div className="space-y-2">
              {landmarks.map((lm) => {
                const dist = calculateHaversineDistance(lm.lat, lm.lon, CUK_CAMPUS.lat, CUK_CAMPUS.lon);
                const isPass = dist <= 0.5;

                return (
                  <button
                    key={lm.name}
                    type="button"
                    onClick={() => {
                      setSelectedLandmark(lm);
                      if (onSelectTestLocation) {
                        onSelectTestLocation(lm.lat, lm.lon, lm.name);
                      }
                    }}
                    className={`cursor-pointer w-full text-left p-2.5 rounded-lg border transition-all text-xs flex items-center justify-between ${
                      selectedLandmark.name === lm.name
                        ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-500'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{lm.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {lm.lat.toFixed(4)}°N, {lm.lon.toFixed(4)}°E
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-800">{formatDistance(dist)}</div>
                      <div className={`text-[10px] font-bold ${isPass ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPass ? 'PASS' : 'FAIL'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Anti-Spoof Mathematical Rigor Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Haversine Anti-Proxy Formula
            </h3>
            <div className="mt-3 text-xs text-slate-600 space-y-2 font-mono bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p className="font-sans text-slate-800 font-medium">Spherical Earth Trigonometry:</p>
              <p>a = sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2)</p>
              <p>c = 2 · atan2(√a, √(1−a))</p>
              <p className="font-bold text-indigo-700">d = 6,371 km · c ≤ 0.50 km</p>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 leading-normal">
              Unlike static IP checks or Bluetooth beacons which can be easily spoofed across dorm rooms, GPS hardware ephemeris combined with teacher classroom OTP codes ensures non-repudiable presence.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
