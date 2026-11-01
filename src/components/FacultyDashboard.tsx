import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Download, 
  Play, 
  Square, 
  RefreshCw, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  Tv, 
  Clock, 
  Settings2,
  Check,
  X,
  UserCheck,
  Calendar,
  ArrowUpDown,
  Layers,
  FileSpreadsheet,
  Fingerprint,
  MapPin,
  Navigation,
  Building2,
  Compass
} from 'lucide-react';
import { ChemistrySubject, AttendanceRecord, ActiveSession, StudentProfile } from '../types/attendance';
import { SUBJECTS, STUDENT_ROSTER } from '../data/mockData';
import {
  formatDistance,
  getDailyCode,
  CampusAnchorConfig,
  getActiveCampusAnchor,
  setCustomCampusAnchor,
  resetCampusAnchor,
  CUK_LOCATION_ANCHOR_PRESETS,
} from '../utils/geo';
import { exportRosterAndSessionCSV, exportSessionAttendanceRecordsCSV } from '../utils/csvExport';

interface FacultyDashboardProps {
  activeSession: ActiveSession | null;
  onUpdateSession: (session: ActiveSession) => void;
  attendanceRecords: AttendanceRecord[];
  students?: StudentProfile[];
  onToggleOverride: (recordId: string, facultyName: string) => void;
  onOpenProjector: () => void;
  onOpenReceipt: (record: AttendanceRecord) => void;
  onManageRoster?: () => void;
}

interface DailySessionLog {
  sessionId: string;
  dateString: string;
  sortTimestamp: number;
  subject: ChemistrySubject;
  facultyName: string;
  room: string;
  code: string;
  startTimeIso: string;
  endTimeIso: string;
  durationMinutes: number;
  isLive: boolean;
  totalAttended: number;
  verifiedCount: number;
  overrideCount: number;
  attendeeRolls: string[];
}

export const FacultyDashboard: React.FC<FacultyDashboardProps> = ({
  activeSession,
  onUpdateSession,
  attendanceRecords,
  students = STUDENT_ROSTER,
  onToggleOverride,
  onOpenProjector,
  onOpenReceipt,
  onManageRoster,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<ChemistrySubject>(
    activeSession?.subject || 'Organic Chemistry'
  );
  const [facultyName, setFacultyName] = useState<string>('Dr. V. Ramanathan (Professor)');
  const [room, setRoom] = useState<string>('Lecture Hall CH-101');
  const [customCode, setCustomCode] = useState<string>(activeSession?.code || getDailyCode());
  const [geofenceRadius, setGeofenceRadius] = useState<number>(
    activeSession?.maxDistanceKm ? activeSession.maxDistanceKm * 1000 : 500
  );

  // Track closed/logged sessions toggled during this browser session for full reporting accuracy
  const [loggedManualSessions, setLoggedManualSessions] = useState<
    Array<{
      id: string;
      subject: ChemistrySubject;
      facultyName: string;
      room: string;
      code: string;
      startTime: string;
      endTime: string;
      dateString: string;
    }>
  >([]);

  // Session Logs sorting & filtering controls
  const [sessionSortOrder, setSessionSortOrder] = useState<'desc' | 'asc'>('desc');
  const [sessionSubjectFilter, setSessionSubjectFilter] = useState<string>('All');

  // Filters for ledger
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('All');
  const [selectedDate, setSelectedDate] = useState<string>('All');
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // Faculty Classroom GPS & Campus Anchor Location State
  const [campusAnchor, setCampusAnchor] = useState<CampusAnchorConfig>(() => getActiveCampusAnchor());
  const [facultyLatInput, setFacultyLatInput] = useState<string>(() => getActiveCampusAnchor().lat.toFixed(5));
  const [facultyLonInput, setFacultyLonInput] = useState<string>(() => getActiveCampusAnchor().lon.toFixed(5));
  const [isDetectingFacultyGps, setIsDetectingFacultyGps] = useState<boolean>(false);

  const handleFacultySelectLocationPreset = (preset: (typeof CUK_LOCATION_ANCHOR_PRESETS)[number]) => {
    setRoom(preset.room);
    const updatedAnchor = setCustomCampusAnchor(preset.lat, preset.lon, preset.label);
    setCampusAnchor(updatedAnchor);
    setFacultyLatInput(updatedAnchor.lat.toFixed(5));
    setFacultyLonInput(updatedAnchor.lon.toFixed(5));

    if (activeSession) {
      onUpdateSession({
        ...activeSession,
        room: preset.room,
        maxDistanceKm: geofenceRadius / 1000,
        geofence: {
          campusName: 'Central University of Karnataka (Kadaganchi)',
          department: 'Department of Chemistry, School of Chemical Sciences',
          centerLat: preset.lat,
          centerLon: preset.lon,
          allowedRadiusKm: geofenceRadius / 1000,
          locationName: preset.label,
        },
      });
    }

    setExportFeedback(
      `Faculty updated Classroom Location to "${preset.room}" (${preset.lat.toFixed(4)}°N, ${preset.lon.toFixed(4)}°E).`
    );
  };

  const handleFacultySetLiveGpsLocation = () => {
    if (!navigator.geolocation) {
      setExportFeedback('Browser Geolocation API is not supported on this device.');
      return;
    }
    setIsDetectingFacultyGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);
        const label = `Faculty Live Classroom GPS (${room || 'Lecture Hall'} · ±${accuracy}m)`;
        const updatedAnchor = setCustomCampusAnchor(lat, lon, label);
        setCampusAnchor(updatedAnchor);
        setFacultyLatInput(updatedAnchor.lat.toFixed(5));
        setFacultyLonInput(updatedAnchor.lon.toFixed(5));
        setIsDetectingFacultyGps(false);

        if (activeSession) {
          onUpdateSession({
            ...activeSession,
            room: room || activeSession.room,
            maxDistanceKm: geofenceRadius / 1000,
            geofence: {
              campusName: 'Central University of Karnataka (Kadaganchi)',
              department: 'Department of Chemistry, School of Chemical Sciences',
              centerLat: lat,
              centerLon: lon,
              allowedRadiusKm: geofenceRadius / 1000,
              locationName: label,
            },
          });
        }
        setExportFeedback(
          `Faculty locked Live GPS as Classroom Location: ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E (±${accuracy}m).`
        );
      },
      (err) => {
        setIsDetectingFacultyGps(false);
        setExportFeedback(`Could not read live device GPS (${err.message}). Use building presets or manual coordinates.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleFacultyApplyManualGps = () => {
    const parsedLat = parseFloat(facultyLatInput);
    const parsedLon = parseFloat(facultyLonInput);
    if (isNaN(parsedLat) || isNaN(parsedLon) || parsedLat < -90 || parsedLat > 90 || parsedLon < -180 || parsedLon > 180) {
      setExportFeedback('Please enter valid Latitude (-90 to 90) and Longitude (-180 to 180) coordinates.');
      return;
    }
    const label = `${room || 'Custom Classroom'} (${parsedLat.toFixed(4)}°N, ${parsedLon.toFixed(4)}°E)`;
    const updatedAnchor = setCustomCampusAnchor(parsedLat, parsedLon, label);
    setCampusAnchor(updatedAnchor);

    if (activeSession) {
      onUpdateSession({
        ...activeSession,
        room: room || activeSession.room,
        maxDistanceKm: geofenceRadius / 1000,
        geofence: {
          campusName: 'Central University of Karnataka (Kadaganchi)',
          department: 'Department of Chemistry, School of Chemical Sciences',
          centerLat: parsedLat,
          centerLon: parsedLon,
          allowedRadiusKm: geofenceRadius / 1000,
          locationName: label,
        },
      });
    }
    setExportFeedback(`Faculty saved Custom Classroom Location: ${label}.`);
  };

  const handleFacultyResetDefaultLocation = () => {
    const defaultAnchor = resetCampusAnchor();
    setCampusAnchor(defaultAnchor);
    setFacultyLatInput(defaultAnchor.lat.toFixed(5));
    setFacultyLonInput(defaultAnchor.lon.toFixed(5));
    setRoom('Lecture Hall CH-101');
    setGeofenceRadius(500);

    if (activeSession) {
      onUpdateSession({
        ...activeSession,
        room: 'Lecture Hall CH-101',
        maxDistanceKm: 0.5,
        geofence: {
          campusName: 'Central University of Karnataka (Kadaganchi)',
          department: 'Department of Chemistry, School of Chemical Sciences',
          centerLat: defaultAnchor.lat,
          centerLon: defaultAnchor.lon,
          allowedRadiusKm: 0.5,
          locationName: defaultAnchor.label,
        },
      });
    }
    setExportFeedback('Classroom location reset to CUK Kadaganchi Science Block (17.4320°N, 76.6710°E · 500m radius).');
  };

  // Handle Session Toggle (Start / Stop)
  const handleToggleSession = () => {
    if (!activeSession) return;

    if (activeSession.isOpen) {
      const closedAtIso = new Date().toISOString();
      // Record the completed session in manual session history
      setLoggedManualSessions((prev) => [
        {
          id: `${activeSession.id}-${Date.now()}`,
          subject: activeSession.subject,
          facultyName: activeSession.facultyName || facultyName,
          room: activeSession.room || room,
          code: activeSession.code,
          startTime: activeSession.startTime,
          endTime: closedAtIso,
          dateString: new Date(activeSession.startTime).toDateString(),
        },
        ...prev,
      ]);

      // Close session
      onUpdateSession({
        ...activeSession,
        expiresAt: closedAtIso,
        isOpen: false,
      });
    } else {
      // Re-open or create fresh session
      const nowIso = new Date().toISOString();
      const expIso = new Date(Date.now() + 1000 * 60 * 45).toISOString();
      onUpdateSession({
        ...activeSession,
        id: `sess-${Date.now()}`,
        subject: selectedSubject,
        facultyName,
        room,
        code: customCode.toUpperCase(),
        isOpen: true,
        maxDistanceKm: geofenceRadius / 1000,
        startTime: nowIso,
        durationMinutes: 45,
        expiresAt: expIso,
      });
    }
  };

  // Generate a random dynamic OTP
  const handleGenerateNewCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'CHEM';
    for (let i = 0; i < 3; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCustomCode(code);
    if (activeSession?.isOpen) {
      onUpdateSession({
        ...activeSession,
        code,
      });
    }
  };

  // Filter records
  const filteredRecords = attendanceRecords.filter((rec) => {
    const matchSearch =
      rec.rollNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.receiptHash.toLowerCase().includes(searchQuery.toLowerCase());

    const matchSubject = filterSubject === 'All' || rec.subject === filterSubject;
    const matchDate = selectedDate === 'All' || rec.dateString === selectedDate;

    return matchSearch && matchSubject && matchDate;
  });

  // Calculate stats
  const todayStr = new Date().toDateString();
  const todayRecords = attendanceRecords.filter((r) => r.dateString === todayStr);
  const totalRosterCount = students.length;
  const presentTodayUnique = new Set(todayRecords.map((r) => r.rollNo)).size;
  const attendanceRate = totalRosterCount > 0 ? Math.round((presentTodayUnique / totalRosterCount) * 100) : 0;

  // Build Chronological Daily Session Logs from attendanceRecords + activeSession + loggedManualSessions
  const chronologicalSessionLogs = useMemo<DailySessionLog[]>(() => {
    const roomBySubject: Record<ChemistrySubject, string> = {
      'Organic Chemistry': 'Lecture Hall CH-101',
      'Inorganic Chemistry': 'Lecture Hall CH-102',
      'Physical Chemistry': 'Seminar Room CH-204',
      'Analytical Chemistry': 'Lecture Hall CH-103',
      'Spectroscopy & Chromatography': 'CIF NMR Block G-02',
      'Advanced Chemistry Lab': 'Synthesis Wet Lab L-1',
    };

    const facultyBySubject: Record<ChemistrySubject, string> = {
      'Organic Chemistry': 'Dr. V. Ramanathan',
      'Inorganic Chemistry': 'Prof. Hanume Gowda',
      'Physical Chemistry': 'Dr. S. K. Deshpande',
      'Analytical Chemistry': 'Dr. M. Ananthakrishnan',
      'Spectroscopy & Chromatography': 'Dr. V. Ramanathan',
      'Advanced Chemistry Lab': 'Prof. Hanume Gowda',
    };

    const sessionMap = new Map<string, DailySessionLog>();

    // 1. Group all attendanceRecords into distinct daily sessions by (dateString + subject + codeUsed)
    attendanceRecords.forEach((rec) => {
      const key = `${rec.dateString}__${rec.subject}__${rec.codeUsed}`;
      const recTimeMs = new Date(rec.timestamp).getTime();

      const existing = sessionMap.get(key);
      if (!existing) {
        // Infer session start ~10 mins before earliest check-in and 45-min lecture window
        const inferredStartMs = recTimeMs - 10 * 60 * 1000;
        const inferredEndMs = inferredStartMs + 45 * 60 * 1000;

        sessionMap.set(key, {
          sessionId: `SES-${rec.codeUsed}-${rec.id.toUpperCase()}`,
          dateString: rec.dateString,
          sortTimestamp: inferredStartMs,
          subject: rec.subject,
          facultyName: facultyBySubject[rec.subject] || 'Dr. V. Ramanathan',
          room: roomBySubject[rec.subject] || 'Lecture Hall CH-101',
          code: rec.codeUsed,
          startTimeIso: new Date(inferredStartMs).toISOString(),
          endTimeIso: new Date(inferredEndMs).toISOString(),
          durationMinutes: 45,
          isLive: false,
          totalAttended: 1,
          verifiedCount: rec.verified ? 1 : 0,
          overrideCount: rec.verified ? 0 : 1,
          attendeeRolls: [rec.rollNo],
        });
      } else {
        // Update earliest check-in / latest check-in bounds and unique student count
        const currentStartMs = new Date(existing.startTimeIso).getTime();
        if (recTimeMs - 5 * 60 * 1000 < currentStartMs) {
          const updatedStartMs = recTimeMs - 8 * 60 * 1000;
          existing.startTimeIso = new Date(updatedStartMs).toISOString();
          existing.endTimeIso = new Date(Math.max(recTimeMs + 20 * 60 * 1000, updatedStartMs + 45 * 60 * 1000)).toISOString();
          existing.sortTimestamp = updatedStartMs;
        }
        if (!existing.attendeeRolls.includes(rec.rollNo)) {
          existing.attendeeRolls.push(rec.rollNo);
          existing.totalAttended = existing.attendeeRolls.length;
        }
        if (rec.verified) {
          existing.verifiedCount += 1;
        } else {
          existing.overrideCount += 1;
        }
      }
    });

    // 2. Merge any manually closed sessions from this faculty session
    loggedManualSessions.forEach((ms) => {
      const key = `${ms.dateString}__${ms.subject}__${ms.code}`;
      const matchingRecords = attendanceRecords.filter(
        (r) => r.dateString === ms.dateString && r.subject === ms.subject && r.codeUsed === ms.code
      );
      const uniqueRolls = Array.from(new Set(matchingRecords.map((r) => r.rollNo)));
      const verified = matchingRecords.filter((r) => r.verified).length;
      const startMs = new Date(ms.startTime).getTime();
      const endMs = new Date(ms.endTime).getTime();
      const dur = Math.max(1, Math.round((endMs - startMs) / 60000));

      sessionMap.set(key, {
        sessionId: ms.id.toUpperCase(),
        dateString: ms.dateString,
        sortTimestamp: startMs,
        subject: ms.subject,
        facultyName: ms.facultyName,
        room: ms.room,
        code: ms.code,
        startTimeIso: ms.startTime,
        endTimeIso: ms.endTime,
        durationMinutes: dur,
        isLive: false,
        totalAttended: uniqueRolls.length,
        verifiedCount: verified,
        overrideCount: matchingRecords.length - verified,
        attendeeRolls: uniqueRolls,
      });
    });

    // 3. Ensure current activeSession is represented accurately at the top
    if (activeSession) {
      const activeDateStr = new Date(activeSession.startTime).toDateString();
      const key = `${activeDateStr}__${activeSession.subject}__${activeSession.code}`;
      const matchingRecords = attendanceRecords.filter(
        (r) =>
          r.dateString === activeDateStr &&
          r.subject === activeSession.subject &&
          r.codeUsed.toUpperCase() === activeSession.code.toUpperCase()
      );
      const uniqueRolls = Array.from(new Set(matchingRecords.map((r) => r.rollNo)));
      const verified = matchingRecords.filter((r) => r.verified).length;
      const startMs = new Date(activeSession.startTime).getTime();
      const endMs = new Date(activeSession.expiresAt).getTime();
      const dur = Math.max(1, Math.round((endMs - startMs) / 60000));

      sessionMap.set(key, {
        sessionId: activeSession.id.toUpperCase(),
        dateString: activeDateStr,
        sortTimestamp: startMs,
        subject: activeSession.subject,
        facultyName: activeSession.facultyName || facultyName,
        room: activeSession.room || room,
        code: activeSession.code,
        startTimeIso: activeSession.startTime,
        endTimeIso: activeSession.expiresAt,
        durationMinutes: dur,
        isLive: activeSession.isOpen,
        totalAttended: uniqueRolls.length,
        verifiedCount: verified,
        overrideCount: matchingRecords.length - verified,
        attendeeRolls: uniqueRolls,
      });
    }

    const list = Array.from(sessionMap.values()).filter(
      (item) => sessionSubjectFilter === 'All' || item.subject === sessionSubjectFilter
    );

    list.sort((a, b) =>
      sessionSortOrder === 'desc' ? b.sortTimestamp - a.sortTimestamp : a.sortTimestamp - b.sortTimestamp
    );

    return list;
  }, [attendanceRecords, activeSession, loggedManualSessions, facultyName, room, sessionSortOrder, sessionSubjectFilter]);

  // Export Session Logs to CSV for administrative reporting
  const handleExportSessionLogsCSV = () => {
    const headers = [
      'Session ID',
      'Date',
      'Course Subject',
      'Faculty In-Charge',
      'Lecture Hall / Lab',
      'Passcode',
      'Start Time',
      'End Time',
      'Duration (Mins)',
      'Session Status',
      'Students Attended',
      'Total Enrolled',
      'Turnout (%)',
      'Attended Roll Numbers',
    ];

    const rows = chronologicalSessionLogs.map((s) => {
      const rate = totalRosterCount > 0 ? Math.round((s.totalAttended / totalRosterCount) * 100) : 0;
      return [
        `"${s.sessionId}"`,
        `"${s.dateString}"`,
        `"${s.subject}"`,
        `"${s.facultyName}"`,
        `"${s.room}"`,
        `"${s.code}"`,
        `"${new Date(s.startTimeIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}"`,
        `"${new Date(s.endTimeIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}"`,
        s.durationMinutes,
        s.isLive ? 'ACTIVE BROADCAST' : 'COMPLETED',
        s.totalAttended,
        totalRosterCount,
        `${rate}%`,
        `"${s.attendeeRolls.join('; ')}"`,
      ];
    });

    const csvString = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const filename = `CUK_Chemistry_Session_Logs_${new Date().toISOString().split('T')[0]}.csv`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setExportFeedback(
      `Exported Session Logs "${filename}" (${chronologicalSessionLogs.length} sessions).`
    );
  };

  // Export 1: Complete Attendance Roster & Current/Selected Session Status to CSV
  const handleExportRosterAndSessionCSV = () => {
    const targetSub = filterSubject !== 'All' ? filterSubject : activeSession?.subject || selectedSubject;
    const targetDate =
      selectedDate !== 'All'
        ? selectedDate
        : activeSession?.startTime
        ? new Date(activeSession.startTime).toDateString()
        : todayStr;

    const summary = exportRosterAndSessionCSV({
      students,
      attendanceRecords,
      activeSession,
      subject: targetSub,
      dateString: targetDate,
      exportedBy: facultyName,
    });

    setExportFeedback(
      `Exported Attendance Roster "${summary.filename}" (${summary.totalStudents} students: ${summary.presentCount} Present · ${summary.absentCount} Absent · ${summary.pendingCount} Pending · ${summary.unmarkedCount} Unmarked).`
    );
  };

  // Export 2: Session Attendance Check-In Data / Ledger CSV
  const handleExportCSV = () => {
    const summary = exportSessionAttendanceRecordsCSV({
      attendanceRecords: filteredRecords,
      students,
      activeSession,
      filterSubject: 'All',
      filterDate: 'All',
      exportedBy: facultyName,
    });

    setExportFeedback(
      `Exported Session Attendance Data "${summary.filename}" (${summary.recordCount} attendance records).`
    );
  };

  // Get distinct dates
  const distinctDates = Array.from(new Set(attendanceRecords.map((r) => r.dateString)));

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Faculty & Academic Office Dashboard
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Class Attendance Controller
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Broadcast active lecture verification codes, configure department geofence boundaries, and audit verified rolls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onManageRoster && (
              <button
                type="button"
                onClick={onManageRoster}
                className="cursor-pointer px-3.5 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors text-xs flex items-center gap-2 shadow-xs whitespace-nowrap shrink-0"
              >
                <Users className="w-4 h-4" />
                Manage Student Roster ({students.length})
              </button>
            )}
            <button
              type="button"
              onClick={onOpenProjector}
              className="cursor-pointer px-3.5 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 transition-colors text-xs flex items-center gap-2 shadow-xs whitespace-nowrap shrink-0"
            >
              <Tv className="w-4 h-4" />
              Launch Projector Screen
            </button>
            <button
              type="button"
              onClick={handleExportRosterAndSessionCSV}
              className="cursor-pointer px-3.5 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors text-xs flex items-center gap-2 shadow-xs whitespace-nowrap shrink-0"
              title="Export complete student roster with current session attendance status and cumulative attendance metrics"
            >
              <Download className="w-4 h-4" />
              Export Roster &amp; Session CSV
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="cursor-pointer px-3.5 py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 transition-colors text-xs flex items-center gap-2 shadow-xs whitespace-nowrap shrink-0"
              title="Export filtered session attendance check-in records to CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export Session Data CSV
            </button>
          </div>
        </div>

        {exportFeedback && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{exportFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setExportFeedback(null)}
              className="cursor-pointer text-[11px] underline opacity-75 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 4 Clean Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/70">
            <div className="text-xs font-medium text-slate-500">M.Sc Chemistry Roster</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{totalRosterCount} Students</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Batch 2022-24 & 2023-25</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/70">
            <div className="text-xs font-medium text-slate-500">Present Today</div>
            <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">{presentTodayUnique}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{attendanceRate}% of registered batch</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/70">
            <div className="text-xs font-medium text-slate-500">Active Board Code</div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{activeSession?.code || getDailyCode()}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{activeSession?.isOpen ? 'Broadcasting live' : 'Daily fallback'}</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/70">
            <div className="text-xs font-medium text-slate-500">Science Block Geofence</div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{geofenceRadius} meters</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Center: 17.1432°N, 76.9038°E</div>
          </div>
        </div>
      </div>

      {/* Session Management Box */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-indigo-600" />
            Live Lecture Session Broadcast
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSession}
              className={`cursor-pointer px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 shadow-xs transition-colors ${
                activeSession?.isOpen
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {activeSession?.isOpen ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Close Attendance Window
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Start Live Session
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-5">
          {/* Subject Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Lecture Subject</label>
            <select
              value={selectedSubject}
              onChange={(e) => {
                const sub = e.target.value as ChemistrySubject;
                setSelectedSubject(sub);
                if (activeSession) {
                  onUpdateSession({ ...activeSession, subject: sub });
                }
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              {SUBJECTS.map((sub) => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>

          {/* Classroom / Hall */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Lecture Hall / Lab</label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              placeholder="e.g. Hall CH-101"
            />
          </div>

          {/* Passcode with regenerate */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Board Passcode</label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customCode}
                onChange={(e) => {
                  setCustomCode(e.target.value.toUpperCase());
                  if (activeSession) {
                    onUpdateSession({ ...activeSession, code: e.target.value.toUpperCase() });
                  }
                }}
                className="w-full px-3 py-2 text-xs font-mono font-bold tracking-wider uppercase border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                onClick={handleGenerateNewCode}
                title="Generate new random OTP"
                className="cursor-pointer p-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Geofence Threshold Slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase">Geofence Radius</label>
              <span className="text-xs font-mono font-bold text-indigo-600">{geofenceRadius}m</span>
            </div>
            <input
              type="range"
              min="100"
              max="1500"
              step="50"
              value={geofenceRadius}
              onChange={(e) => {
                const val = Number(e.target.value);
                setGeofenceRadius(val);
                if (activeSession) {
                  onUpdateSession({ ...activeSession, maxDistanceKm: val / 1000 });
                }
              }}
              className="w-full accent-indigo-600"
            />
          </div>
        </div>

        {/* Biometric Verification Toggle (Faculty Security Setting) */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                activeSession?.requireBiometricVerification
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-900">
                  Biometric Verification
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  · {activeSession?.requireBiometricVerification ? 'Required for Check-In' : 'Optional / Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                When enabled, requires students to provide a secondary device-based identity confirmation (Passkey / Fingerprint scan) before marking attendance.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={Boolean(activeSession?.requireBiometricVerification)}
            onClick={() => {
              if (!activeSession) return;
              const nextState = !activeSession.requireBiometricVerification;
              onUpdateSession({
                ...activeSession,
                requireBiometricVerification: nextState,
              });
              setExportFeedback(
                nextState
                  ? 'Biometric Verification ENABLED: Students must now complete secondary device-based identity confirmation before marking attendance.'
                  : 'Biometric Verification DISABLED: Standard OTP & Geofence verification active.'
              );
            }}
            className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 border ${
              activeSession?.requireBiometricVerification
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
          >
            <Fingerprint className="w-4 h-4" />
            <span>
              {activeSession?.requireBiometricVerification
                ? 'Biometric Verification: ON'
                : 'Enable Biometric Verification'}
            </span>
          </button>
        </div>

        {/* Faculty Classroom & GPS Geofence Location Controller (Authorized for Faculty & CR Only) */}
        <div className="mt-5 pt-4 border-t border-slate-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-extrabold text-slate-900">
                Set &amp; Change Classroom GPS Geofence Location (Faculty &amp; CR Exclusive)
              </span>
            </div>
            <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
              Active Center: {campusAnchor.lat.toFixed(4)}°N, {campusAnchor.lon.toFixed(4)}°E
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CUK_LOCATION_ANCHOR_PRESETS.map((preset) => {
              const isCurrentRoom = room === preset.room;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleFacultySelectLocationPreset(preset)}
                  className={`cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    isCurrentRoom
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                      : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-300'
                  }`}
                >
                  <Building2 className="w-3 h-3 shrink-0" />
                  <span>{preset.room}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Latitude (°N)
              </label>
              <input
                type="number"
                step="0.00001"
                value={facultyLatInput}
                onChange={(e) => setFacultyLatInput(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Longitude (°E)
              </label>
              <input
                type="number"
                step="0.00001"
                value={facultyLonInput}
                onChange={(e) => setFacultyLonInput(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleFacultyApplyManualGps}
                className="cursor-pointer py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Set Coords</span>
              </button>
              <button
                type="button"
                onClick={handleFacultySetLiveGpsLocation}
                disabled={isDetectingFacultyGps}
                className="cursor-pointer py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Navigation className={`w-3.5 h-3.5 ${isDetectingFacultyGps ? 'animate-spin' : ''}`} />
                <span>{isDetectingFacultyGps ? 'Detecting GPS...' : 'Use My Live GPS'}</span>
              </button>
              <button
                type="button"
                onClick={handleFacultyResetDefaultLocation}
                className="cursor-pointer py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Reset to CUK Default
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chronological Session Logs Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">
                Session Logs — Chronological Daily Lecture &amp; Lab Register
              </h2>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                {chronologicalSessionLogs.length} {chronologicalSessionLogs.length === 1 ? 'Session' : 'Sessions'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Chronological audit log of all daily sessions with exact start time, end time, passcode, and total student attendance count for administrative reporting accuracy.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={sessionSubjectFilter}
              onChange={(e) => setSessionSubjectFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs text-slate-700 font-medium"
            >
              <option value="All">All Course Subjects</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setSessionSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold transition-colors"
              title="Toggle chronological sort order"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
              {sessionSortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
            </button>

            <button
              type="button"
              onClick={handleExportSessionLogsCSV}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs transition-colors"
              title="Download chronological session logs as CSV for reporting"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Session Logs CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Date &amp; Session ID</th>
                <th className="py-3 px-4">Subject &amp; Venue</th>
                <th className="py-3 px-4">Start Time</th>
                <th className="py-3 px-4">End Time</th>
                <th className="py-3 px-4">Passcode</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Students Attended</th>
                <th className="py-3 px-4 text-right">Audit Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chronologicalSessionLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No daily session logs match the selected subject filter.
                  </td>
                </tr>
              ) : (
                chronologicalSessionLogs.map((session) => {
                  const turnoutPct =
                    totalRosterCount > 0 ? Math.round((session.totalAttended / totalRosterCount) * 100) : 0;
                  const isSelectedInLedger =
                    selectedDate === session.dateString && filterSubject === session.subject;

                  return (
                    <tr
                      key={`${session.sessionId}-${session.dateString}-${session.code}`}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        session.isLive ? 'bg-indigo-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>{session.dateString}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                          {session.sessionId}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{session.subject}</div>
                        <div className="text-[11px] text-slate-500">
                          {session.room} • {session.facultyName}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-800 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-semibold">
                          <Clock className="w-3 h-3 text-emerald-600" />
                          {new Date(session.startTimeIso).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-800 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-semibold">
                          <Clock className="w-3 h-3 text-rose-500" />
                          {new Date(session.endTimeIso).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                        <span className="block text-[10px] text-slate-400">
                          {session.durationMinutes} min window
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
                          {session.code}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {session.isLive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Active Session
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            <CheckCircle2 className="w-3 h-3 text-slate-500" />
                            Completed
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5 font-mono font-bold text-slate-900 text-sm">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                          <span>
                            {session.totalAttended} / {totalRosterCount}
                          </span>
                          <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                            {turnoutPct}%
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {session.verifiedCount} GPS Verified
                          {session.overrideCount > 0 ? ` • ${session.overrideCount} Override` : ''}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (isSelectedInLedger) {
                              setSelectedDate('All');
                              setFilterSubject('All');
                            } else {
                              setSelectedDate(session.dateString);
                              setFilterSubject(session.subject);
                            }
                          }}
                          className={`cursor-pointer px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                            isSelectedInLedger
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 hover:bg-indigo-50 text-indigo-700 border-slate-200 hover:border-indigo-200'
                          }`}
                        >
                          {isSelectedInLedger ? 'Showing in Ledger ✓' : 'Filter Ledger'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Attendance Register & Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Filter Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search roll, name, hash..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto justify-end">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
            >
              <option value="All">All Subjects</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
            >
              <option value="All">All Dates</option>
              {distinctDates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportRosterAndSessionCSV}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors whitespace-nowrap shrink-0"
              title="Export attendance roster for selected subject and date"
            >
              <Download className="w-3.5 h-3.5" />
              Roster CSV
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors whitespace-nowrap shrink-0"
              title="Export filtered session attendance records"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Session CSV ({filteredRecords.length})
            </button>
          </div>
        </div>

        {/* The Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Check-In Time</th>
                <th className="py-3 px-4">Proximity to Dept</th>
                <th className="py-3 px-4">Verification</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No verified attendance records found matching filters.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {rec.rollNo}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {rec.studentName}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {rec.subject}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono">
                      {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <span className="text-[10px] text-slate-400 block">{rec.dateString}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-slate-800">
                          {formatDistance(rec.distanceKm)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          (±{rec.accuracyMeters}m)
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {rec.isSimulated ? 'Simulated Lab Fix' : 'Live Satellite GPS'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {rec.crDecision === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <X className="w-3.5 h-3.5 text-rose-600" />
                          Marked Absent
                        </span>
                      ) : rec.crDecision === 'pending' || !rec.verified ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Pending Verification
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Verified Present
                        </span>
                      )}
                      {rec.crDecidedBy && (
                        <span className="block text-[10px] text-indigo-700 font-semibold mt-0.5">
                          Verified by: {rec.crDecidedBy}
                        </span>
                      )}
                      {rec.errorReport && (
                        <span className="block text-[10px] text-amber-800 font-semibold mt-0.5">
                          Review Note: "{rec.errorReport.reason}"
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenReceipt(rec)}
                          className="cursor-pointer text-indigo-600 hover:text-indigo-800 font-semibold text-[11px] hover:underline"
                        >
                          Certificate
                        </button>
                        {rec.crDecidedBy ? (
                          <span
                            className="px-2 py-1 bg-slate-100 border border-slate-200 text-slate-600 rounded text-[10px] font-semibold"
                          >
                            Recorded
                          </span>
                        ) : (
                          <span
                            className="px-2 py-1 bg-slate-100 border border-slate-200 text-slate-500 rounded text-[10px] font-semibold"
                          >
                            Pending Review
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
