import React, { useState, useEffect } from 'react';
import {
  Clock,
  MapPin,
  Users,
  ArrowLeft,
  ShieldCheck,
  Maximize2,
} from 'lucide-react';
import { ActiveSession, AttendanceRecord, StudentProfile } from '../types/attendance';
import { getDailyCode } from '../utils/geo';
import { STUDENT_ROSTER } from '../data/mockData';
import { ThemeSwitcher } from '../context/ThemeContext';

interface ProjectorModeProps {
  activeSession: ActiveSession | null;
  attendanceRecords: AttendanceRecord[];
  students?: StudentProfile[];
  onExit: () => void;
}

export const ProjectorMode: React.FC<ProjectorModeProps> = ({
  activeSession,
  attendanceRecords,
  students = STUDENT_ROSTER,
  onExit,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(1800); // 30 mins
  const [, setIsFullscreen] = useState<boolean>(false);

  const displayCode = activeSession?.code || getDailyCode();
  const subjectName = activeSession?.subject || 'Organic Chemistry';
  const roomName = activeSession?.room || 'Lecture Hall CH-101';
  const facultyName = activeSession?.facultyName || 'Dr. V. Ramanathan';

  // Count verified present attendances for today & current subject
  const todayStr = new Date().toDateString();
  const currentSessionRecords = attendanceRecords.filter(
    (r) => r.subject === subjectName && r.dateString === todayStr && r.status !== 'absent' && r.verified
  );

  const presentCount = currentSessionRecords.length;
  const totalEnrolled = Math.max(1, students.length);
  const percentPresent = Math.round((presentCount / totalEnrolled) * 100);

  // Timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  const centerLat = activeSession?.geofence?.centerLat ?? 17.4320;
  const centerLon = activeSession?.geofence?.centerLon ?? 76.6710;
  const radiusMeters = Math.round((activeSession?.geofence?.allowedRadiusKm ?? 0.5) * 1000);

  return (
    <div className="min-h-[85vh] bg-slate-950 text-white rounded-2xl p-6 sm:p-10 flex flex-col justify-between border border-slate-800 shadow-2xl relative overflow-hidden">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-6 relative z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="cursor-pointer px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 transition-colors flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit Projector Mode
          </button>
          <div className="hidden sm:block text-slate-400 text-xs">
            Central University of Karnataka · Department of Chemistry
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeSwitcher compact variant="darkHeader" />
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>
              Time Left: <strong className="text-white text-sm">{formatTimer(secondsRemaining)}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle Browser Fullscreen"
            className="cursor-pointer p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300"
            title="Toggle Browser Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Center Stage: The Classroom Display */}
      <div className="my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
        {/* Left Column: Big Passcode & Verification Rules */}
        <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-indigo-950/80 border border-indigo-700/50 text-indigo-300 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            Live Classroom Attendance Broadcast
          </div>

          <div>
            <h1
              className="text-3xl sm:text-5xl font-black text-white tracking-tight"
              style={{ textWrap: 'balance' }}
            >
              {subjectName}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-400">
              {roomName} · {facultyName}
            </p>
          </div>

          {/* THE GIANT CODE BOX */}
          <div className="p-8 sm:p-10 bg-slate-900/90 border-2 border-indigo-500/60 rounded-2xl shadow-xl max-w-xl mx-auto lg:mx-0">
            <div className="text-xs uppercase font-bold tracking-widest text-indigo-400 mb-2">
              Classroom Verification Passcode
            </div>
            <div className="text-5xl sm:text-7xl font-mono font-black text-white tracking-widest select-all my-2">
              {displayCode}
            </div>
            <div className="text-xs text-slate-400 mt-3 flex items-center justify-center lg:justify-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                Geofenced to {radiusMeters}m of Science Block · Server OTP & Passcode Verified
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Arrival Ticker */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <span className="font-bold text-white text-sm">Live Roll Ticker</span>
            </div>
            <div className="font-mono text-xs font-bold text-emerald-400">
              {presentCount} / {totalEnrolled} Present ({percentPresent}%)
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(percentPresent, 100)}%` }}
            />
          </div>

          {/* Live Recent Check-Ins Stream */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {currentSessionRecords.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                Waiting for students to submit attendance...
              </div>
            ) : (
              currentSessionRecords.map((r, i) => (
                <div
                  key={r.id}
                  className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-md bg-indigo-900/60 text-indigo-300 font-mono text-[10px] flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    <div>
                      <div className="font-bold text-slate-200">{r.studentName}</div>
                      <div className="text-[10px] font-mono text-slate-400">{r.rollNo}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[10px] text-emerald-400">
                      {r.verificationCode}
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      {new Date(r.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Campus Notice */}
      <div className="border-t border-slate-800/80 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 relative z-10">
        <div>Department of Chemistry, School of Chemical Sciences, Central University of Karnataka</div>
        <div className="font-mono text-[11px] text-slate-400">
          Geofence Lat: {centerLat.toFixed(4)}° N · Lon: {centerLon.toFixed(4)}° E · Radius: {radiusMeters}m
        </div>
      </div>
    </div>
  );
};
