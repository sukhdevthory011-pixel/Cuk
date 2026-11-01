import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Mail, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Send, 
  Plus, 
  RefreshCw, 
  Lock, 
  LogOut, 
  Clock, 
  User, 
  ShieldCheck,
  ChevronRight,
  Download,
  CalendarCheck
} from 'lucide-react';
import { 
  initAuth, 
  googleSignIn, 
  logoutGoogle, 
  getAccessToken 
} from '../services/googleAuth';
import { 
  createAttendanceSpreadsheet, 
  sendGmailMessage, 
  createGoogleCalendarEvent, 
  listUpcomingCalendarEvents,
  SpreadsheetExportResult,
  CalendarEventPayload
} from '../services/workspaceApi';
import { AttendanceRecord, ClassScheduleSlot } from '../types/attendance';

interface GoogleWorkspacePanelProps {
  records: AttendanceRecord[];
  schedule: ClassScheduleSlot[];
  isFullAccess: boolean;
}

export const GoogleWorkspacePanel: React.FC<GoogleWorkspacePanelProps> = ({
  records,
  schedule,
  isFullAccess,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'sheets' | 'gmail' | 'calendar'>('sheets');
  const [googleUser, setGoogleUser] = useState<any | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sheets state
  const [sheetTitle, setSheetTitle] = useState(`CUK Chemistry Attendance - ${new Date().toISOString().slice(0, 10)}`);
  const [isExportingSheet, setIsExportingSheet] = useState(false);
  const [lastSheetResult, setLastSheetResult] = useState<SpreadsheetExportResult | null>(null);
  const [sheetSuccessMessage, setSheetSuccessMessage] = useState<string | null>(null);

  // Gmail state
  const [recipientEmail, setRecipientEmail] = useState('hod.chemistry@demo.university.edu');
  const [emailSubject, setEmailSubject] = useState('CUK Chemistry Attendance Report & Lecture Update');
  const [emailTemplate, setEmailTemplate] = useState<'report' | 'absence' | 'announcement'>('report');
  const [customMessage, setCustomMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSuccessMessage, setEmailSuccessMessage] = useState<string | null>(null);

  // Calendar state
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [isSyncingSchedule, setIsSyncingSchedule] = useState(false);
  const [calendarSuccessMessage, setCalendarSuccessMessage] = useState<string | null>(null);

  // Modal Confirmation states (MANDATORY per Workspace skill for mutating operations)
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{
    type: 'sheets' | 'gmail' | 'calendar';
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Initialize auth state listener on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
      },
      () => {
        setGoogleUser(null);
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Update default email message when template changes
  useEffect(() => {
    const presentCount = records.filter(r => r.verified).length;
    const totalCount = records.length;
    const percentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

    if (emailTemplate === 'report') {
      setEmailSubject(`Department of Chemistry Attendance Summary - ${new Date().toLocaleDateString()}`);
      setCustomMessage(
        `Dear Faculty & Scholars,\n\nHere is the verified attendance summary for today's Department of Chemistry sessions at Central University of Karnataka:\n\n` +
        `• Total Submissions: ${totalCount}\n` +
        `• Verified Present: ${presentCount} (${percentage}%)\n` +
        `• Department: Central University of Karnataka, School of Chemical Sciences\n\n` +
        `All records have been authenticated via Geofence + OTP validation.\n\nRegards,\nCUK Chemistry Portal`
      );
    } else if (emailTemplate === 'absence') {
      setEmailSubject('Important: Attendance Notice - Department of Chemistry');
      setCustomMessage(
        `Dear Student,\n\nOur attendance records indicate that you were absent or have not verified your attendance for the recent Chemistry lecture period.\n\n` +
        `Please ensure you check in using your registered Roll Number and Teacher Passcode before the one-hour lockout window expires.\n\n` +
        `Regards,\nCourse Representative & Faculty Desk`
      );
    } else {
      setEmailSubject('Urgent Department Notice: Schedule & Lab Timings');
      setCustomMessage(
        `Attention M.Sc Chemistry Scholars,\n\nPlease note the updated lecture and laboratory schedule for the week. All sessions will be held in LH-101 and the CIF Analytical Suite.\n\n` +
        `Timetable updates have been synchronized with the campus portal.\n\nRegards,\nDepartment of Chemistry`
      );
    }
  }, [emailTemplate, records]);

  // Load calendar events if authenticated
  useEffect(() => {
    if (googleUser && activeSubTab === 'calendar') {
      loadCalendarEvents();
    }
  }, [googleUser, activeSubTab]);

  const loadCalendarEvents = async () => {
    try {
      setLoadingCalendar(true);
      const events = await listUpcomingCalendarEvents();
      setCalendarEvents(events);
    } catch (err: any) {
      console.warn('Could not load calendar events:', err.message);
    } finally {
      setLoadingCalendar(false);
    }
  };

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Failed to sign in with Google');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setLastSheetResult(null);
    setCalendarEvents([]);
  };

  // -------------------------------------------------------------
  // Mutating Action Handlers with Confirmation Modal
  // -------------------------------------------------------------

  const promptExportSheets = () => {
    setPendingConfirmAction({
      type: 'sheets',
      title: 'Export Attendance to Google Sheets',
      description: `This will create a new Google Spreadsheet titled "${sheetTitle}" in your Google Drive and write ${records.length} authenticated attendance records.`,
      onConfirm: async () => {
        setIsExportingSheet(true);
        setSheetSuccessMessage(null);
        try {
          const result = await createAttendanceSpreadsheet(sheetTitle, records);
          setLastSheetResult(result);
          setSheetSuccessMessage(`Successfully created spreadsheet with ${result.rowsInserted} records!`);
        } catch (err: any) {
          setAuthError(`Google Sheets error: ${err.message}`);
        } finally {
          setIsExportingSheet(false);
        }
      },
    });
  };

  const promptSendEmail = () => {
    if (!recipientEmail) {
      setAuthError('Please enter a recipient email address.');
      return;
    }
    setPendingConfirmAction({
      type: 'gmail',
      title: 'Send Email via Gmail API',
      description: `Are you sure you want to send this email to "${recipientEmail}" from your connected Gmail account (${googleUser?.email})?`,
      onConfirm: async () => {
        setIsSendingEmail(true);
        setEmailSuccessMessage(null);
        try {
          await sendGmailMessage({
            to: recipientEmail,
            subject: emailSubject,
            bodyText: customMessage,
          });
          setEmailSuccessMessage(`Email successfully dispatched via your Gmail account to ${recipientEmail}!`);
        } catch (err: any) {
          alert(`Gmail API error: ${err.message}`);
        } finally {
          setIsSendingEmail(false);
        }
      },
    });
  };

  const promptSyncCalendar = (slot?: ClassScheduleSlot) => {
    const slotsToSync = slot ? [slot] : schedule;
    setPendingConfirmAction({
      type: 'calendar',
      title: 'Sync Timetable to Google Calendar',
      description: `This will create ${slotsToSync.length} event(s) in your primary Google Calendar with location set to "Central University of Karnataka - Chemistry Department LH-101".`,
      onConfirm: async () => {
        setIsSyncingSchedule(true);
        setCalendarSuccessMessage(null);
        try {
          const today = new Date();
          const todayYMD = today.toISOString().slice(0, 10);

          for (const s of slotsToSync) {
            const startIso = `${todayYMD}T${s.startTime}:00`;
            const endIso = `${todayYMD}T${s.endTime}:00`;

            const payload: CalendarEventPayload = {
              summary: `${s.subject} - ${s.periodName}`,
              description: `Lecture Period: ${s.periodName}\nInstructor: ${s.facultyName}\nRoom: ${s.room}\nCentral University of Karnataka, Department of Chemistry`,
              location: `Department of Chemistry, ${s.room}, Central University of Karnataka`,
              startTime: new Date(startIso).toISOString(),
              endTime: new Date(endIso).toISOString(),
            };

            await createGoogleCalendarEvent(payload);
          }

          setCalendarSuccessMessage(`Synced ${slotsToSync.length} lecture period(s) to your Google Calendar!`);
          await loadCalendarEvents();
        } catch (err: any) {
          alert(`Calendar API error: ${err.message}`);
        } finally {
          setIsSyncingSchedule(false);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" /> 1P Google Workspace Suite
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Official Google Sheets · Gmail · Google Calendar
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-2">
              Google Workspace Integrations Hub
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Connect your Google account to export attendance sheets directly to Drive, dispatch automated Gmail alerts, and sync lecture schedules to Calendar.
            </p>
          </div>

          {/* Google Auth Status / Button */}
          <div>
            {!googleUser ? (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isLoggingIn}
                className="inline-flex items-center gap-3 px-5 py-2.5 bg-white border border-slate-300 rounded-xl font-medium text-slate-700 text-sm shadow-xs hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                <span>{isLoggingIn ? 'Connecting...' : 'Sign in with Google'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                {googleUser.photoURL ? (
                  <img src={googleUser.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-200" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                    {googleUser.displayName?.charAt(0) || 'G'}
                  </div>
                )}
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-900 leading-tight">{googleUser.displayName || 'Google Account'}</p>
                  <p className="text-[11px] text-slate-500 leading-tight truncate max-w-[150px]">{googleUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Sign out from Google Workspace"
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer ml-1"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {authError && (
          <div className="mt-4 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-6 pt-3 gap-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('sheets')}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'sheets'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Google Sheets</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">
            Export & Drive
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('gmail')}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'gmail'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Gmail</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">
            Alerts & Reports
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('calendar')}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'calendar'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Google Calendar</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">
            Timetable Sync
          </span>
        </button>
      </div>

      {/* Tab 1: Google Sheets */}
      {activeSubTab === 'sheets' && (
        <div className="bg-white rounded-b-2xl border-x border-b border-slate-200 p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Direct Google Sheets Attendance Export
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Creates a formatted spreadsheet in your Google Drive with student roll numbers, timestamps, and geofence verification logs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                {records.length} records ready
              </span>
              <button
                type="button"
                onClick={googleUser ? promptExportSheets : handleSignIn}
                disabled={isExportingSheet || records.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" />
                {isExportingSheet ? 'Generating Sheet...' : 'Export to Google Sheets'}
              </button>
            </div>
          </div>

          {sheetSuccessMessage && (
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{sheetSuccessMessage}</span>
              </div>
              {lastSheetResult && (
                <a
                  href={lastSheetResult.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <span>Open in Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {/* SpreadSheet Configuration Form */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Spreadsheet Title
              </label>
              <input
                type="text"
                value={sheetTitle}
                onChange={(e) => setSheetTitle(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. CUK Chemistry Attendance 2026"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Target Sheet Name
              </label>
              <input
                type="text"
                disabled
                value="Attendance Records (Default)"
                className="w-full text-xs px-3 py-2 bg-slate-100 text-slate-500 rounded-lg border border-slate-200 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Records Preview Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Previewing Data for Google Sheets</span>
              <span className="text-slate-500 font-normal">Last 5 records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2">Timestamp</th>
                    <th className="px-4 py-2">Roll Number</th>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Subject</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Geofence Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {records.slice(0, 5).map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2 text-slate-500">{new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-2 font-mono font-bold text-slate-900">{rec.rollNo}</td>
                      <td className="px-4 py-2">{rec.studentName}</td>
                      <td className="px-4 py-2">{rec.subject}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                          {rec.verified ? 'PRESENT' : 'ABSENT'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {rec.distanceKm <= 1.5 ? 'Inside Zone (< 1.5km)' : 'Override'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Gmail */}
      {activeSubTab === 'gmail' && (
        <div className="bg-white rounded-b-2xl border-x border-b border-slate-200 p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Official Gmail Notification Dispatcher
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Send verified attendance summaries, student absence notifications, and urgent faculty memos directly via the Gmail API.
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-500 font-medium">
                Sent from: <strong className="text-slate-800">{googleUser?.email || 'Sign in required'}</strong>
              </span>
            </div>
          </div>

          {emailSuccessMessage && (
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">{emailSuccessMessage}</span>
            </div>
          )}

          {/* Template Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setEmailTemplate('report')}
              className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                emailTemplate === 'report'
                  ? 'border-rose-400 bg-rose-50/60 ring-2 ring-rose-200'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="text-xs font-bold text-slate-900">Daily Attendance Summary</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Sends full class statistics and compliance report</p>
            </button>

            <button
              type="button"
              onClick={() => setEmailTemplate('absence')}
              className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                emailTemplate === 'absence'
                  ? 'border-rose-400 bg-rose-50/60 ring-2 ring-rose-200'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="text-xs font-bold text-slate-900">Absence Reminder</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Alerts students about pending lecture verification</p>
            </button>

            <button
              type="button"
              onClick={() => setEmailTemplate('announcement')}
              className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                emailTemplate === 'announcement'
                  ? 'border-rose-400 bg-rose-50/60 ring-2 ring-rose-200'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="text-xs font-bold text-slate-900">Department Memo</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Broadcasts lab & timetable adjustments</p>
            </button>
          </div>

          {/* Email Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder="student@cuk.ac.in or faculty@cuk.ac.in"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Subject Line
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Email Body
              </label>
              <textarea
                rows={6}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 font-sans"
              />
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={googleUser ? promptSendEmail : handleSignIn}
                disabled={isSendingEmail}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                {isSendingEmail ? 'Dispatching...' : 'Confirm & Send via Gmail'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Google Calendar */}
      {activeSubTab === 'calendar' && (
        <div className="bg-white rounded-b-2xl border-x border-b border-slate-200 p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Class Timetable to Google Calendar Sync
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically populates your Google Calendar with Chemistry Department lecture slots, room locations (LH-101 / CIF), and instructor names.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={googleUser ? () => promptSyncCalendar() : handleSignIn}
                disabled={isSyncingSchedule}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60"
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                {isSyncingSchedule ? 'Scheduling...' : "Sync Today's Timetable to Calendar"}
              </button>
            </div>
          </div>

          {calendarSuccessMessage && (
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 text-blue-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-medium">{calendarSuccessMessage}</span>
            </div>
          )}

          {/* Today's Schedule Ready to Sync */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Department Timetable Slots (Ready to Schedule)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {schedule.map((slot) => (
                <div
                  key={slot.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-sm border border-blue-200">
                        {slot.startTime} - {slot.endTime}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-500">Period {slot.periodNumber}</span>
                    </div>
                    <h5 className="text-xs font-bold text-slate-900">{slot.subject}</h5>
                    <p className="text-[11px] text-slate-500 mt-1">Instructor: {slot.facultyName}</p>
                    <p className="text-[11px] text-slate-500">Venue: {slot.room}</p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 flex justify-end">
                    <button
                      type="button"
                      onClick={googleUser ? () => promptSyncCalendar(slot) : handleSignIn}
                      className="text-xs text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Add this slot</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* User's Upcoming Events from Google Calendar */}
          {googleUser && (
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Upcoming Events in Your Connected Google Calendar
                </h4>
                <button
                  type="button"
                  onClick={loadCalendarEvents}
                  disabled={loadingCalendar}
                  className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingCalendar ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {loadingCalendar ? (
                <p className="text-xs text-slate-500">Loading events from Google Calendar...</p>
              ) : calendarEvents.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No upcoming events found on primary calendar.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {calendarEvents.map((ev) => (
                    <div key={ev.id} className="p-3 bg-white flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-900">{ev.summary}</p>
                        <p className="text-[11px] text-slate-500">
                          {ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleString() : ev.start?.date || 'All Day'}
                        </p>
                      </div>
                      {ev.htmlLink && (
                        <a
                          href={ev.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-[11px] inline-flex items-center gap-1 font-medium"
                        >
                          <span>Open in Calendar</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mandatory User Confirmation Modal for Mutating / Destructive Operations */}
      {pendingConfirmAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  pendingConfirmAction.type === 'sheets'
                    ? 'bg-emerald-100 text-emerald-600'
                    : pendingConfirmAction.type === 'gmail'
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-blue-100 text-blue-600'
                }`}
              >
                {pendingConfirmAction.type === 'sheets' ? (
                  <FileSpreadsheet className="w-5 h-5" />
                ) : pendingConfirmAction.type === 'gmail' ? (
                  <Mail className="w-5 h-5" />
                ) : (
                  <Calendar className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {pendingConfirmAction.title}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Google Workspace Permission Check</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              {pendingConfirmAction.description}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingConfirmAction(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const action = pendingConfirmAction.onConfirm;
                  setPendingConfirmAction(null);
                  await action();
                }}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-colors cursor-pointer ${
                  pendingConfirmAction.type === 'sheets'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : pendingConfirmAction.type === 'gmail'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Confirm & Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
