import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, AppTab } from './components/Navbar';
import { StudentPortal } from './components/StudentPortal';
import { FacultyDashboard } from './components/FacultyDashboard';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { CampusRadar } from './components/CampusRadar';
import { ProjectorMode } from './components/ProjectorMode';
import { AttendanceReceiptModal } from './components/AttendanceReceiptModal';
import { AuthModal } from './components/AuthModal';
import { AcademicChatbot } from './components/AcademicChatbot';
import { CRPortal } from './components/CRPortal';
import { StudentRosterManager } from './components/StudentRosterManager';
import { GoogleWorkspacePanel } from './components/GoogleWorkspacePanel';
import { GoogleCampusMap } from './components/GoogleCampusMap';
import { InformationPanel } from './components/InformationPanel';
import { ClassSchedulePanel } from './components/ClassSchedulePanel';
import {
  ActiveSession,
  AttendanceRecord,
  AuthUser,
  StudentProfile,
  DepartmentNotice,
  ClassScheduleSlot,
  UserRole,
  ChemistrySubject,
  CRFinalDecision,
} from './types/attendance';
import {
  INITIAL_FACULTY_SESSION,
  STUDENT_ROSTER,
  INITIAL_NOTICES,
  INITIAL_CLASS_SCHEDULE,
  generateSeedRecords,
  migrateLegacyStudentId,
} from './data/mockData';
import { getActiveCampusAnchor, getDailyCode } from './utils/geo';
import {
  Star,
  GraduationCap,
  UserCheck,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { portalApi, getAuthToken, setAuthToken } from './utils/apiClient';

const STORAGE_KEY_AUTH = 'cuk_chem_auth_user_v3';

export function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUTH);
      const token = getAuthToken();
      if (saved && token) {
        const parsed = JSON.parse(saved) as AuthUser;
        if (parsed.rollNo) parsed.rollNo = migrateLegacyStudentId(parsed.rollNo);
        if (parsed.facultyId) parsed.facultyId = migrateLegacyStudentId(parsed.facultyId);
        return parsed;
      }
    } catch (e) {
      console.error('Failed to read auth user', e);
    }
    return null;
  });

  const [currentTab, setCurrentTab] = useState<AppTab>(() => {
    if (currentUser?.role === 'cr') return 'cr';
    if (currentUser?.role === 'faculty') return 'faculty';
    return 'student';
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [bannerAlert, setBannerAlert] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const [students, setStudents] = useState<StudentProfile[]>(STUDENT_ROSTER);
  const [notices, setNotices] = useState<DepartmentNotice[]>(INITIAL_NOTICES);
  const [schedule, setSchedule] = useState<ClassScheduleSlot[]>(INITIAL_CLASS_SCHEDULE);
  const [activeSession, setActiveSession] = useState<ActiveSession>(() => {
    const anchor = getActiveCampusAnchor();
    return {
      ...INITIAL_FACULTY_SESSION,
      geofence: {
        campusName: 'Central University of Karnataka (Kadaganchi)',
        department: 'Department of Chemistry, School of Chemical Sciences',
        centerLat: anchor.lat,
        centerLon: anchor.lon,
        allowedRadiusKm: INITIAL_FACULTY_SESSION.maxDistanceKm || 0.5,
        locationName: anchor.label,
      },
    };
  });
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() =>
    generateSeedRecords()
  );

  // Sync with shared backend database
  const syncFromServer = useCallback(async (silent = false) => {
    const token = getAuthToken();
    if (!token) return;
    if (!silent) setIsSyncing(true);
    try {
      const state = await portalApi.fetchPortalState();
      setStudents(state.students);
      setActiveSession(state.activeSession);
      setAttendanceRecords(state.attendanceRecords);
      setSchedule(state.schedule);
      setNotices(state.notices);
      setLastSyncedAt(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch (err: any) {
      if (err.message?.includes('Authentication required') || err.message?.includes('401')) {
        setAuthToken(null);
        setCurrentUser(null);
        localStorage.removeItem(STORAGE_KEY_AUTH);
      } else if (!silent) {
        setBannerAlert({
          type: 'error',
          message: err.message || 'Could not sync with server.',
        });
      }
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, []);

  // Initial sync & periodic background polling every 8 seconds when logged in
  useEffect(() => {
    if (!currentUser) return;
    syncFromServer(false);
    const interval = setInterval(() => {
      syncFromServer(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [currentUser, syncFromServer]);

  // Listen to custom geofence anchor updates from any component
  useEffect(() => {
    const handleAnchorChange = async (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        const nextGeofence = {
          campusName: 'Central University of Karnataka (Kadaganchi)',
          department: 'Department of Chemistry, School of Chemical Sciences',
          centerLat: customEvent.detail.lat,
          centerLon: customEvent.detail.lon,
          allowedRadiusKm: activeSession.maxDistanceKm || 0.5,
          locationName: customEvent.detail.label,
        };
        setActiveSession((prev) => ({
          ...prev,
          geofence: nextGeofence,
        }));
        try {
          const res = await portalApi.updateSession({ geofence: nextGeofence });
          setActiveSession(res.activeSession);
        } catch {
          // ignore if student
        }
      }
    };
    window.addEventListener('cuk-anchor-updated', handleAnchorChange);
    return () => window.removeEventListener('cuk-anchor-updated', handleAnchorChange);
  }, [activeSession.maxDistanceKm]);

  // Persist currentUser locally alongside token
  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(STORAGE_KEY_AUTH);
      }
    } catch (e) {
      console.error('Failed to save auth user', e);
    }
  }, [currentUser]);

  // Enforce Role-Based Access Control on tabs
  useEffect(() => {
    if (!currentUser) return;

    const isPrivileged =
      currentUser.role === 'faculty' ||
      currentUser.role === 'cr' ||
      currentUser.isCR ||
      currentUser.isCRIdentity;

    const restrictedForStudents: AppTab[] = [
      'faculty',
      'cr',
      'projector',
      'roster',
      'workspace',
    ];
    if (!isPrivileged && restrictedForStudents.includes(currentTab)) {
      setCurrentTab('student');
    }

    if (
      currentUser.role === 'faculty' &&
      !currentUser.isCR &&
      !currentUser.isCRIdentity &&
      currentTab === 'cr'
    ) {
      setCurrentTab('faculty');
    }
  }, [currentUser, currentTab]);

  const [selectedReceipt, setSelectedReceipt] = useState<AttendanceRecord | null>(null);
  const [simulatedCoords, setSimulatedCoords] = useState<{
    lat: number;
    lon: number;
    name: string;
  } | null>(null);

  const handleAddRecord = (newRecord: AttendanceRecord) => {
    setAttendanceRecords((prev) => {
      const filtered = prev.filter((r) => r.id !== newRecord.id);
      return [newRecord, ...filtered];
    });
    setSelectedReceipt(newRecord);
    syncFromServer(true);
  };

  const handleUpdateSession = async (updated: ActiveSession) => {
    setActiveSession(updated);
    try {
      const res = await portalApi.updateSession(updated);
      setActiveSession(res.activeSession);
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Failed to update session on server.',
      });
    }
  };

  // Server-backed CR / Faculty single attendance verification decision
  const handleCRFinalDecision = async (
    student: StudentProfile,
    subject: ChemistrySubject,
    _dateString: string,
    decision: CRFinalDecision
  ) => {
    const status = decision === 'rejected' ? 'absent' : 'present';
    try {
      const res = await portalApi.overrideAttendance({
        rollNo: student.rollNo,
        subject,
        status,
      });
      setAttendanceRecords(res.attendanceRecords);
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Failed to update attendance status on server.',
      });
    }
  };

  // Server-backed CR / Faculty bulk attendance decision
  const handleCRBulkFinalDecision = async (
    decisions: { student: StudentProfile; decision: CRFinalDecision; remark?: string }[],
    subject: ChemistrySubject
  ) => {
    if (decisions.length === 0) return;
    const firstDecision = decisions[0].decision;
    const status = firstDecision === 'rejected' ? 'absent' : 'present';
    try {
      const res = await portalApi.bulkMarkAttendance({
        subject,
        status,
        onlyUnmarked: false,
      });
      setAttendanceRecords(res.attendanceRecords);
      setBannerAlert({
        type: 'success',
        message: `Updated ${decisions.length} student records for ${subject} on server.`,
      });
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Failed to apply bulk attendance update.',
      });
    }
  };

  // Toggle override on an existing record
  const handleToggleOverride = async (recordId: string) => {
    const target = attendanceRecords.find((r) => r.id === recordId);
    if (!target) return;
    const nextStatus = target.status === 'absent' || !target.verified ? 'present' : 'absent';
    try {
      const res = await portalApi.overrideAttendance({
        rollNo: target.rollNo,
        subject: target.subject,
        status: nextStatus,
      });
      setAttendanceRecords(res.attendanceRecords);
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Could not toggle attendance record.',
      });
    }
  };

  const handleAddStudent = async (newStudent: StudentProfile) => {
    try {
      const res = await portalApi.addStudent(newStudent);
      setStudents(res.students);
      setBannerAlert({
        type: 'success',
        message: `Added student ${newStudent.name} (${newStudent.rollNo}) to roster.`,
      });
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Could not add student.',
      });
    }
  };

  const handleBulkAddStudents = async (newStudents: StudentProfile[]) => {
    for (const st of newStudents) {
      try {
        await portalApi.addStudent(st);
      } catch {
        // skip duplicates
      }
    }
    await syncFromServer(false);
    setBannerAlert({
      type: 'success',
      message: `Processed ${newStudents.length} roster entries.`,
    });
  };

  const handleReplaceStudents = async (newRoster: StudentProfile[]) => {
    if (newRoster.length === 0) return;
    await handleBulkAddStudents(newRoster);
  };

  const handleToggleCR = async (rollNo: string) => {
    const canChangeCR = Boolean(
      currentUser?.isCR || currentUser?.isCRIdentity || currentUser?.role === 'cr'
    );
    if (!canChangeCR) {
      setBannerAlert({
        type: 'error',
        message: 'Only a Class Representative (CR) has the right to change CR status.',
      });
      return;
    }
    const target = students.find((s) => s.rollNo.toLowerCase() === rollNo.toLowerCase());
    if (!target) return;
    await handleUpdateStudent(target.rollNo, { ...target, isCR: !target.isCR });
  };

  const handleUpdateStudent = async (
    originalRollNo: string,
    updatedStudent: StudentProfile
  ) => {
    try {
      const res = await portalApi.updateStudent(originalRollNo, updatedStudent);
      setStudents(res.students);
      setAttendanceRecords(res.attendanceRecords);
      if (
        currentUser?.rollNo &&
        currentUser.rollNo.toLowerCase() === originalRollNo.toLowerCase()
      ) {
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                rollNo: updatedStudent.rollNo,
                name: updatedStudent.name,
                email: updatedStudent.email,
                phone: updatedStudent.phone,
                isCR: !!updatedStudent.isCR,
                isCRIdentity: !!updatedStudent.isCR,
              }
            : null
        );
      }
      setBannerAlert({
        type: 'success',
        message: `Updated profile for ${updatedStudent.name} (${updatedStudent.rollNo}).`,
      });
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Could not update student profile.',
      });
    }
  };

  const handleDeleteStudent = async (rollNo: string) => {
    try {
      const res = await portalApi.deleteStudent(rollNo);
      setStudents(res.students);
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Could not remove student.',
      });
    }
  };

  const handleAddNotice = async (notice: DepartmentNotice) => {
    try {
      const res = await portalApi.addNotice(notice);
      setNotices(res.notices);
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Failed to publish notice.',
      });
    }
  };

  const handleEditNotice = async (updated: DepartmentNotice) => {
    try {
      const res = await portalApi.updateNotice(updated.id, updated);
      setNotices(res.notices);
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Failed to update notice.',
      });
    }
  };

  const handleDeleteNotice = async (id: string) => {
    try {
      const res = await portalApi.deleteNotice(id);
      setNotices(res.notices);
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Failed to delete notice.',
      });
    }
  };

  const handleTogglePinNotice = async (id: string) => {
    const target = notices.find((n) => n.id === id);
    if (!target) return;
    try {
      const res = await portalApi.updateNotice(id, { isPinned: !target.isPinned });
      setNotices(res.notices);
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Failed to pin notice.',
      });
    }
  };

  const handleUpdateSchedule = async (newSchedule: ClassScheduleSlot[]) => {
    setSchedule(newSchedule);
    try {
      const res = await portalApi.updateSchedule(newSchedule);
      setSchedule(res.schedule);
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Failed to update schedule.',
      });
    }
  };

  const handleRenewSlotAttendance = async (slot: ClassScheduleSlot) => {
    try {
      const res = await portalApi.renewScheduleSlot(slot.id);
      setSchedule(res.schedule);
      setActiveSession(res.activeSession);
      setBannerAlert({
        type: 'success',
        message: `Opened attendance window for ${slot.subject} (Passcode: ${res.activeSession.code}).`,
      });
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Failed to renew class period.',
      });
    }
  };

  const handleSelectTestLocation = (lat: number, lon: number, locationName: string) => {
    setSimulatedCoords({ lat, lon, name: locationName });
    setCurrentTab('student');
  };

  const handleLogin = (user: AuthUser) => {
    const enrichedUser: AuthUser = {
      ...user,
      isAuthenticated: true,
      isCRIdentity: Boolean(user.isCR || user.isCRIdentity || user.role === 'cr'),
      isCR: Boolean(user.isCR || user.isCRIdentity || user.role === 'cr'),
    };
    setCurrentUser(enrichedUser);
    if (enrichedUser.role === 'cr') {
      setCurrentTab('cr');
    } else if (enrichedUser.role === 'faculty') {
      setCurrentTab('faculty');
    } else {
      setCurrentTab('student');
    }
  };

  const handleQuickRoleSwitch = async (targetRole: UserRole) => {
    if (!currentUser || (!currentUser.isCR && !currentUser.isCRIdentity)) return;
    try {
      const res = await portalApi.switchRole(targetRole);
      setCurrentUser({
        ...res.user,
        isAuthenticated: true,
        isCRIdentity: true,
        isCR: true,
      });
      setCurrentTab(targetRole);
      await syncFromServer(false);
    } catch (err: any) {
      setBannerAlert({
        type: 'error',
        message: err.message || 'Could not switch role.',
      });
    }
  };

  const handleLogout = async () => {
    try {
      await portalApi.logout();
    } catch {
      // ignore logout error
    }
    setAuthToken(null);
    setCurrentUser(null);
    setCurrentTab('student');
    setIsAuthModalOpen(false);
  };

  const activeUser = currentUser;
  const isCRUser = Boolean(activeUser?.isCR || activeUser?.isCRIdentity || activeUser?.role === 'cr');
  const isPrivilegedUser = Boolean(isCRUser || activeUser?.role === 'faculty');

  const geofenceForMap = activeSession.geofence || {
    campusName: 'Central University of Karnataka (Kadaganchi)',
    department: 'Department of Chemistry, School of Chemical Sciences',
    centerLat: 17.4320,
    centerLon: 76.6710,
    allowedRadiusKm: activeSession.maxDistanceKm || 0.5,
    locationName: 'CUK Science Block',
  };

  // MANDATORY OTP LOGIN GATE: Before login, nobody can access anything
  if (!activeUser) {
    return (
      <ThemeProvider>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-600 selection:text-white">
          <AuthModal
            isOpen={true}
            onClose={() => {}}
            currentUser={null}
            onLogin={handleLogin}
            onLogout={handleLogout}
            students={students}
            requireAuth={true}
          />
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-600 selection:text-white transition-colors duration-150">
        {currentTab !== 'projector' && (
          <Navbar
            currentTab={currentTab}
            onSelectTab={(t) => setCurrentTab(t)}
            todayCode={activeSession.code || getDailyCode()}
            currentUser={activeUser}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onOpenChat={() => setIsChatOpen(true)}
          />
        )}

        {/* CR Dual-Login & Role Switcher Bar (Visible to authenticated CRs) */}
        {currentTab !== 'projector' && isCRUser && (
          <div className="bg-amber-50/90 border-b border-amber-200 px-4 py-2">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-amber-950">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-bold text-[11px]">
                  <Star className="w-3 h-3 fill-slate-950" />
                  CR Mode Active
                </span>
                <span className="font-medium text-amber-900">
                  Logged in as <strong>{activeUser.name}</strong> ({activeUser.rollNo || '26ugchem001'}) · Switch active view:
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleQuickRoleSwitch('student')}
                  className={`cursor-pointer px-2.5 py-1 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all ${
                    activeUser.role === 'student' && currentTab === 'student'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  1. Student View
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickRoleSwitch('cr')}
                  className={`cursor-pointer px-2.5 py-1 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all ${
                    currentTab === 'cr'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  <Star className="w-3.5 h-3.5" />
                  2. CR Desk
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickRoleSwitch('faculty')}
                  className={`cursor-pointer px-2.5 py-1 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all ${
                    currentTab === 'faculty'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white text-emerald-900 border border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  3. Faculty View
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="cursor-pointer px-2.5 py-1 rounded-md font-bold text-[11px] bg-white text-rose-700 border border-rose-200 hover:bg-rose-50"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Faculty Session Scope Notice */}
        {currentTab !== 'projector' && activeUser.role === 'faculty' && !isCRUser && (
          <div className="bg-emerald-50/70 border-b border-emerald-200 px-4 py-1.5">
            <div className="max-w-7xl mx-auto flex items-center justify-between text-[11px] text-emerald-900">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  <strong>Faculty Session:</strong> Logged in as {activeUser.name} ({activeUser.facultyId}).
                </span>
              </div>
              <div className="flex items-center gap-3">
                {lastSyncedAt && (
                  <button
                    type="button"
                    onClick={() => syncFromServer(false)}
                    className="cursor-pointer inline-flex items-center gap-1 text-emerald-800 hover:underline font-mono text-[10px]"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    Synced {lastSyncedAt}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="cursor-pointer font-bold text-rose-700 hover:underline"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Student Session Scope Notice */}
        {currentTab !== 'projector' && activeUser.role === 'student' && !isCRUser && (
          <div className="bg-indigo-50/70 border-b border-indigo-200 px-4 py-1.5">
            <div className="max-w-7xl mx-auto flex items-center justify-between text-[11px] text-indigo-900">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  <strong>Student Session:</strong> {activeUser.name} ({activeUser.rollNo}) · Private Record Scope
                </span>
              </div>
              <div className="flex items-center gap-3">
                {lastSyncedAt && (
                  <button
                    type="button"
                    onClick={() => syncFromServer(false)}
                    className="cursor-pointer inline-flex items-center gap-1 text-indigo-800 hover:underline font-mono text-[10px]"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    Synced {lastSyncedAt}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="cursor-pointer font-bold text-rose-700 hover:underline"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Status / Error Alert Banner */}
        {bannerAlert && (
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4">
            <div
              role="alert"
              className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
                bannerAlert.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {bannerAlert.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                )}
                <span>{bannerAlert.message}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss alert"
                onClick={() => setBannerAlert(null)}
                className="cursor-pointer p-1 rounded hover:bg-black/5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {currentTab === 'student' && (
            <StudentPortal
              activeSession={activeSession}
              onUpdateSession={handleUpdateSession}
              attendanceRecords={attendanceRecords}
              students={students}
              schedule={schedule}
              currentUser={activeUser}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onNavigateSchedule={() => setCurrentTab('schedule')}
              onNavigateInfo={() => setCurrentTab('info')}
              onNavigateMap={() => setCurrentTab('map')}
              onNavigateCR={() => setCurrentTab('cr')}
              onAddRecord={handleAddRecord}
              onCRFinalDecision={handleCRFinalDecision}
              onCRBulkFinalDecision={handleCRBulkFinalDecision}
              onOpenReceipt={(record) => setSelectedReceipt(record)}
            />
          )}

          {currentTab === 'cr' && isCRUser && (
            <CRPortal
              activeSession={activeSession}
              onUpdateSession={handleUpdateSession}
              attendanceRecords={attendanceRecords}
              students={students}
              onAddRecord={handleAddRecord}
              onCRFinalDecision={handleCRFinalDecision}
              onCRBulkFinalDecision={handleCRBulkFinalDecision}
              onToggleOverride={handleToggleOverride}
              onOpenProjector={() => setCurrentTab('projector')}
              onOpenReceipt={(record) => setSelectedReceipt(record)}
              onManageRoster={() => setCurrentTab('roster')}
            />
          )}

          {currentTab === 'schedule' && (
            <ClassSchedulePanel
              schedule={schedule}
              activeSession={activeSession}
              currentUserRole={activeUser.role}
              currentStudentRoll={activeUser.rollNo}
              onUpdateSchedule={handleUpdateSchedule}
              onRenewSlotAttendance={handleRenewSlotAttendance}
              onSelectSlotForCheckIn={(slot) => {
                handleRenewSlotAttendance(slot);
                setCurrentTab('student');
              }}
            />
          )}

          {currentTab === 'info' && (
            <InformationPanel
              notices={notices}
              currentUserRole={activeUser.role}
              currentUserName={activeUser.name}
              currentStudentRoll={activeUser.rollNo}
              students={students}
              schedule={schedule}
              onAddNotice={handleAddNotice}
              onEditNotice={handleEditNotice}
              onDeleteNotice={handleDeleteNotice}
              onTogglePin={handleTogglePinNotice}
              onNavigateSchedule={() => setCurrentTab('schedule')}
              onNavigateAttendance={() => setCurrentTab('student')}
            />
          )}

          {currentTab === 'roster' && isPrivilegedUser && (
            <StudentRosterManager
              students={students}
              canManageCR={isCRUser}
              onAddStudent={handleAddStudent}
              onUpdateStudent={handleUpdateStudent}
              onBulkAddStudents={handleBulkAddStudents}
              onReplaceStudents={handleReplaceStudents}
              onToggleCR={handleToggleCR}
              onDeleteStudent={handleDeleteStudent}
            />
          )}

          {currentTab === 'workspace' && isPrivilegedUser && (
            <GoogleWorkspacePanel
              records={attendanceRecords}
              schedule={schedule}
              isFullAccess={isPrivilegedUser}
            />
          )}

          {currentTab === 'map' && (
            <GoogleCampusMap
              geofence={geofenceForMap}
              isStudent={activeUser.role === 'student'}
              userCoords={
                simulatedCoords
                  ? { lat: simulatedCoords.lat, lng: simulatedCoords.lon }
                  : null
              }
              onSelectCoords={(lat, lng) => {
                setSimulatedCoords({
                  lat,
                  lon: lng,
                  name: 'Selected Campus Map Point',
                });
              }}
            />
          )}

          {currentTab === 'faculty' && isPrivilegedUser && (
            <FacultyDashboard
              activeSession={activeSession}
              onUpdateSession={handleUpdateSession}
              attendanceRecords={attendanceRecords}
              students={students}
              onToggleOverride={handleToggleOverride}
              onOpenProjector={() => setCurrentTab('projector')}
              onOpenReceipt={(record) => setSelectedReceipt(record)}
              onManageRoster={() => setCurrentTab('roster')}
            />
          )}

          {currentTab === 'analytics' && (
            <AnalyticsDashboard
              attendanceRecords={attendanceRecords}
              students={students}
              currentUser={activeUser}
            />
          )}

          {currentTab === 'radar' && (
            <CampusRadar
              onSelectTestLocation={handleSelectTestLocation}
              currentDistanceKm={0.04}
            />
          )}

          {currentTab === 'projector' && isPrivilegedUser && (
            <ProjectorMode
              activeSession={activeSession}
              attendanceRecords={attendanceRecords}
              students={students}
              onExit={() => setCurrentTab('faculty')}
            />
          )}
        </main>

        {currentTab !== 'projector' && (
          <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-5 px-4 sm:px-6 lg:px-8 mt-12">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">
                  Central University of Karnataka (CUK)
                </span>
                <span>·</span>
                <span>Department of Chemistry, School of Chemical Sciences</span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => syncFromServer(false)}
                  className="cursor-pointer inline-flex items-center gap-1 text-indigo-600 hover:underline font-medium"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  {lastSyncedAt ? `Synced ${lastSyncedAt}` : 'Sync Now'}
                </button>
                <span>·</span>
                <span className="font-mono">17.4320° N, 76.6710° E (500m Radius)</span>
              </div>
            </div>
          </footer>
        )}

        <AttendanceReceiptModal
          record={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />

        <AcademicChatbot
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          currentUser={activeUser}
          onLogin={handleLogin}
          onLogout={handleLogout}
          students={students}
          requireAuth={false}
        />
      </div>
    </ThemeProvider>
  );
}

export default App;
