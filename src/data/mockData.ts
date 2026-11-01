import type {
  AttendanceRecord,
  ChemistrySubject,
  StudentProfile,
  ActiveSession,
  DepartmentNotice,
  ClassScheduleSlot,
  FacultyProfile,
} from '../types/attendance.ts';
import { CUK_CAMPUS, getDailyCode } from '../utils/geo.ts';

export const SUBJECTS: ChemistrySubject[] = [
  'Organic Chemistry',
  'Inorganic Chemistry',
  'Physical Chemistry',
  'Analytical Chemistry',
  'Spectroscopy & Chromatography',
  'Advanced Chemistry Lab',
];

// Clearly fictional demo faculty profiles (No real personal contact information)
export const FACULTY_ROSTER: FacultyProfile[] = [
  {
    id: 'facche001',
    facultyId: 'facche001',
    name: 'Dr. V. Ramanathan (Demo)',
    designation: 'Professor & Head',
    subject: 'Organic Chemistry',
    specialization: 'Organic Synthesis & Catalysis',
    email: 'facche001@demo.university.edu',
    phone: '+91 90000 00201',
  },
  {
    id: 'facche002',
    facultyId: 'facche002',
    name: 'Dr. Meenakshi Iyer (Demo)',
    designation: 'Associate Professor',
    subject: 'Spectroscopy & Chromatography',
    specialization: 'Molecular Spectroscopy & NMR',
    email: 'facche002@demo.university.edu',
    phone: '+91 90000 00202',
  },
  {
    id: 'facche003',
    facultyId: 'facche003',
    name: 'Dr. S. K. Deshmukh (Demo)',
    designation: 'Assistant Professor',
    subject: 'Physical Chemistry',
    specialization: 'Physical & Quantum Chemistry',
    email: 'facche003@demo.university.edu',
    phone: '+91 90000 00203',
  },
];

// Clearly fictional demo student roster (No real student personal data)
export const STUDENT_ROSTER: StudentProfile[] = [
  { rollNo: '26ugchem001', crId: '26ugchem001', name: 'Aarav Sharma', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', isCR: true, email: '26ugchem001@demo.university.edu', phone: '+91 90000 00101' },
  { rollNo: '26ugchem002', name: 'Priya Nair', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', email: '26ugchem002@demo.university.edu', phone: '+91 90000 00102' },
  { rollNo: '26ugchem003', name: 'Rohan Deshmukh', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', email: '26ugchem003@demo.university.edu', phone: '+91 90000 00103' },
  { rollNo: '26ugchem004', crId: '26ugchem004', name: 'Ananya Patil', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', isCR: true, email: '26ugchem004@demo.university.edu', phone: '+91 90000 00104' },
  { rollNo: '26ugchem005', name: 'Karthik Reddy', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', email: '26ugchem005@demo.university.edu', phone: '+91 90000 00105' },
  { rollNo: '26ugchem006', name: 'Sneha Kulkarni', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', email: '26ugchem006@demo.university.edu', phone: '+91 90000 00106' },
  { rollNo: '26ugchem007', name: 'Mohammed Zeeshan', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', email: '26ugchem007@demo.university.edu', phone: '+91 90000 00107' },
  { rollNo: '26ugchem008', name: 'Divya Gowda', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', email: '26ugchem008@demo.university.edu', phone: '+91 90000 00108' },
  { rollNo: '26ugchem009', name: 'Vikramaditya Joshi', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', email: '26ugchem009@demo.university.edu', phone: '+91 90000 00109' },
  { rollNo: '26ugchem010', name: 'Meera Iyer', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', email: '26ugchem010@demo.university.edu', phone: '+91 90000 00110' },
  { rollNo: '26ugchem011', name: 'Siddharth Verma', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', email: '26ugchem011@demo.university.edu', phone: '+91 90000 00111' },
  { rollNo: '26ugchem012', name: 'Kavya Hegde', semester: 'Sem 1', batch: 'B.Sc. (Hons) 2026', email: '26ugchem012@demo.university.edu', phone: '+91 90000 00112' },
];

// Helper to migrate legacy CUK-CH-22-XX IDs to 26ugchemXXX
export function migrateLegacyStudentId(id: string): string {
  if (!id) return id;
  const trimmed = id.trim();
  const match = /^CUK-CH-\d+-(\d+)$/i.exec(trimmed);
  if (match) {
    const num = parseInt(match[1], 10);
    return `26ugchem${String(num).padStart(3, '0')}`;
  }
  const facMatch = /^CUK-FAC-CH-(\d+)$/i.exec(trimmed);
  if (facMatch) {
    const num = parseInt(facMatch[1], 10);
    return `facche${String(num).padStart(3, '0')}`;
  }
  return trimmed;
}

// Total conducted lectures per subject in the current term for authoritative calculation
export const CONDUCTED_LECTURES_PER_SUBJECT: Record<ChemistrySubject, number> = {
  'Organic Chemistry': 4,
  'Inorganic Chemistry': 4,
  'Physical Chemistry': 4,
  'Analytical Chemistry': 4,
  'Spectroscopy & Chromatography': 4,
  'Advanced Chemistry Lab': 4,
};

export const INITIAL_CLASS_SCHEDULE: ClassScheduleSlot[] = [
  {
    id: 'sched-1',
    periodNumber: 1,
    periodName: 'Period 1 · Morning Theory',
    startTime: '09:00',
    endTime: '10:00',
    subject: 'Organic Chemistry',
    facultyName: 'Dr. V. Ramanathan',
    room: 'Lecture Hall CH-101',
    day: 'Daily',
    isOpenForAttendance: true,
    attendanceRenewedAt: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: 'sched-2',
    periodNumber: 2,
    periodName: 'Period 2 · Core Lecture',
    startTime: '10:00',
    endTime: '11:00',
    subject: 'Inorganic Chemistry',
    facultyName: 'Dr. S. K. Deshmukh',
    room: 'Lecture Hall CH-101',
    day: 'Daily',
    isOpenForAttendance: false,
    attendanceRenewedAt: new Date(Date.now() - 120 * 60000).toISOString(),
  },
  {
    id: 'sched-3',
    periodNumber: 3,
    periodName: 'Period 3 · Physical & Quantum',
    startTime: '11:15',
    endTime: '12:15',
    subject: 'Physical Chemistry',
    facultyName: 'Dr. S. K. Deshmukh',
    room: 'Lecture Hall CH-102',
    day: 'Daily',
    isOpenForAttendance: false,
    attendanceRenewedAt: new Date(Date.now() - 180 * 60000).toISOString(),
  },
  {
    id: 'sched-4',
    periodNumber: 4,
    periodName: 'Period 4 · Instrumentation Theory',
    startTime: '12:15',
    endTime: '13:15',
    subject: 'Spectroscopy & Chromatography',
    facultyName: 'Dr. Meenakshi Iyer',
    room: 'CIF Seminar Hall G-02',
    day: 'Daily',
    isOpenForAttendance: false,
    attendanceRenewedAt: new Date(Date.now() - 240 * 60000).toISOString(),
  },
  {
    id: 'sched-5',
    periodNumber: 5,
    periodName: 'Period 5 · Analytical Methods',
    startTime: '14:00',
    endTime: '15:00',
    subject: 'Analytical Chemistry',
    facultyName: 'Dr. Meenakshi Iyer',
    room: 'Lecture Hall CH-101',
    day: 'Daily',
    isOpenForAttendance: false,
    attendanceRenewedAt: new Date(Date.now() - 300 * 60000).toISOString(),
  },
  {
    id: 'sched-6',
    periodNumber: 6,
    periodName: 'Period 6 · Wet Lab Practical',
    startTime: '15:00',
    endTime: '17:00',
    subject: 'Advanced Chemistry Lab',
    facultyName: 'Dr. V. Ramanathan & Lab Staff',
    room: 'Synthesis Wet Lab L-1',
    day: 'Daily',
    isLab: true,
    isOpenForAttendance: false,
    attendanceRenewedAt: new Date(Date.now() - 360 * 60000).toISOString(),
  },
];

export const INITIAL_NOTICES: DepartmentNotice[] = [
  {
    id: 'not-0',
    title: 'Class Schedule & Hourly Attendance Window Policy (Demo Notice)',
    content: 'Each scheduled lecture period (1 hour) has an independent attendance window. Once you submit attendance with your one-time verification code, submission is locked for 60 minutes until the next class period opens.',
    category: 'Academic',
    date: 'Oct 20, 2026',
    author: 'Aarav Sharma (Class Representative)',
    authorRole: 'CR',
    isPinned: true,
  },
  {
    id: 'not-1',
    title: 'Internal Assessment-II Schedule for Organic & Physical Chemistry',
    content: 'The second internal assessment for B.Sc./M.Sc. Chemistry will be conducted in Lecture Hall CH-101. Minimum 75% attendance is required as per UGC examination eligibility norms.',
    category: 'Examination',
    date: 'Oct 20, 2026',
    author: 'Dr. V. Ramanathan (HOD)',
    authorRole: 'Faculty',
    isPinned: true,
  },
  {
    id: 'not-2',
    title: '400 MHz FT-NMR & HPLC Practical Batch Rotation Updated',
    content: 'Batch A and Batch B students are requested to bring safety goggles, lab coats, and bound practical observation notebooks to the Central Instrumentation Facility (CIF) by 2:00 PM sharp.',
    category: 'Laboratory',
    date: 'Oct 19, 2026',
    author: 'Aarav Sharma (Class Representative)',
    authorRole: 'CR',
    isPinned: true,
  },
  {
    id: 'not-3',
    title: 'Guest Lecture: Asymmetric Organocatalysis & Green Solvents',
    content: 'A departmental seminar on sustainable catalytic pathways will be held in the Science Block Seminar Room at 3:30 PM on Friday. Attendance is mandatory for all Chemistry students.',
    category: 'Event',
    date: 'Oct 18, 2026',
    author: 'Dr. Meenakshi Iyer',
    authorRole: 'Faculty',
    isPinned: false,
  },
];

export const INITIAL_FACULTY_SESSION: ActiveSession = {
  id: 'sess-live-1',
  subject: 'Organic Chemistry',
  code: getDailyCode(),
  startTime: new Date().toISOString(),
  durationMinutes: 60,
  expiresAt: new Date(Date.now() + 60 * 60000).toISOString(),
  room: 'Lecture Hall CH-101, Science Block',
  facultyName: 'Dr. V. Ramanathan',
  isOpen: true,
  isAccepting: true,
  maxDistanceKm: CUK_CAMPUS.defaultMaxDistanceKm,
  requireCRApproval: false,
  geofence: {
    campusName: CUK_CAMPUS.name,
    department: CUK_CAMPUS.department,
    centerLat: CUK_CAMPUS.lat,
    centerLon: CUK_CAMPUS.lon,
    allowedRadiusKm: CUK_CAMPUS.defaultMaxDistanceKm,
    locationName: 'CUK Kadaganchi · Science Block (Dept of Chemistry)',
  },
};

export const generateSeedRecords = (): AttendanceRecord[] => {
  const now = new Date();
  const todayStr = now.toDateString();

  const records: AttendanceRecord[] = [];

  const absenceMap: Record<string, string[]> = {
    '26ugchem001': ['Physical Chemistry#2'],
    '26ugchem002': ['Inorganic Chemistry#1', 'Physical Chemistry#3'],
    '26ugchem003': ['Organic Chemistry#2', 'Physical Chemistry#1', 'Physical Chemistry#2', 'Analytical Chemistry#3'],
    '26ugchem004': ['Spectroscopy & Chromatography#2'],
    '26ugchem005': ['Inorganic Chemistry#2', 'Inorganic Chemistry#3', 'Physical Chemistry#2', 'Analytical Chemistry#1', 'Spectroscopy & Chromatography#3'],
    '26ugchem006': ['Physical Chemistry#1', 'Spectroscopy & Chromatography#1', 'Advanced Chemistry Lab#2'],
    '26ugchem007': [
      'Organic Chemistry#1', 'Organic Chemistry#2',
      'Inorganic Chemistry#1', 'Inorganic Chemistry#2',
      'Physical Chemistry#1', 'Physical Chemistry#2', 'Physical Chemistry#3',
      'Analytical Chemistry#2', 'Spectroscopy & Chromatography#2'
    ],
    '26ugchem008': ['Inorganic Chemistry#3', 'Physical Chemistry#3'],
    '26ugchem009': ['Organic Chemistry#3', 'Inorganic Chemistry#1', 'Physical Chemistry#1', 'Spectroscopy & Chromatography#1', 'Analytical Chemistry#2'],
    '26ugchem010': ['Analytical Chemistry#1', 'Physical Chemistry#2', 'Spectroscopy & Chromatography#3'],
    '26ugchem011': [
      'Organic Chemistry#1', 'Organic Chemistry#3',
      'Inorganic Chemistry#1', 'Inorganic Chemistry#2', 'Inorganic Chemistry#3',
      'Physical Chemistry#1', 'Physical Chemistry#2',
      'Analytical Chemistry#1', 'Analytical Chemistry#2',
      'Spectroscopy & Chromatography#1'
    ],
    '26ugchem012': ['Inorganic Chemistry#2', 'Spectroscopy & Chromatography#2'],
  };

  const checkedInTodayRolls = new Set(['26ugchem001', '26ugchem002', '26ugchem003', '26ugchem004', '26ugchem005']);

  SUBJECTS.forEach((subject, subIdx) => {
    for (let sessionNum = 1; sessionNum <= 4; sessionNum++) {
      const isTodayOrganic = subject === 'Organic Chemistry' && sessionNum === 4;
      const daysAgo = isTodayOrganic ? 0 : (4 - sessionNum) * 2 + subIdx;
      const sessionDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      sessionDate.setHours(9 + (subIdx % 6), 10, 0, 0);
      const dateStr = isTodayOrganic ? todayStr : sessionDate.toDateString();

      STUDENT_ROSTER.forEach((student, stuIdx) => {
        if (isTodayOrganic && !checkedInTodayRolls.has(student.rollNo)) {
          return;
        }

        const key = `${subject}#${sessionNum}`;
        const studentAbsences = absenceMap[student.rollNo] || [];
        const isAbsent = studentAbsences.includes(key);

        if (isAbsent) {
          return;
        }

        const recordTime = isTodayOrganic
          ? new Date(now.getTime() - (25 - stuIdx * 4) * 60000)
          : new Date(sessionDate.getTime() + stuIdx * 90000);

        const latOffset = ((stuIdx % 5) - 2) * 0.00015;
        const lonOffset = ((subIdx % 5) - 2) * 0.00015;
        const distKm = Number((0.03 + ((stuIdx + subIdx) % 6) * 0.015).toFixed(3));
        const verHex = Math.abs((stuIdx + 1) * 19381 + (subIdx + 1) * 7919 + sessionNum * 104729)
          .toString(16)
          .toUpperCase()
          .padStart(8, '0')
          .slice(0, 8);
        const hashCode = `CUK-VER-${verHex}`;

        records.push({
          id: `rec-seed-${subject.slice(0, 3).toLowerCase()}-s${sessionNum}-${student.rollNo}`,
          rollNo: student.rollNo,
          studentName: student.name,
          subject,
          timestamp: recordTime.toISOString(),
          dateString: dateStr,
          distanceKm: distKm,
          accuracyMeters: 12,
          latitude: Number((CUK_CAMPUS.lat + latOffset).toFixed(6)),
          longitude: Number((CUK_CAMPUS.lon + lonOffset).toFixed(6)),
          codeUsed: getDailyCode(sessionDate),
          verified: true,
          status: 'present',
          isSimulated: false,
          verificationCode: hashCode,
          receiptHash: hashCode,
          crDecision: 'approved',
          crDecidedBy: 'Aarav Sharma (26ugchem001)',
          crDecidedAt: recordTime.toISOString(),
          crRemark: 'Verified Present',
          markedBy: student.isCR ? 'Self (CR Verified)' : 'Server Verified Check-In',
          markedByRole: student.isCR ? 'cr' : 'student',
          verificationMethod: 'otp',
        });
      });
    }
  });

  return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};
