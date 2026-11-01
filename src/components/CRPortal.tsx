import React, { useState, useEffect } from 'react';
import { 
  Star, 
  Users, 
  ShieldCheck, 
  Tv, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  UserCheck, 
  Play, 
  Square,
  RefreshCw,
  KeyRound,
  Navigation,
  Settings2,
  Building2,
  Compass,
  Sliders,
  Check,
  XCircle,
  Lock,
  Search,
  FileText,
  Gavel,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { ActiveSession, AttendanceRecord, ChemistrySubject, CRFinalDecision, StudentProfile } from '../types/attendance';
import { SUBJECTS } from '../data/mockData';
import { exportRosterAndSessionCSV, exportSessionAttendanceRecordsCSV } from '../utils/csvExport';
import { 
  formatDistance, 
  getDailyCode, 
  generateVerificationHash, 
  CampusAnchorConfig,
  getActiveCampusAnchor,
  setCustomCampusAnchor,
  resetCampusAnchor,
  CUK_LOCATION_ANCHOR_PRESETS
} from '../utils/geo';

interface CRPortalProps {
  activeSession: ActiveSession | null;
  onUpdateSession: (session: ActiveSession) => void;
  attendanceRecords: AttendanceRecord[];
  students: StudentProfile[];
  onAddRecord: (record: AttendanceRecord) => void;
  onCRFinalDecision: (
    student: StudentProfile,
    subject: ChemistrySubject,
    dateString: string,
    decision: CRFinalDecision,
    crName: string,
    remark?: string
  ) => void;
  onCRBulkFinalDecision: (
    decisions: { student: StudentProfile; decision: CRFinalDecision; remark?: string }[],
    subject: ChemistrySubject,
    dateString: string,
    crName: string
  ) => void;
  onToggleOverride: (recordId: string, author: string) => void;
  onOpenProjector: () => void;
  onOpenReceipt: (record: AttendanceRecord) => void;
  onManageRoster: () => void;
}

const FACULTY_PRESETS = [
  'Dr. V. Ramanathan (Professor)',
  'Prof. Hanume Gowda (HoD)',
  'Dr. S. K. Deshpande (Assoc. Professor)',
  'Dr. M. Ananthakrishnan (Asst. Professor)',
];

export const CRPortal: React.FC<CRPortalProps> = ({
  activeSession,
  onUpdateSession,
  attendanceRecords,
  students,
  onAddRecord,
  onCRFinalDecision,
  onCRBulkFinalDecision,
  onOpenProjector,
  onOpenReceipt,
  onManageRoster,
}) => {
  // Find designated CR students
  const crStudents = students.filter((s) => s.isCR);
  const [selectedCRRoll, setSelectedCRRoll] = useState<string>(
    crStudents[0]?.rollNo || '26ugchem001'
  );

  const activeCR = students.find((s) => s.rollNo === selectedCRRoll) || {
    rollNo: '26ugchem001',
    name: 'Aarav Sharma',
    semester: 'Sem 4',
    batch: 'B.Sc./M.Sc. 2026',
    isCR: true,
  };

  const todayStr = new Date().toDateString();
  const currentSubject = activeSession?.subject || 'Organic Chemistry';
  const todayCode = activeSession?.isOpen ? activeSession.code : (activeSession?.code || getDailyCode());

  // Teacher Code & Session Configuration State for CR
  const [customTeacherCode, setCustomTeacherCode] = useState<string>(
    activeSession?.code || getDailyCode()
  );
  const [selectedSubject, setSelectedSubject] = useState<ChemistrySubject>(
    activeSession?.subject || 'Organic Chemistry'
  );
  const [teacherName, setTeacherName] = useState<string>(
    activeSession?.facultyName || 'Dr. V. Ramanathan (Professor)'
  );
  const [classroomLocation, setClassroomLocation] = useState<string>(
    activeSession?.room || 'Lecture Hall CH-101'
  );
  const [geofenceRadiusMeters, setGeofenceRadiusMeters] = useState<number>(
    activeSession?.maxDistanceKm ? Math.round(activeSession.maxDistanceKm * 1000) : 500
  );

  // Active Campus GPS Anchor State
  const [campusAnchor, setCampusAnchor] = useState<CampusAnchorConfig>(() => getActiveCampusAnchor());
  const [customLatInput, setCustomLatInput] = useState<string>(() => getActiveCampusAnchor().lat.toFixed(5));
  const [customLonInput, setCustomLonInput] = useState<string>(() => getActiveCampusAnchor().lon.toFixed(5));
  const [customLocationLabel, setCustomLocationLabel] = useState<string>(() => getActiveCampusAnchor().label);
  const [isDetectingLiveGps, setIsDetectingLiveGps] = useState<boolean>(false);
  const [crConfigFeedback, setCrConfigFeedback] = useState<{ type: 'success' | 'info' | 'warning'; text: string } | null>(null);

  // Sync local inputs when activeSession changes externally
  useEffect(() => {
    if (activeSession) {
      setCustomTeacherCode(activeSession.code);
      setSelectedSubject(activeSession.subject);
      setTeacherName(activeSession.facultyName);
      setClassroomLocation(activeSession.room);
      if (activeSession.maxDistanceKm) {
        setGeofenceRadiusMeters(Math.round(activeSession.maxDistanceKm * 1000));
      }
    }
  }, [activeSession]);

  // Listen for global anchor updates
  useEffect(() => {
    const handleAnchorUpdate = () => {
      const updated = getActiveCampusAnchor();
      setCampusAnchor(updated);
      setCustomLatInput(updated.lat.toFixed(5));
      setCustomLonInput(updated.lon.toFixed(5));
      setCustomLocationLabel(updated.label);
    };
    window.addEventListener('cuk-anchor-updated', handleAnchorUpdate);
    return () => window.removeEventListener('cuk-anchor-updated', handleAnchorUpdate);
  }, []);

  // Check if active CR has marked self attendance today
  const hasCRMarkedSelf = attendanceRecords.some(
    (r) => r.rollNo === activeCR.rollNo && r.dateString === todayStr && r.subject === currentSubject
  );

  const [selfMarkStatus, setSelfMarkStatus] = useState<string | null>(null);

  // Apply Teacher Code & Session Details
  const handleSaveTeacherCodeAndSession = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = customTeacherCode.trim().toUpperCase() || getDailyCode();
    const cleanRoom = classroomLocation.trim() || 'Lecture Hall CH-101';
    const cleanTeacher = teacherName.trim() || 'Dr. V. Ramanathan';

    setCustomTeacherCode(cleanCode);
    const nowIso = new Date().toISOString();

    onUpdateSession({
      id: activeSession?.id || `sess-cr-${Date.now()}`,
      subject: selectedSubject,
      facultyName: cleanTeacher,
      room: cleanRoom,
      code: cleanCode,
      startTime: activeSession?.startTime || nowIso,
      durationMinutes: activeSession?.durationMinutes || 60,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      isOpen: true,
      maxDistanceKm: geofenceRadiusMeters / 1000,
    });

    setCrConfigFeedback({
      type: 'success',
      text: `Updated by CR ${activeCR.name}: Teacher Code "${cleanCode}" · Room "${cleanRoom}" · Subject "${selectedSubject}"`,
    });
  };

  // Generate a random Teacher Code (e.g. CHEM482)
  const handleGenerateRandomTeacherCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let generated = 'CHEM';
    for (let i = 0; i < 3; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCustomTeacherCode(generated);
    if (activeSession) {
      onUpdateSession({
        ...activeSession,
        code: generated,
        isOpen: true,
      });
    }
    setCrConfigFeedback({
      type: 'success',
      text: `New random Teacher Code "${generated}" generated and broadcasted live to students!`,
    });
  };

  // Reset Teacher Code to standard CUK Daily Code
  const handleResetDailyCode = () => {
    const daily = getDailyCode();
    setCustomTeacherCode(daily);
    if (activeSession) {
      onUpdateSession({
        ...activeSession,
        code: daily,
        isOpen: true,
      });
    }
    setCrConfigFeedback({
      type: 'info',
      text: `Teacher Code reset to standard daily code: "${daily}"`,
    });
  };

  // Select a CUK Building / Room Location Preset (updates both Room Name and GPS Coordinates)
  const handleSelectLocationPreset = (preset: typeof CUK_LOCATION_ANCHOR_PRESETS[number]) => {
    setClassroomLocation(preset.room);
    const updatedAnchor = setCustomCampusAnchor(preset.lat, preset.lon, preset.label);
    setCampusAnchor(updatedAnchor);
    setCustomLatInput(updatedAnchor.lat.toFixed(5));
    setCustomLonInput(updatedAnchor.lon.toFixed(5));
    setCustomLocationLabel(updatedAnchor.label);

    if (activeSession) {
      onUpdateSession({
        ...activeSession,
        room: preset.room,
        maxDistanceKm: geofenceRadiusMeters / 1000,
      });
    }

    setCrConfigFeedback({
      type: 'success',
      text: `Classroom Location changed to "${preset.room}" (${preset.lat.toFixed(4)}°N, ${preset.lon.toFixed(4)}°E)`,
    });
  };

  // Set CR's Current Live Hardware GPS as the Classroom Geofence Center
  const handleSetCRLiveGpsAsClassroomLocation = () => {
    if (!navigator.geolocation) {
      setCrConfigFeedback({
        type: 'warning',
        text: 'Browser Geolocation API is not supported on this device.',
      });
      return;
    }

    setIsDetectingLiveGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);
        const label = `CR ${activeCR.name} Live Classroom GPS (${classroomLocation || 'Active Lecture Room'} · ±${accuracy}m)`;
        const updatedAnchor = setCustomCampusAnchor(lat, lon, label);
        setCampusAnchor(updatedAnchor);
        setCustomLatInput(updatedAnchor.lat.toFixed(5));
        setCustomLonInput(updatedAnchor.lon.toFixed(5));
        setCustomLocationLabel(updatedAnchor.label);
        setIsDetectingLiveGps(false);

        if (activeSession) {
          onUpdateSession({
            ...activeSession,
            room: classroomLocation || activeSession.room,
            maxDistanceKm: geofenceRadiusMeters / 1000,
          });
        }

        setCrConfigFeedback({
          type: 'success',
          text: `Live GPS locked as Classroom Location: ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E (±${accuracy}m accuracy).`,
        });
      },
      (err) => {
        setIsDetectingLiveGps(false);
        setCrConfigFeedback({
          type: 'warning',
          text: `Could not read live device GPS (${err.message}). You can enter coordinates manually or pick a campus building below.`,
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Save Manually Entered GPS Coordinates & Location Label
  const handleApplyManualGpsLocation = () => {
    const parsedLat = parseFloat(customLatInput);
    const parsedLon = parseFloat(customLonInput);
    if (isNaN(parsedLat) || isNaN(parsedLon) || parsedLat < -90 || parsedLat > 90 || parsedLon < -180 || parsedLon > 180) {
      setCrConfigFeedback({
        type: 'warning',
        text: 'Please enter valid Latitude (-90 to 90) and Longitude (-180 to 180) values.',
      });
      return;
    }

    const label = customLocationLabel.trim() || `${classroomLocation} (${parsedLat.toFixed(4)}°N, ${parsedLon.toFixed(4)}°E)`;
    const updatedAnchor = setCustomCampusAnchor(parsedLat, parsedLon, label);
    setCampusAnchor(updatedAnchor);

    if (activeSession) {
      onUpdateSession({
        ...activeSession,
        room: classroomLocation.trim() || activeSession.room,
        maxDistanceKm: geofenceRadiusMeters / 1000,
      });
    }

    setCrConfigFeedback({
      type: 'success',
      text: `Custom Classroom Location saved: ${label} · Geofence Radius: ${geofenceRadiusMeters}m`,
    });
  };

  // Reset Location to Default CUK Kadaganchi Coordinates
  const handleResetDefaultCukLocation = () => {
    const defaultAnchor = resetCampusAnchor();
    setCampusAnchor(defaultAnchor);
    setCustomLatInput(defaultAnchor.lat.toFixed(5));
    setCustomLonInput(defaultAnchor.lon.toFixed(5));
    setCustomLocationLabel(defaultAnchor.label);
    setClassroomLocation('Lecture Hall CH-101');
    setGeofenceRadiusMeters(500);

    if (activeSession) {
      onUpdateSession({
        ...activeSession,
        room: 'Lecture Hall CH-101',
        maxDistanceKm: 0.5,
      });
    }

    setCrConfigFeedback({
      type: 'info',
      text: 'Classroom location reset to CUK Kadaganchi Science Block (17.4320°N, 76.6710°E · 500m radius).',
    });
  };

  // Quick Self-Attendance Mark for CR
  const handleCRSelfMark = () => {
    if (hasCRMarkedSelf) {
      setSelfMarkStatus('You have already logged your attendance for this class today.');
      return;
    }

    onCRFinalDecision(
      activeCR,
      currentSubject,
      todayStr,
      'approved',
      `${activeCR.name} (${activeCR.rollNo})`,
      `CR Self-Attendance Approved at ${classroomLocation}`
    );
    setSelfMarkStatus(`Attendance verified & finalized for CR ${activeCR.name} (${activeCR.rollNo}) at ${classroomLocation}!`);
  };

  // Session Control Toggle
  const handleToggleSession = () => {
    if (!activeSession) return;
    onUpdateSession({
      ...activeSession,
      isOpen: !activeSession.isOpen,
      facultyName: activeSession.isOpen
        ? activeSession.facultyName
        : activeSession.facultyName.includes('(CR')
        ? activeSession.facultyName
        : `${activeSession.facultyName} (CR ${activeCR.name})`,
    });
  };

  // CR Final Decision Filter & Search State
  const [decisionFilter, setDecisionFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNSUBMITTED'>('ALL');
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [crDecisionNote, setCrDecisionNote] = useState<string>('');
  const [crDecisionFeedback, setCrDecisionFeedback] = useState<string | null>(null);

  const crSignature = `${activeCR.name} (${activeCR.rollNo})`;
  const requireCRApprovalMode = activeSession?.requireCRApproval ?? true;

  // Map every student in the roster to their today's attendance record & CR Final Decision status
  const studentDecisionRows = students.map((student) => {
    const record = attendanceRecords.find(
      (r) => r.rollNo === student.rollNo && r.dateString === todayStr && r.subject === currentSubject
    );

    let status: 'approved' | 'pending' | 'rejected' | 'unsubmitted' = 'unsubmitted';
    if (record) {
      if (record.crDecision === 'rejected') {
        status = 'rejected';
      } else if (record.crDecision === 'pending' || !record.verified) {
        status = 'pending';
      } else {
        status = 'approved';
      }
    }

    return {
      student,
      record,
      status,
    };
  });

  const approvedCount = studentDecisionRows.filter((r) => r.status === 'approved').length;
  const pendingCount = studentDecisionRows.filter((r) => r.status === 'pending').length;
  const rejectedCount = studentDecisionRows.filter((r) => r.status === 'rejected').length;
  const unsubmittedCount = studentDecisionRows.filter((r) => r.status === 'unsubmitted').length;

  const filteredStudentRows = studentDecisionRows.filter(({ student, status }) => {
    if (decisionFilter === 'PENDING' && status !== 'pending') return false;
    if (decisionFilter === 'APPROVED' && status !== 'approved') return false;
    if (decisionFilter === 'REJECTED' && status !== 'rejected') return false;
    if (decisionFilter === 'UNSUBMITTED' && status !== 'unsubmitted') return false;
    if (rosterSearch.trim()) {
      const q = rosterSearch.toLowerCase();
      return (
        student.name.toLowerCase().includes(q) ||
        student.rollNo.toLowerCase().includes(q) ||
        student.batch.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Single student attendance update by CR
  const handleSingleStudentDecision = (student: StudentProfile, decision: CRFinalDecision) => {
    onCRFinalDecision(
      student,
      currentSubject,
      todayStr,
      decision,
      crSignature,
      crDecisionNote.trim() || undefined
    );
    setCrDecisionFeedback(
      `Updated by ${activeCR.name}: ${student.name} (${student.rollNo}) marked as ${
        decision === 'approved' ? 'PRESENT' : decision === 'rejected' ? 'ABSENT' : 'PENDING REVIEW'
      }.`
    );
  };

  // Bulk 1: Approve all pending student check-ins
  const handleApproveAllPending = () => {
    const pendingStudents = studentDecisionRows
      .filter((r) => r.status === 'pending')
      .map((r) => ({
        student: r.student,
        decision: 'approved' as CRFinalDecision,
        remark: crDecisionNote.trim() || `Bulk Verified by CR ${crSignature}`,
      }));

    if (pendingStudents.length === 0) {
      setCrDecisionFeedback('No pending student check-ins waiting for verification.');
      return;
    }

    onCRBulkFinalDecision(pendingStudents, currentSubject, todayStr, crSignature);
    setCrDecisionFeedback(
      `Verified all ${pendingStudents.length} pending student check-ins as PRESENT!`
    );
  };

  // Bulk 2: Mark all students in the class Present
  const handleApproveEntireClass = () => {
    const allDecisions = students.map((student) => ({
      student,
      decision: 'approved' as CRFinalDecision,
      remark: crDecisionNote.trim() || `Class Marked Present by CR ${crSignature}`,
    }));

    onCRBulkFinalDecision(allDecisions, currentSubject, todayStr, crSignature);
    setCrDecisionFeedback(
      `All ${students.length} students in the roster marked PRESENT for ${currentSubject}!`
    );
  };

  // Bulk 3: Finalize & Lock Attendance Sheet (Approve checked-in & mark unsubmitted as Absent)
  const handleFinalizeAndLockSheet = () => {
    const lockDecisions = studentDecisionRows.map(({ student, status }) => ({
      student,
      decision: (status === 'approved' || status === 'pending' ? 'approved' : 'rejected') as CRFinalDecision,
      remark:
        status === 'approved' || status === 'pending'
          ? `Session Sheet Locked: Verified Present (${crSignature})`
          : `Session Sheet Locked: Marked Absent (${crSignature})`,
    }));

    onCRBulkFinalDecision(lockDecisions, currentSubject, todayStr, crSignature);

    if (activeSession) {
      onUpdateSession({
        ...activeSession,
        crFinalizedAt: new Date().toISOString(),
        crFinalizedBy: crSignature,
      });
    }

    const finalPresent = lockDecisions.filter((d) => d.decision === 'approved').length;
    const finalAbsent = lockDecisions.filter((d) => d.decision === 'rejected').length;
    setCrDecisionFeedback(
      `Attendance Register Saved by CR ${activeCR.name}: ${finalPresent} Present · ${finalAbsent} Absent.`
    );
  };

  // Export 1: Current Attendance Roster & Session Sheet to CSV
  const handleExportCRRosterSessionCSV = () => {
    const summary = exportRosterAndSessionCSV({
      students,
      attendanceRecords,
      activeSession,
      subject: currentSubject,
      dateString: todayStr,
      exportedBy: `CR ${activeCR.name} (${activeCR.rollNo})`,
    });
    setCrDecisionFeedback(
      `Exported "${summary.filename}" (${summary.totalStudents} students: ${summary.presentCount} Present · ${summary.absentCount} Absent · ${summary.pendingCount} Pending · ${summary.unmarkedCount} Unmarked).`
    );
  };

  // Export 2: Session Attendance Check-In Data to CSV
  const handleExportCRSessionDataCSV = () => {
    const summary = exportSessionAttendanceRecordsCSV({
      attendanceRecords,
      students,
      activeSession,
      filterSubject: currentSubject,
      filterDate: todayStr,
      exportedBy: `CR ${activeCR.name} (${activeCR.rollNo})`,
    });
    setCrDecisionFeedback(
      `Exported Session Attendance Data "${summary.filename}" (${summary.recordCount} check-in records for ${currentSubject}).`
    );
  };

  return (
    <div className="space-y-8">
      {/* Top Banner: CR Session & Attendance Coordination */}
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-xl p-6 sm:p-7 shadow-md border border-indigo-950">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-400/20 border border-amber-300/40 text-amber-300 rounded-md text-xs font-bold">
              <Star className="w-3.5 h-3.5 fill-current" />
              Class Representative (CR) Coordination Desk
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              CR Session &amp; Attendance Coordination
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Coordinate active lecture passcodes, classroom GPS locations, and class attendance verification logs for the Department of Chemistry.
            </p>
          </div>

          {/* CR Active Identity Switcher */}
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/80 min-w-[280px]">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Active CR Profile:
            </span>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center font-bold">
                <Star className="w-4 h-4 fill-amber-400" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">{activeCR.name}</div>
                <div className="text-[11px] font-mono text-slate-400">{activeCR.rollNo} · {activeCR.batch}</div>
              </div>
            </div>

            {crStudents.length > 1 && (
              <select
                value={selectedCRRoll}
                onChange={(e) => setSelectedCRRoll(e.target.value)}
                className="w-full text-xs bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 mt-1"
              >
                {crStudents.map((cr) => (
                  <option key={cr.rollNo} value={cr.rollNo}>
                    Switch to {cr.name} ({cr.rollNo})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* PANEL 1: CR TEACHER CODE & CLASSROOM LOCATION CONTROLLER */}
      <div className="bg-white rounded-xl border-2 border-indigo-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">
                  CR Controls: Change Teacher Code &amp; Classroom Location
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300 rounded">
                  CR Authorized
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Update the active lecture passcode on behalf of faculty and calibrate the physical classroom room &amp; GPS geofence location.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenProjector}
              className="cursor-pointer px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Tv className="w-3.5 h-3.5" />
              Project Code on Screen
            </button>
            <button
              type="button"
              onClick={handleToggleSession}
              className={`cursor-pointer px-3.5 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 transition-colors ${
                activeSession?.isOpen ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {activeSession?.isOpen ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Close Session
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Open Session
                </>
              )}
            </button>
          </div>
        </div>

        {crConfigFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
              crConfigFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : crConfigFeedback.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-indigo-50 border-indigo-200 text-indigo-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{crConfigFeedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setCrConfigFeedback(null)}
              className="cursor-pointer text-[11px] underline opacity-75 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT BOX: CHANGE TEACHER CODE, SUBJECT & FACULTY */}
          <form onSubmit={handleSaveTeacherCodeAndSession} className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  A. Change Teacher Code &amp; Lecture Info
                </h3>
              </div>
              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded border border-indigo-200">
                Active: {todayCode}
              </span>
            </div>

            {/* Custom Teacher Code Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                New Teacher Passcode (Board / Attendance Code)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customTeacherCode}
                  onChange={(e) => setCustomTeacherCode(e.target.value.toUpperCase())}
                  placeholder="e.g. CUK21 or CHEM101"
                  className="flex-1 px-3.5 py-2 text-base font-mono font-extrabold uppercase tracking-wider bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleGenerateRandomTeacherCode}
                  className="cursor-pointer px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                  title="Generate random teacher code"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Random</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetDailyCode}
                  className="cursor-pointer px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors"
                  title="Reset to default daily code"
                >
                  Daily ({getDailyCode()})
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Students will enter this exact code on their portal to verify attendance.
              </p>
            </div>

            {/* Subject & Teacher Name Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Course Subject
                </label>
                <select
                  value={selectedSubject}
                  onChange={(e) => {
                    const sub = e.target.value as ChemistrySubject;
                    setSelectedSubject(sub);
                    if (activeSession) {
                      onUpdateSession({ ...activeSession, subject: sub });
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {SUBJECTS.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Teacher / Faculty Name
                </label>
                <input
                  type="text"
                  list="cr-faculty-presets"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder="e.g. Dr. V. Ramanathan"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="cr-faculty-presets">
                  {FACULTY_PRESETS.map((prof) => (
                    <option key={prof} value={prof} />
                  ))}
                </datalist>
              </div>
            </div>

            <button
              type="submit"
              className="cursor-pointer w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Update Teacher Code &amp; Broadcast Session</span>
            </button>
          </form>

          {/* RIGHT BOX: CHANGE CLASSROOM ROOM & GPS GEOFENCE LOCATION */}
          <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  B. Change Classroom &amp; GPS Location
                </h3>
              </div>
              <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-200">
                {campusAnchor.lat.toFixed(4)}°N, {campusAnchor.lon.toFixed(4)}°E
              </span>
            </div>

            {/* Room / Lecture Hall Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Classroom / Lecture Hall / Lab Name
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={classroomLocation}
                  onChange={(e) => {
                    setClassroomLocation(e.target.value);
                    if (activeSession) {
                      onUpdateSession({ ...activeSession, room: e.target.value });
                    }
                  }}
                  placeholder="e.g. Lecture Hall CH-101"
                  className="flex-1 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Quick Campus Building & Room Presets */}
            <div>
              <span className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                Quick Select CUK Campus Building &amp; GPS Coordinates:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CUK_LOCATION_ANCHOR_PRESETS.map((preset) => {
                  const isCurrentRoom = classroomLocation === preset.room;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectLocationPreset(preset)}
                      className={`cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
                        isCurrentRoom
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                          : 'bg-white hover:bg-indigo-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span>{preset.room}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 1-Click Live Hardware GPS Calibration for CR */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSetCRLiveGpsAsClassroomLocation}
                disabled={isDetectingLiveGps}
                className="cursor-pointer flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-2xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Navigation className={`w-3.5 h-3.5 ${isDetectingLiveGps ? 'animate-spin' : ''}`} />
                <span>
                  {isDetectingLiveGps
                    ? 'Detecting CR Live GPS...'
                    : 'Use My Live GPS as Classroom Location'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleResetDefaultCukLocation}
                className="cursor-pointer py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg transition-colors"
                title="Reset to CUK Kadaganchi Science Block (17.4320°N, 76.6710°E)"
              >
                Reset to CUK Default
              </button>
            </div>

            {/* Manual GPS Coordinate & Radius Override */}
            <div className="pt-2 border-t border-slate-200/80 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                    Latitude (°N)
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={customLatInput}
                    onChange={(e) => setCustomLatInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                    Longitude (°E)
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={customLonInput}
                    onChange={(e) => setCustomLonInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1 flex items-end">
                  <button
                    type="button"
                    onClick={handleApplyManualGpsLocation}
                    className="cursor-pointer w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Set Coords</span>
                  </button>
                </div>
              </div>

              {/* Geofence Radius Slider */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700 flex items-center gap-1 text-[11px] uppercase">
                    <Sliders className="w-3 h-3 text-indigo-600" />
                    Allowed Geofence Radius:
                  </span>
                  <span className="font-mono font-bold text-indigo-700">
                    {geofenceRadiusMeters} meters ({(geofenceRadiusMeters / 1000).toFixed(2)} km)
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={1500}
                  step={50}
                  value={geofenceRadiusMeters}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setGeofenceRadiusMeters(val);
                    if (activeSession) {
                      onUpdateSession({ ...activeSession, maxDistanceKm: val / 1000 });
                    }
                  }}
                  className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL 2: CLASS ATTENDANCE VERIFICATION REGISTER */}
      <div className="bg-white rounded-xl border-2 border-amber-300 p-6 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                  Class Attendance Verification Register
                </h2>
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300 rounded">
                  CR: {activeCR.name}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Review and update student attendance status (<strong>Present</strong> or <strong>Absent</strong>) for the current session.
              </p>
            </div>
          </div>

          {/* Toggle Policy & CSV Export Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCRRosterSessionCSV}
              className="cursor-pointer px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors text-xs flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0"
              title="Export full student roster with current session Present/Absent status and overall attendance to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Roster &amp; Session CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportCRSessionDataCSV}
              className="cursor-pointer px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg transition-colors text-xs flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0"
              title="Export session attendance check-in records to CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Session Data CSV</span>
            </button>

            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-700 text-[11px]">Check-In Mode:</span>
              <button
                type="button"
                onClick={() => {
                  if (activeSession) {
                    onUpdateSession({
                      ...activeSession,
                      requireCRApproval: !requireCRApprovalMode,
                    });
                  }
                }}
                className={`cursor-pointer px-3 py-1.5 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  requireCRApprovalMode
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'bg-emerald-600 text-white shadow-2xs'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {requireCRApprovalMode
                    ? 'Require CR Verification'
                    : 'Auto-Verify Check-Ins'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Attendance KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 bg-emerald-50/80 rounded-xl border border-emerald-200">
            <span className="text-emerald-800 font-bold uppercase text-[10px] tracking-wider block">
              Verified (Present)
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black font-mono text-emerald-900">{approvedCount}</span>
              <span className="text-[11px] font-semibold text-emerald-700">
                / {students.length} Students
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200">
            <span className="text-amber-800 font-bold uppercase text-[10px] tracking-wider block">
              Pending Verification
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black font-mono text-amber-900">{pendingCount}</span>
              <span className="text-[11px] font-semibold text-amber-700">In Queue</span>
            </div>
          </div>

          <div className="p-3.5 bg-rose-50/80 rounded-xl border border-rose-200">
            <span className="text-rose-800 font-bold uppercase text-[10px] tracking-wider block">
              Marked Absent
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black font-mono text-rose-900">{rejectedCount}</span>
              <span className="text-[11px] font-semibold text-rose-700">Absent</span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-600 font-bold uppercase text-[10px] tracking-wider block">
              Not Submitted Yet
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black font-mono text-slate-900">{unsubmittedCount}</span>
              <span className="text-[11px] font-semibold text-slate-500">Unmarked</span>
            </div>
          </div>
        </div>

        {/* Bulk Attendance Action Bar */}
        <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Bulk Attendance Actions ({currentSubject})</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Approve pending student submissions at once, mark the entire class present, or save the session sheet.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleApproveAllPending}
              className="cursor-pointer px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approve All Pending ({pendingCount})</span>
            </button>

            <button
              type="button"
              onClick={handleApproveEntireClass}
              className="cursor-pointer px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Mark All {students.length} Present</span>
            </button>

            <button
              type="button"
              onClick={handleFinalizeAndLockSheet}
              className="cursor-pointer px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Save Attendance Sheet (Rest Absent)</span>
            </button>
          </div>
        </div>

        {crDecisionFeedback && (
          <div className="p-3.5 bg-indigo-50 border border-indigo-200 text-indigo-950 rounded-xl text-xs font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>{crDecisionFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setCrDecisionFeedback(null)}
              className="cursor-pointer text-[11px] underline opacity-75 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Filter Tabs, Search & Optional CR Note */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All Students (${students.length})` },
                { id: 'PENDING', label: `Pending CR (${pendingCount})` },
                { id: 'APPROVED', label: `Approved Present (${approvedCount})` },
                { id: 'REJECTED', label: `Rejected Absent (${rejectedCount})` },
                { id: 'UNSUBMITTED', label: `Not Checked In (${unsubmittedCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDecisionFilter(tab.id)}
                className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  decisionFilter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={crDecisionNote}
              onChange={(e) => setCrDecisionNote(e.target.value)}
              placeholder="Optional CR Remark (e.g. In Lab / Late)"
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Search Roll No or Name..."
                className="w-full sm:w-52 pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Complete Student Roster Table with CR Final Decision Buttons */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4">Student ID &amp; Scholar</th>
                <th className="py-3 px-4">Check-In Telemetry</th>
                <th className="py-3 px-4">Verification Status</th>
                <th className="py-3 px-4 text-right">Attendance Action (Present / Absent)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredStudentRows.map(({ student, record, status }) => (
                <tr
                  key={student.rollNo}
                  className={`transition-colors ${
                    status === 'pending'
                      ? 'bg-amber-50/40 hover:bg-amber-50/70'
                      : status === 'approved'
                      ? 'bg-emerald-50/20 hover:bg-slate-50'
                      : status === 'rejected'
                      ? 'bg-rose-50/30 hover:bg-rose-50/50'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Student Info */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{student.rollNo}</span>
                      {student.isCR && (
                        <span className="px-1.5 py-0.2 text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 rounded">
                          CR
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-slate-800 mt-0.5">{student.name}</div>
                    <div className="text-[11px] text-slate-500">{student.semester} · {student.batch}</div>
                  </td>

                  {/* Check-In Telemetry */}
                  <td className="py-3 px-4">
                    {record ? (
                      <div className="space-y-1">
                        {record.errorReport && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 border border-amber-400 text-amber-950 font-extrabold text-[10px]">
                            <Gavel className="w-3 h-3 text-amber-700 shrink-0" />
                            <span>ATTENDANCE ISSUE: {record.errorReport.reason}</span>
                          </div>
                        )}
                        <div className="font-mono text-[11px] text-slate-800 font-semibold flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span>{formatDistance(record.distanceKm)} from Classroom</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Time: {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Code: {record.codeUsed}
                        </div>
                        {record.crRemark && (
                          <div className="text-[10px] text-indigo-700 font-medium italic">
                            "{record.crRemark}"
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">
                        No self check-in submitted yet
                      </span>
                    )}
                  </td>

                  {/* Verification Status Badge */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {status === 'approved' && (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-900 font-extrabold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span>Verified: PRESENT</span>
                        </span>
                        {record?.crDecidedBy && (
                          <div className="text-[10px] text-slate-500">
                            By {record.crDecidedBy}
                          </div>
                        )}
                      </div>
                    )}
                    {status === 'pending' && (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 border border-amber-300 text-amber-900 font-extrabold text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>Pending Verification</span>
                        </span>
                        <div className="text-[10px] text-amber-800 font-medium">
                          Student submitted — awaiting review
                        </div>
                      </div>
                    )}
                    {status === 'rejected' && (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-100 border border-rose-300 text-rose-900 font-extrabold text-[11px]">
                          <XCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                          <span>Status: ABSENT</span>
                        </span>
                        {record?.crDecidedBy && (
                          <div className="text-[10px] text-rose-700">
                            By {record.crDecidedBy}
                          </div>
                        )}
                      </div>
                    )}
                    {status === 'unsubmitted' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-600 font-semibold text-[11px]">
                        <span>Not Marked Yet</span>
                      </span>
                    )}
                  </td>

                  {/* Attendance Action Buttons */}
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleSingleStudentDecision(student, 'approved')}
                        className={`cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold transition-all flex items-center gap-1 ${
                          status === 'approved'
                            ? 'bg-emerald-700 text-white ring-2 ring-emerald-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                        }`}
                        title="Approve as Present"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve Present</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSingleStudentDecision(student, 'rejected')}
                        className={`cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold transition-all flex items-center gap-1 ${
                          status === 'rejected'
                            ? 'bg-rose-700 text-white ring-2 ring-rose-300'
                            : 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs'
                        }`}
                        title="Mark Absent"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Mark Absent</span>
                      </button>

                      {record && (
                        <button
                          type="button"
                          onClick={() => onOpenReceipt(record)}
                          className="cursor-pointer p-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg"
                          title="View Attendance Receipt"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PANEL 3: CR PERSONAL SELF-ATTENDANCE & ROSTER MANAGEMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                CR Personal Attendance (Self Check-In)
              </h2>
              <p className="text-xs text-slate-500">Mark your own presence for today's lecture</p>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {currentSubject}
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">CR Scholar:</span>
              <span className="font-bold text-slate-900">{activeCR.name} ({activeCR.rollNo})</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Active Teacher Code:</span>
              <span className="font-mono font-black text-indigo-700 text-sm">{todayCode}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Active Classroom:</span>
              <span className="font-semibold text-slate-800">{activeSession?.room || classroomLocation}</span>
            </div>
            {selfMarkStatus && (
              <div className="mt-2 p-2 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded font-medium text-[11px]">
                {selfMarkStatus}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleCRSelfMark}
              disabled={hasCRMarkedSelf}
              className={`cursor-pointer flex-1 py-2.5 px-4 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2 shadow-xs ${
                hasCRMarkedSelf
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {hasCRMarkedSelf ? 'CR Self-Attendance Approved' : 'Mark My CR Attendance Now'}
            </button>

            <button
              type="button"
              onClick={onManageRoster}
              className="cursor-pointer py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs"
            >
              <Users className="w-4 h-4" />
              Manage Student Roster
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                CR Session Coordination Guidelines
              </h2>
              <p className="text-xs text-slate-500">CUK Chemistry Department Attendance Workflow</p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
            <p>
              <strong>1. Attendance Verification:</strong> Review student check-ins submitted via OTP &amp; GPS and update any student's status as <strong>Present</strong> or <strong>Absent</strong> in the register above.
            </p>
            <p>
              <strong>2. Direct Present / Absent Marking:</strong> If a student experiences hardware GPS drift inside wet labs or device issues, you can directly mark them <strong>Approve Present</strong> or <strong>Mark Absent</strong>.
            </p>
            <p>
              <strong>3. Save Attendance Sheet:</strong> At the end of the lecture, click <strong>"Save Attendance Sheet"</strong> to confirm verified attendees and mark remaining unsubmitted students as Absent.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};


