import { ActiveSession, AttendanceRecord, ChemistrySubject, StudentProfile } from '../types/attendance';
import { getDailyCode } from './geo';

/**
 * Escapes a value for RFC-4180 compliant CSV output.
 */
function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Triggers a browser file download of a UTF-8 CSV with BOM for Excel/Sheets compatibility.
 */
function triggerCsvDownload(csvLines: string[], filename: string): void {
  const csvString = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export interface RosterSessionExportOptions {
  students: StudentProfile[];
  attendanceRecords: AttendanceRecord[];
  activeSession: ActiveSession | null;
  subject?: ChemistrySubject | string;
  dateString?: string;
  exportedBy?: string;
}

/**
 * Exports the complete student roster combined with current session attendance status
 * and cumulative attendance metrics for Faculty and CR record-keeping.
 */
export function exportRosterAndSessionCSV(options: RosterSessionExportOptions): {
  filename: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  pendingCount: number;
  unmarkedCount: number;
} {
  const {
    students,
    attendanceRecords,
    activeSession,
    subject,
    dateString,
    exportedBy = 'Department of Chemistry Portal',
  } = options;

  const targetSubject =
    subject && subject !== 'All'
      ? subject
      : activeSession?.subject || 'Organic Chemistry';

  const targetDate =
    dateString && dateString !== 'All'
      ? dateString
      : activeSession?.startTime
      ? new Date(activeSession.startTime).toDateString()
      : new Date().toDateString();

  const sessionCode = activeSession?.code || getDailyCode();
  const sessionRoom = activeSession?.room || 'Lecture Hall CH-101';
  const sessionFaculty = activeSession?.facultyName || 'Dr. V. Ramanathan';

  // Compute total distinct sessions recorded in the portal for cumulative % calculation
  const distinctSessionKeys = new Set(
    attendanceRecords.map((r) => `${r.dateString}__${r.subject}`)
  );
  const totalRecordedSessions = Math.max(1, distinctSessionKeys.size);

  const headers = [
    'Roll Number',
    'Student Name',
    'Role',
    'Semester',
    'Batch',
    'Institutional Email',
    'Session Date',
    'Course Subject',
    'Classroom / Venue',
    'Session Passcode',
    'Session Attendance Status',
    'Check-In Time',
    'Proximity Distance (m)',
    'GPS Accuracy (m)',
    'Check-In Mode',
    'Verified / Decided By',
    'Session Remarks',
    'Verification Receipt Hash',
    'Subject Sessions Attended',
    'Overall Sessions Attended',
    'Overall Attendance (%)',
    'Exported By',
  ];

  let presentCount = 0;
  let absentCount = 0;
  let pendingCount = 0;
  let unmarkedCount = 0;

  const sortedStudents = [...students].sort((a, b) =>
    a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true })
  );

  const rows = sortedStudents.map((student) => {
    const sessionRecord = attendanceRecords.find(
      (r) =>
        r.rollNo.toLowerCase() === student.rollNo.toLowerCase() &&
        r.dateString === targetDate &&
        r.subject === targetSubject
    );

    let attendanceStatus = 'NOT MARKED';
    if (sessionRecord) {
      if (sessionRecord.crDecision === 'rejected') {
        attendanceStatus = 'ABSENT';
        absentCount += 1;
      } else if (sessionRecord.crDecision === 'pending' || !sessionRecord.verified) {
        attendanceStatus = 'PENDING VERIFICATION';
        pendingCount += 1;
      } else {
        attendanceStatus = 'PRESENT';
        presentCount += 1;
      }
    } else {
      unmarkedCount += 1;
    }

    // Cumulative attendance counts for this student
    const studentVerifiedRecords = attendanceRecords.filter(
      (r) =>
        r.rollNo.toLowerCase() === student.rollNo.toLowerCase() &&
        r.verified &&
        r.crDecision !== 'rejected'
    );

    const subjectSessionsAttended = new Set(
      studentVerifiedRecords
        .filter((r) => r.subject === targetSubject)
        .map((r) => r.dateString)
    ).size;

    const overallSessionsAttended = new Set(
      studentVerifiedRecords.map((r) => `${r.dateString}__${r.subject}`)
    ).size;

    const overallPercentage = Math.min(
      100,
      Math.round((overallSessionsAttended / totalRecordedSessions) * 100)
    );

    const checkInTime = sessionRecord
      ? new Date(sessionRecord.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '—';

    const distanceMeters = sessionRecord
      ? Math.round(sessionRecord.distanceKm * 1000)
      : '';

    const accuracyMeters = sessionRecord ? sessionRecord.accuracyMeters : '';

    const checkInMode = sessionRecord
      ? sessionRecord.isSimulated
        ? 'Simulated / Manual Override'
        : 'Live Satellite GPS'
      : 'Not Checked In';

    const decidedBy = sessionRecord?.crDecidedBy
      ? sessionRecord.crDecidedBy
      : sessionRecord?.overrideByFaculty
      ? sessionRecord.overrideByFaculty
      : sessionRecord?.verified
      ? sessionFaculty
      : '—';

    const remarks =
      sessionRecord?.crRemark ||
      sessionRecord?.errorReport?.reason ||
      '';

    return [
      escapeCsvCell(student.rollNo),
      escapeCsvCell(student.name),
      escapeCsvCell(student.isCR ? 'Class Representative (CR)' : 'Student'),
      escapeCsvCell(student.semester),
      escapeCsvCell(student.batch),
      escapeCsvCell(student.email || `${student.rollNo.toLowerCase()}@cuk.ac.in`),
      escapeCsvCell(targetDate),
      escapeCsvCell(targetSubject),
      escapeCsvCell(sessionRoom),
      escapeCsvCell(sessionRecord?.codeUsed || sessionCode),
      escapeCsvCell(attendanceStatus),
      escapeCsvCell(checkInTime),
      escapeCsvCell(distanceMeters),
      escapeCsvCell(accuracyMeters),
      escapeCsvCell(checkInMode),
      escapeCsvCell(decidedBy),
      escapeCsvCell(remarks),
      escapeCsvCell(sessionRecord?.receiptHash || '—'),
      escapeCsvCell(subjectSessionsAttended),
      escapeCsvCell(`${overallSessionsAttended} / ${totalRecordedSessions}`),
      escapeCsvCell(`${overallPercentage}%`),
      escapeCsvCell(exportedBy),
    ].join(',');
  });

  const dateSlug = new Date().toISOString().split('T')[0];
  const subjectSlug = String(targetSubject)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const filename = `CUK_Chemistry_Roster_Session_${subjectSlug}_${dateSlug}.csv`;

  triggerCsvDownload([headers.map(escapeCsvCell).join(','), ...rows], filename);

  return {
    filename,
    totalStudents: sortedStudents.length,
    presentCount,
    absentCount,
    pendingCount,
    unmarkedCount,
  };
}

export interface SessionDataExportOptions {
  attendanceRecords: AttendanceRecord[];
  students: StudentProfile[];
  activeSession: ActiveSession | null;
  filterSubject?: string;
  filterDate?: string;
  exportedBy?: string;
}

/**
 * Exports detailed session attendance check-in records for Faculty and CR auditing.
 */
export function exportSessionAttendanceRecordsCSV(options: SessionDataExportOptions): {
  filename: string;
  recordCount: number;
} {
  const {
    attendanceRecords,
    students,
    activeSession,
    filterSubject = 'All',
    filterDate = 'All',
    exportedBy = 'Department of Chemistry Portal',
  } = options;

  const studentByRoll = new Map<string, StudentProfile>();
  students.forEach((s) => studentByRoll.set(s.rollNo.toLowerCase(), s));

  const filtered = attendanceRecords.filter((rec) => {
    const matchSub = filterSubject === 'All' || rec.subject === filterSubject;
    const matchDate = filterDate === 'All' || rec.dateString === filterDate;
    return matchSub && matchDate;
  });

  const headers = [
    'Record ID',
    'Date',
    'Check-In Timestamp',
    'Course Subject',
    'Classroom / Venue',
    'Session Passcode',
    'Roll Number',
    'Student Name',
    'Role',
    'Semester',
    'Batch',
    'Attendance Status',
    'Proximity Distance (m)',
    'GPS Accuracy (m)',
    'Telemetry Mode',
    'Verified / Approved By',
    'Remarks / Error Notes',
    'Verification Hash',
    'Exported By',
  ];

  const rows = filtered.map((rec) => {
    const profile = studentByRoll.get(rec.rollNo.toLowerCase());
    const status =
      rec.crDecision === 'rejected'
        ? 'ABSENT'
        : rec.crDecision === 'pending' || !rec.verified
        ? 'PENDING VERIFICATION'
        : 'PRESENT';

    const room =
      activeSession && activeSession.subject === rec.subject
        ? activeSession.room
        : 'Department of Chemistry';

    return [
      escapeCsvCell(rec.id),
      escapeCsvCell(rec.dateString),
      escapeCsvCell(new Date(rec.timestamp).toLocaleString()),
      escapeCsvCell(rec.subject),
      escapeCsvCell(room),
      escapeCsvCell(rec.codeUsed),
      escapeCsvCell(rec.rollNo),
      escapeCsvCell(rec.studentName),
      escapeCsvCell(profile?.isCR ? 'Class Representative (CR)' : 'Student'),
      escapeCsvCell(profile?.semester || 'Sem 4'),
      escapeCsvCell(profile?.batch || 'B.Sc./M.Sc. 2026'),
      escapeCsvCell(status),
      escapeCsvCell(Math.round(rec.distanceKm * 1000)),
      escapeCsvCell(rec.accuracyMeters),
      escapeCsvCell(rec.isSimulated ? 'Simulated / Manual' : 'Live Satellite GPS'),
      escapeCsvCell(rec.crDecidedBy || rec.overrideByFaculty || (rec.verified ? 'System Verified' : 'Pending')),
      escapeCsvCell(rec.crRemark || rec.errorReport?.reason || ''),
      escapeCsvCell(rec.receiptHash),
      escapeCsvCell(exportedBy),
    ].join(',');
  });

  const dateSlug = new Date().toISOString().split('T')[0];
  const filename = `CUK_Chemistry_Session_Attendance_Records_${dateSlug}.csv`;

  triggerCsvDownload([headers.map(escapeCsvCell).join(','), ...rows], filename);

  return {
    filename,
    recordCount: rows.length,
  };
}
