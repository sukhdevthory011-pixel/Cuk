import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserCheck,
  GraduationCap,
  KeyRound,
  X,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Star,
  Smartphone,
  Mail,
  Send,
  RefreshCw,
  ArrowRight,
  Lock,
  Loader2,
} from 'lucide-react';
import { AuthUser, UserRole, StudentProfile } from '../types/attendance';
import { STUDENT_ROSTER, FACULTY_ROSTER } from '../data/mockData';
import { portalApi, setAuthToken } from '../utils/apiClient';
import { ThemeSwitcher } from '../context/ThemeContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onLogin: (user: AuthUser) => void;
  onLogout: () => void;
  students?: StudentProfile[];
  requireAuth?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogin,
  students = STUDENT_ROSTER,
  requireAuth = false,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(
    currentUser?.role || 'student'
  );

  // Specific ID inputs for the 3 options
  const [studentRollInput, setStudentRollInput] = useState<string>(
    currentUser?.rollNo || '26ugchem001'
  );
  const [crRollInput, setCrRollInput] = useState<string>('26ugchem001');
  const [facultyIdInput, setFacultyIdInput] = useState<string>(
    currentUser?.facultyId || 'facche001'
  );

  // Server OTP flow states
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [sandboxOtp, setSandboxOtp] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resolvedTargetInfo, setResolvedTargetInfo] = useState<{
    name: string;
    email?: string;
    phone?: string;
    id: string;
    isCR?: boolean;
  } | null>(null);

  const crList = students.filter((s) => s.isCR);

  // Close on Escape when not locked in mandatory auth gate
  useEffect(() => {
    if (!isOpen || requireAuth) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, requireAuth, onClose]);

  if (!isOpen) return null;

  const resetOtpFlow = (newRole?: UserRole) => {
    if (newRole) setSelectedRole(newRole);
    setOtpSent(false);
    setSandboxOtp('');
    setOtpInput('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setResolvedTargetInfo(null);
  };

  const getActiveInputId = () => {
    if (selectedRole === 'student') return studentRollInput.trim();
    if (selectedRole === 'cr') return crRollInput.trim();
    return facultyIdInput.trim();
  };

  // Step 1: Request Server-Generated OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const activeId = getActiveInputId();
    if (!activeId) {
      setErrorMsg('Please enter or select a valid University ID.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await portalApi.requestLoginOtp(selectedRole, activeId);
      setResolvedTargetInfo({
        id: res.userId,
        name: res.name,
        email: res.email,
        phone: res.phone,
        isCR: res.isCR,
      });
      setSandboxOtp(res.sandboxOtp || '');
      setOtpInput('');
      setOtpSent(true);
      setSuccessMsg(`Server generated a 6-digit OTP for ${res.name} (${res.userId}).`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not request OTP from server.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP on Server & Issue Session Token
  const handleVerifyOtpAndLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const activeId = resolvedTargetInfo?.id || getActiveInputId();
    if (!otpInput.trim() || otpInput.trim().length !== 6) {
      setErrorMsg('Please enter the 6-digit OTP code.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await portalApi.verifyLoginOtp(selectedRole, activeId, otpInput.trim());
      setAuthToken(res.token);
      onLogin(res.user);
      if (!requireAuth) {
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'OTP verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-portal-title"
      className={`${
        requireAuth
          ? 'min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-slate-50 dark:bg-slate-950'
          : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs'
      }`}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm shrink-0">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="auth-portal-title" className="text-base sm:text-lg font-bold tracking-tight truncate">
                  {requireAuth ? 'Central University of Karnataka · Portal Sign-In' : 'Switch Role via Server OTP'}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  Server Verified
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                Department of Chemistry · Role-Scoped Attendance System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeSwitcher compact variant="darkHeader" />
            {!requireAuth && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close authentication dialog"
                className="cursor-pointer p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Notice Banner */}
        <div className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 px-5 py-2.5 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              <strong>Demo Mode Active:</strong> Uses fictional IDs (no real student personal data).
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-500 hidden sm:inline">
            OTP Valid: 5m
          </span>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* 3-ROLE SELECTOR */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
              1. Select Portal Access Role
            </label>
            <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Portal Access Role">
              {/* OPTION 1: STUDENT */}
              <button
                type="button"
                role="radio"
                aria-checked={selectedRole === 'student'}
                onClick={() => resetOtpFlow('student')}
                className={`cursor-pointer p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  selectedRole === 'student'
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-xs ring-2 ring-indigo-600/15'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <GraduationCap
                    className={`w-5 h-5 ${
                      selectedRole === 'student' ? 'text-indigo-600' : 'text-slate-400'
                    }`}
                  />
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    Option 1
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs sm:text-sm">Student</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                    Check-in & own history
                  </div>
                </div>
              </button>

              {/* OPTION 2: CR */}
              <button
                type="button"
                role="radio"
                aria-checked={selectedRole === 'cr'}
                onClick={() => resetOtpFlow('cr')}
                className={`cursor-pointer p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  selectedRole === 'cr'
                    ? 'border-amber-500 bg-amber-50/80 text-amber-950 shadow-xs ring-2 ring-amber-500/20'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <Star
                    className={`w-5 h-5 ${
                      selectedRole === 'cr' ? 'text-amber-500 fill-amber-500' : 'text-slate-400'
                    }`}
                  />
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                    Option 2
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs sm:text-sm">CR Portal</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                    Class Representative
                  </div>
                </div>
              </button>

              {/* OPTION 3: FACULTY */}
              <button
                type="button"
                role="radio"
                aria-checked={selectedRole === 'faculty'}
                onClick={() => resetOtpFlow('faculty')}
                className={`cursor-pointer p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  selectedRole === 'faculty'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 shadow-xs ring-2 ring-emerald-600/15'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <UserCheck
                    className={`w-5 h-5 ${
                      selectedRole === 'faculty' ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  />
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Option 3
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs sm:text-sm">Faculty</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                    Course Instructor
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Role Access Scope Summary */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              {selectedRole === 'student' && (
                <span>
                  <strong>Student Scope:</strong> Server restricts access to your own attendance history, digital receipts, and live check-in. Other students&apos; records are private.
                </span>
              )}
              {selectedRole === 'cr' && (
                <span>
                  <strong>Class Representative Scope:</strong> Authorized to coordinate class sessions, verify attendance registers, and switch between Student, CR, and Faculty views.
                </span>
              )}
              {selectedRole === 'faculty' && (
                <span>
                  <strong>Faculty Scope:</strong> Manage live lecture passcodes, geofence calibration, attendance registers, roster profiles, and CSV/PDF reports.
                </span>
              )}
            </div>
          </div>

          {/* STEP 2: ENTER SPECIFIC ID FOR SELECTED ROLE */}
          <form onSubmit={otpSent ? handleVerifyOtpAndLogin : handleSendOtp} className="space-y-4">
            {selectedRole === 'student' && (
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label htmlFor="student-id-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    2. Student Roll Number / ID
                  </label>
                  <span className="text-[11px] text-indigo-600 font-semibold">
                    Demo IDs: 26ugchem001 – 012
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    id="student-id-input"
                    type="text"
                    value={studentRollInput}
                    disabled={otpSent || isLoading}
                    onChange={(e) => {
                      setStudentRollInput(e.target.value);
                      setOtpSent(false);
                    }}
                    placeholder="e.g. 26ugchem001"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-60"
                  />

                  <select
                    aria-label="Quick select demo student"
                    value={
                      students.some(
                        (s) => s.rollNo.toLowerCase() === studentRollInput.trim().toLowerCase()
                      )
                        ? students.find(
                            (s) => s.rollNo.toLowerCase() === studentRollInput.trim().toLowerCase()
                          )?.rollNo
                        : ''
                    }
                    disabled={otpSent || isLoading}
                    onChange={(e) => {
                      if (e.target.value) {
                        setStudentRollInput(e.target.value);
                        setOtpSent(false);
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-60"
                  >
                    <option value="">-- Quick Select Demo Student --</option>
                    {students.map((s) => (
                      <option key={s.rollNo} value={s.rollNo}>
                        {s.rollNo} · {s.name} {s.isCR ? '(CR)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {selectedRole === 'cr' && (
              <div className="space-y-3 bg-amber-50/50 p-4 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between">
                  <label htmlFor="cr-id-input" className="block text-xs font-bold text-amber-950 uppercase tracking-wider">
                    2. Class Representative (CR) ID
                  </label>
                  <span className="text-[11px] font-bold text-amber-800">
                    Demo CRs: 26ugchem001, 26ugchem004
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    id="cr-id-input"
                    type="text"
                    value={crRollInput}
                    disabled={otpSent || isLoading}
                    onChange={(e) => {
                      setCrRollInput(e.target.value);
                      setOtpSent(false);
                    }}
                    placeholder="e.g. 26ugchem001"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-amber-300 bg-white text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                  />

                  <select
                    aria-label="Quick select demo CR"
                    value={
                      crList.some((s) => s.rollNo.toLowerCase() === crRollInput.trim().toLowerCase())
                        ? crList.find((s) => s.rollNo.toLowerCase() === crRollInput.trim().toLowerCase())?.rollNo
                        : ''
                    }
                    disabled={otpSent || isLoading}
                    onChange={(e) => {
                      if (e.target.value) {
                        setCrRollInput(e.target.value);
                        setOtpSent(false);
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                  >
                    <option value="">-- Select Designated CR --</option>
                    {crList.map((s) => (
                      <option key={s.rollNo} value={s.rollNo}>
                        {s.rollNo} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {selectedRole === 'faculty' && (
              <div className="space-y-3 bg-emerald-50/40 p-4 rounded-xl border border-emerald-200">
                <div className="flex items-center justify-between">
                  <label htmlFor="faculty-id-input" className="block text-xs font-bold text-emerald-950 uppercase tracking-wider">
                    2. Faculty ID (or CR Dual-Access ID)
                  </label>
                  <span className="text-[11px] font-bold text-emerald-800">
                    Demo IDs: facche001 – 003
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    id="faculty-id-input"
                    type="text"
                    value={facultyIdInput}
                    disabled={otpSent || isLoading}
                    onChange={(e) => {
                      setFacultyIdInput(e.target.value);
                      setOtpSent(false);
                    }}
                    placeholder="e.g. facche001"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-emerald-300 bg-white text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-60"
                  />

                  <select
                    aria-label="Quick select demo faculty"
                    value={facultyIdInput}
                    disabled={otpSent || isLoading}
                    onChange={(e) => {
                      if (e.target.value) {
                        setFacultyIdInput(e.target.value);
                        setOtpSent(false);
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border border-emerald-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-60"
                  >
                    <optgroup label="Chemistry Faculty">
                      {FACULTY_ROSTER.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.id} · {f.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="CR Dual Login">
                      {crList.map((c) => (
                        <option key={c.rollNo} value={c.rollNo}>
                          {c.rollNo} · {c.name} (CR)
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>
            )}

            {/* STEP 3: SERVER OTP GENERATION & VERIFICATION */}
            {!otpSent ? (
              <button
                type="submit"
                disabled={isLoading}
                className={`cursor-pointer w-full py-3 px-4 rounded-xl font-bold text-sm text-white shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                  selectedRole === 'cr'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : selectedRole === 'faculty'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Requesting Server OTP...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Request 6-Digit Verification OTP
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Sandbox OTP Dispatch Box */}
                <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" />
                      Server OTP Generated (Sandbox Test Mode)
                    </span>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={handleSendOtp}
                      className="cursor-pointer text-[11px] text-slate-300 hover:text-white flex items-center gap-1 underline"
                    >
                      <RefreshCw className="w-3 h-3" /> Resend OTP
                    </button>
                  </div>

                  {resolvedTargetInfo && (
                    <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        Account: <strong className="text-white">{resolvedTargetInfo.name}</strong> ({resolvedTargetInfo.id})
                      </span>
                      {resolvedTargetInfo.email && (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Mail className="w-3 h-3 text-indigo-400" /> {resolvedTargetInfo.email}
                        </span>
                      )}
                    </div>
                  )}

                  {sandboxOtp && (
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          Test Mode One-Time Passcode (Server Verified):
                        </span>
                        <span className="font-mono font-black text-2xl tracking-widest text-amber-400">
                          {sandboxOtp}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOtpInput(sandboxOtp)}
                        className="cursor-pointer px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
                      >
                        Auto-Fill Test OTP
                      </button>
                    </div>
                  )}
                </div>

                {/* Enter OTP Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="otp-code-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      3. Enter 6-Digit Verification OTP
                    </label>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="cursor-pointer text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      Change ID
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="otp-code-input"
                      type="text"
                      maxLength={6}
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter 6-digit OTP"
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-slate-50 text-lg font-mono font-black tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otpInput.length !== 6}
                  className="cursor-pointer w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying OTP with Server...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Verify OTP & Sign In as {selectedRole.toUpperCase()}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && !errorMsg && (
              <div
                role="status"
                className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
