export type ChemistrySubject =
  | 'Organic Chemistry'
  | 'Inorganic Chemistry'
  | 'Physical Chemistry'
  | 'Analytical Chemistry'
  | 'Spectroscopy & Chromatography'
  | 'Advanced Chemistry Lab';

export type UserRole = 'student' | 'cr' | 'faculty';

export interface AuthUser {
  userId?: string;
  rollNo?: string;
  facultyId?: string;
  crId?: string;
  name: string;
  role: UserRole;
  isCR?: boolean;
  isCRIdentity?: boolean;
  email?: string;
  phone?: string;
  isAuthenticated: boolean;
  verifiedAt: string;
  authenticatedAt?: string;
  loginMethod: 'otp' | 'passcode';
}

export interface FacultyProfile {
  id?: string;
  facultyId: string;
  name: string;
  designation: string;
  subject: ChemistrySubject;
  specialization?: string;
  email: string;
  phone: string;
}

export interface DepartmentNotice {
  id: string;
  title: string;
  category:
    | 'Academic'
    | 'Examination'
    | 'Laboratory'
    | 'Event'
    | 'Emergency'
    | 'Exam'
    | 'Lab Safety'
    | 'Seminar'
    | 'General';
  content: string;
  date: string;
  author: string;
  authorRole: 'Faculty' | 'CR';
  isPinned?: boolean;
}

export interface StudentProfile {
  rollNo: string;
  crId?: string;
  name: string;
  semester: string;
  batch: string;
  email?: string;
  phone?: string;
  isCR?: boolean;
}

export type CRFinalDecision = 'pending' | 'approved' | 'rejected';

export interface AttendanceRecord {
  id: string;
  rollNo: string;
  studentName: string;
  subject: ChemistrySubject;
  timestamp: string; // ISO string
  dateString: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  accuracyMeters: number;
  isSimulated: boolean;
  codeUsed: string;
  verified: boolean;
  status?: 'present' | 'absent';
  verificationCode?: string;
  markedBy?: string;
  markedByRole?: UserRole;
  verificationMethod?: 'otp' | 'cr_override' | 'faculty_override';
  overrideByFaculty?: string;
  crDecision?: CRFinalDecision;
  crDecidedBy?: string;
  crDecidedAt?: string;
  crRemark?: string;
  errorReport?: {
    reason: string;
    reportedBy?: string;
    reportedAt: string;
    status: 'open' | 'resolved';
  };
  receiptHash: string;
  biometricVerified?: boolean;
}

export interface GeofenceConfig {
  campusName?: string;
  department?: string;
  locationName?: string;
  centerLat: number;
  centerLon: number;
  allowedRadiusKm: number;
}

export interface ActiveSession {
  id: string;
  subject: ChemistrySubject;
  facultyName: string;
  room: string;
  code: string;
  startTime: string;
  durationMinutes: number;
  expiresAt: string;
  isOpen: boolean;
  isAccepting?: boolean;
  maxDistanceKm: number;
  requireCRApproval?: boolean;
  requireBiometricVerification?: boolean;
  crFinalizedAt?: string;
  crFinalizedBy?: string;
  geofence?: GeofenceConfig;
}

export interface ClassScheduleSlot {
  id: string;
  periodNumber: number;
  periodName: string;
  startTime: string; // "09:00"
  endTime: string; // "10:00"
  subject: ChemistrySubject;
  facultyName: string;
  room: string;
  day: string;
  isLab?: boolean;
  attendanceRenewedAt?: string; // ISO timestamp
  attendanceCode?: string;
  isOpenForAttendance?: boolean;
}
