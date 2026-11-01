import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  STUDENT_ROSTER,
  FACULTY_ROSTER,
  INITIAL_FACULTY_SESSION,
  INITIAL_CLASS_SCHEDULE,
  INITIAL_NOTICES,
  SUBJECTS,
  generateSeedRecords,
  migrateLegacyStudentId,
} from './src/data/mockData.ts';
import type {
  AttendanceRecord,
  StudentProfile,
  ActiveSession,
  ClassScheduleSlot,
  DepartmentNotice,
  UserRole,
  ChemistrySubject,
} from './src/types/attendance.ts';
import { calculateHaversineDistance, CUK_CAMPUS } from './src/utils/geo.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '2mb' }));

// Server-side secret for cryptographic receipt signatures & session tokens
const SERVER_HMAC_SECRET =
  process.env.PORTAL_HMAC_SECRET ||
  crypto.createHash('sha256').update(`cuk-chem-portal-${__dirname}`).digest('hex');

// Unified Central University of Karnataka (Kadaganchi, Aland Road, Kalaburagi) Coordinates
const CUK_COORDINATES = {
  latitude: CUK_CAMPUS.lat, // 17.4320
  longitude: CUK_CAMPUS.lon, // 76.6710
};

// ============================================================================
// Persistent Server-Side Portal Database (.data/portal-db.json)
// ============================================================================
interface PortalDatabase {
  students: StudentProfile[];
  activeSession: ActiveSession;
  attendanceRecords: AttendanceRecord[];
  schedule: ClassScheduleSlot[];
  notices: DepartmentNotice[];
  updatedAt: string;
}

function resolveWritableDataDir(): string {
  const localDir = path.resolve(__dirname, '.data');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const probeFile = path.resolve(localDir, '.write-probe');
    fs.writeFileSync(probeFile, 'ok', 'utf-8');
    fs.unlinkSync(probeFile);
    return localDir;
  } catch {
    const tmpDir = path.join(os.tmpdir(), 'cuk-chem-portal-data');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch {
      // ignore
    }
    return tmpDir;
  }
}

const DATA_DIR = resolveWritableDataDir();
const DB_FILE_PATH = path.resolve(DATA_DIR, 'portal-db.json');

function createInitialDb(): PortalDatabase {
  return {
    students: structuredClone(STUDENT_ROSTER),
    activeSession: structuredClone(INITIAL_FACULTY_SESSION),
    attendanceRecords: generateSeedRecords(),
    schedule: structuredClone(INITIAL_CLASS_SCHEDULE),
    notices: structuredClone(INITIAL_NOTICES),
    updatedAt: new Date().toISOString(),
  };
}

function loadDatabase(): PortalDatabase {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as PortalDatabase;
      if (parsed && Array.isArray(parsed.students) && Array.isArray(parsed.attendanceRecords)) {
        // Ensure legacy IDs and fictional contact fields are clean
        parsed.students = parsed.students.map((s) => ({
          ...s,
          rollNo: migrateLegacyStudentId(s.rollNo),
          email:
            s.email && !s.email.includes('@gmail.com')
              ? s.email
              : `${migrateLegacyStudentId(s.rollNo).toLowerCase()}@demo.university.edu`,
        }));
        parsed.attendanceRecords = parsed.attendanceRecords.map((r) => ({
          ...r,
          rollNo: migrateLegacyStudentId(r.rollNo),
        }));
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not read portal-db.json, initializing fresh database:', err);
  }
  const initial = createInitialDb();
  saveDatabase(initial);
  return initial;
}

function saveDatabase(data: PortalDatabase): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    data.updatedAt = new Date().toISOString();
    const tmpPath = `${DB_FILE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, DB_FILE_PATH);
  } catch (err) {
    console.error('Failed to persist portal-db.json:', err);
  }
}

let db: PortalDatabase = loadDatabase();

// Cryptographic HMAC receipt signature generator (Server-side only)
function signAttendanceReceipt(rollNo: string, subject: string, dateString: string, timestamp: string): string {
  const payload = `${rollNo.toLowerCase()}|${subject}|${dateString}|${timestamp}`;
  const hmac = crypto
    .createHmac('sha256', SERVER_HMAC_SECRET)
    .update(payload)
    .digest('hex')
    .toUpperCase()
    .slice(0, 8);
  return `CUK-VER-${hmac}`;
}

// ============================================================================
// Server-Side OTP & Session Management
// ============================================================================
interface PendingOtpEntry {
  otp: string;
  userId: string;
  role: UserRole;
  expiresAt: number;
  attempts: number;
}

interface ServerSession {
  token: string;
  role: UserRole;
  name: string;
  userId?: string;
  rollNo?: string;
  facultyId?: string;
  crId?: string;
  email?: string;
  phone?: string;
  isCR?: boolean;
  isCRIdentity?: boolean;
  isAuthenticated: boolean;
  verifiedAt: string;
  loginMethod: 'otp';
  authenticatedAt: string;
  expiresAt: number;
}

const pendingLoginOtps = new Map<string, PendingOtpEntry>();
const pendingCheckinOtps = new Map<string, PendingOtpEntry>();
const activeSessions = new Map<string, ServerSession>();

function generateSixDigitOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function getAuthenticatedSession(req: express.Request): ServerSession | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required. Please sign in with your University ID and OTP.' });
  }
  (req as any).userSession = session;
  next();
}

function requireFacultyOrCR(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (session.role !== 'faculty' && session.role !== 'cr' && !session.isCR) {
    return res.status(403).json({
      error: 'Access denied. Only authorized Faculty or Class Representatives can perform this action.',
    });
  }
  (req as any).userSession = session;
  next();
}

// ============================================================================
// Authentication Endpoints
// ============================================================================

// 1. Request Login OTP
app.post('/api/auth/request-otp', (req, res) => {
  const { role, userId } = req.body as { role?: UserRole; userId?: string };
  if (!role || !userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Role and University ID are required.' });
  }

  const normalizedId = migrateLegacyStudentId(userId.trim());

  if (role === 'student') {
    const student = db.students.find(
      (s) => s.rollNo.trim().toLowerCase() === normalizedId.toLowerCase()
    );
    if (!student) {
      return res.status(404).json({
        error: `Student ID "${userId.trim()}" was not found in the Department Roster. Valid demo IDs: 26ugchem001 to 26ugchem012.`,
      });
    }
    const otp = generateSixDigitOtp();
    const key = `student:${student.rollNo.toLowerCase()}`;
    pendingLoginOtps.set(key, {
      otp,
      userId: student.rollNo,
      role: 'student',
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });
    return res.json({
      success: true,
      userId: student.rollNo,
      name: student.name,
      email: student.email,
      phone: student.phone,
      isCR: !!student.isCR,
      deliveryMode: 'sandbox',
      sandboxOtp: otp,
      expiresInSeconds: 300,
    });
  }

  if (role === 'cr') {
    const student = db.students.find(
      (s) => s.rollNo.trim().toLowerCase() === normalizedId.toLowerCase()
    );
    if (!student) {
      return res.status(404).json({
        error: `ID "${userId.trim()}" was not found in the roster.`,
      });
    }
    if (!student.isCR) {
      return res.status(403).json({
        error: `Access denied: ${student.name} (${student.rollNo}) is not designated as a Class Representative (CR).`,
      });
    }
    const otp = generateSixDigitOtp();
    const key = `cr:${student.rollNo.toLowerCase()}`;
    pendingLoginOtps.set(key, {
      otp,
      userId: student.rollNo,
      role: 'cr',
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });
    return res.json({
      success: true,
      userId: student.rollNo,
      name: student.name,
      email: student.email,
      phone: student.phone,
      isCR: true,
      deliveryMode: 'sandbox',
      sandboxOtp: otp,
      expiresInSeconds: 300,
    });
  }

  if (role === 'faculty') {
    const faculty = FACULTY_ROSTER.find(
      (f) => (f.id || f.facultyId).trim().toLowerCase() === normalizedId.toLowerCase()
    );
    const crDualLogin = db.students.find(
      (s) => s.rollNo.trim().toLowerCase() === normalizedId.toLowerCase() && s.isCR
    );

    if (!faculty && !crDualLogin) {
      return res.status(404).json({
        error: `Invalid Faculty ID "${userId.trim()}". Use a registered Faculty ID (facche001 - facche003) or an authorized CR ID.`,
      });
    }

    const resolvedId = faculty ? (faculty.id || faculty.facultyId) : crDualLogin!.rollNo;
    const resolvedName = faculty ? faculty.name : `${crDualLogin!.name} (CR)`;
    const resolvedEmail = faculty ? faculty.email : crDualLogin!.email;
    const resolvedPhone = faculty ? faculty.phone : crDualLogin!.phone;

    const otp = generateSixDigitOtp();
    const key = `faculty:${resolvedId.toLowerCase()}`;
    pendingLoginOtps.set(key, {
      otp,
      userId: resolvedId,
      role: 'faculty',
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });
    return res.json({
      success: true,
      userId: resolvedId,
      name: resolvedName,
      email: resolvedEmail,
      phone: resolvedPhone,
      isCR: !!crDualLogin,
      deliveryMode: 'sandbox',
      sandboxOtp: otp,
      expiresInSeconds: 300,
    });
  }

  return res.status(400).json({ error: 'Invalid role specified.' });
});

// 2. Verify Login OTP & Issue Session Token
app.post('/api/auth/verify-otp', (req, res) => {
  const { role, userId, otp } = req.body as { role?: UserRole; userId?: string; otp?: string };
  if (!role || !userId || !otp) {
    return res.status(400).json({ error: 'Role, University ID, and 6-digit OTP are required.' });
  }

  const normalizedId = migrateLegacyStudentId(userId.trim());
  const key = `${role}:${normalizedId.toLowerCase()}`;
  const pending = pendingLoginOtps.get(key);

  if (!pending) {
    return res.status(400).json({ error: 'No active OTP found or OTP expired. Please request a new OTP.' });
  }

  if (Date.now() > pending.expiresAt) {
    pendingLoginOtps.delete(key);
    return res.status(400).json({ error: 'OTP has expired. Please request a new 6-digit OTP.' });
  }

  pending.attempts += 1;
  if (pending.attempts > 5) {
    pendingLoginOtps.delete(key);
    return res.status(429).json({ error: 'Too many invalid OTP attempts. Please request a new OTP.' });
  }

  if (pending.otp !== otp.trim()) {
    return res.status(401).json({
      error: `Invalid 6-digit OTP (${5 - pending.attempts} attempts remaining).`,
    });
  }

  // Validated! Clean up OTP and issue session token
  pendingLoginOtps.delete(key);
  const token = crypto.randomBytes(32).toString('hex');

  let sessionUser: ServerSession;

  const nowIso = new Date().toISOString();

  if (role === 'student' || role === 'cr') {
    const student = db.students.find(
      (s) => s.rollNo.trim().toLowerCase() === normalizedId.toLowerCase()
    );
    if (!student) {
      return res.status(404).json({ error: 'Student profile no longer exists.' });
    }
    sessionUser = {
      token,
      role,
      userId: student.rollNo,
      name: student.name,
      rollNo: student.rollNo,
      crId: student.isCR ? student.rollNo : undefined,
      email: student.email,
      phone: student.phone,
      isCR: !!student.isCR,
      isCRIdentity: !!student.isCR,
      isAuthenticated: true,
      verifiedAt: nowIso,
      loginMethod: 'otp',
      authenticatedAt: nowIso,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
    };
  } else {
    const faculty = FACULTY_ROSTER.find(
      (f) => (f.id || f.facultyId).trim().toLowerCase() === normalizedId.toLowerCase()
    );
    const crDualLogin = db.students.find(
      (s) => s.rollNo.trim().toLowerCase() === normalizedId.toLowerCase() && s.isCR
    );
    const facId = faculty ? (faculty.id || faculty.facultyId) : crDualLogin?.rollNo;
    sessionUser = {
      token,
      role: 'faculty',
      userId: facId,
      name: faculty ? faculty.name : `${crDualLogin?.name || 'CR'}`,
      rollNo: crDualLogin ? crDualLogin.rollNo : undefined,
      crId: crDualLogin ? crDualLogin.rollNo : undefined,
      facultyId: facId,
      email: faculty ? faculty.email : crDualLogin?.email,
      phone: faculty ? faculty.phone : crDualLogin?.phone,
      isCR: !!crDualLogin,
      isCRIdentity: !!crDualLogin,
      isAuthenticated: true,
      verifiedAt: nowIso,
      loginMethod: 'otp',
      authenticatedAt: nowIso,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    };
  }

  activeSessions.set(token, sessionUser);

  const { token: _t, expiresAt: _e, ...publicUser } = sessionUser;
  return res.json({
    token,
    user: publicUser,
  });
});

// 3. Switch Active Role (Authorized CRs only)
app.post('/api/auth/switch-role', requireAuth, (req, res) => {
  const session: ServerSession = (req as any).userSession;
  const { targetRole } = req.body as { targetRole?: UserRole };

  if (!targetRole || !['student', 'cr', 'faculty'].includes(targetRole)) {
    return res.status(400).json({ error: 'Invalid target role.' });
  }

  if (!session.isCR && targetRole !== session.role) {
    return res.status(403).json({
      error: 'Only authorized Class Representatives have multi-role switch permissions.',
    });
  }

  session.role = targetRole;
  activeSessions.set(session.token, session);

  const { token: _t, expiresAt: _e, ...publicUser } = session;
  return res.json({ user: publicUser });
});

// 4. Logout
app.post('/api/auth/logout', (req, res) => {
  const session = getAuthenticatedSession(req);
  if (session) {
    activeSessions.delete(session.token);
  }
  return res.json({ success: true });
});

// ============================================================================
// Portal State Synchronization & Role-Scoped Access Control
// ============================================================================
app.get('/api/state', requireAuth, (req, res) => {
  const session: ServerSession = (req as any).userSession;
  const isPrivileged = session.role === 'faculty' || session.role === 'cr' || !!session.isCR;

  // Enforce server-side privacy: regular students only receive their own attendance records
  // plus anonymized/sanitized roster metadata (and CR contact details for assistance).
  const visibleRecords = isPrivileged
    ? db.attendanceRecords
    : db.attendanceRecords.filter(
        (r) => r.rollNo.trim().toLowerCase() === (session.rollNo || '').trim().toLowerCase()
      );

  const visibleStudents = isPrivileged
    ? db.students
    : db.students.map((s) => {
        const isSelf = s.rollNo.trim().toLowerCase() === (session.rollNo || '').trim().toLowerCase();
        if (isSelf || s.isCR) return s;
        return {
          rollNo: s.rollNo,
          name: s.name,
          semester: s.semester,
          batch: s.batch,
          isCR: s.isCR,
        };
      });

  return res.json({
    students: visibleStudents,
    activeSession: db.activeSession,
    attendanceRecords: visibleRecords,
    schedule: db.schedule,
    notices: db.notices,
    updatedAt: db.updatedAt,
    roleScope: isPrivileged ? 'full' : 'self-only',
  });
});

// ============================================================================
// Server-Verified Student Attendance Check-In Flow
// ============================================================================

// Step 1: Request Check-In OTP (Validates passcode, open session, geofence & duplicate lock on server first)
app.post('/api/attendance/request-checkin-otp', requireAuth, (req, res) => {
  const session: ServerSession = (req as any).userSession;
  const { passcode, latitude, longitude } = req.body as {
    passcode?: string;
    latitude?: number;
    longitude?: number;
  };

  const studentRoll = session.rollNo;
  if (!studentRoll) {
    return res.status(400).json({ error: 'Only accounts with a valid Student Roll Number can submit attendance.' });
  }

  const student = db.students.find(
    (s) => s.rollNo.trim().toLowerCase() === studentRoll.trim().toLowerCase()
  );
  if (!student) {
    return res.status(404).json({ error: 'Student Roll Number not found in official roster.' });
  }

  if (db.activeSession.isAccepting === false || db.activeSession.isOpen === false) {
    return res.status(403).json({
      error: 'Attendance window is currently CLOSED by Faculty/CR. Submissions are locked.',
    });
  }

  if (!passcode || passcode.trim().toUpperCase() !== db.activeSession.code.trim().toUpperCase()) {
    return res.status(400).json({
      error: 'Invalid Classroom Passcode. Please enter the current passcode displayed by your instructor.',
    });
  }

  if (typeof latitude !== 'number' || typeof longitude !== 'number' || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return res.status(400).json({
      error: 'Valid GPS coordinates are required to verify campus presence.',
    });
  }

  const centerLat = db.activeSession.geofence?.centerLat ?? CUK_CAMPUS.lat;
  const centerLon = db.activeSession.geofence?.centerLon ?? CUK_CAMPUS.lon;
  const allowedRadiusKm = db.activeSession.geofence?.allowedRadiusKm ?? db.activeSession.maxDistanceKm ?? 0.5;
  const locName = db.activeSession.geofence?.locationName || 'CUK Science Block';

  // Server-side Haversine geofence calculation
  const distanceKm = calculateHaversineDistance(
    latitude,
    longitude,
    centerLat,
    centerLon
  );

  if (distanceKm > allowedRadiusKm) {
    return res.status(403).json({
      error: `Geofence check failed: Your reported location is ${(distanceKm * 1000).toFixed(0)}m away from ${locName} (maximum allowed radius: ${(allowedRadiusKm * 1000).toFixed(0)}m).`,
      distanceKm,
    });
  }

  // Duplicate check on server for today's active subject
  const todayStr = new Date().toDateString();
  const existingToday = db.attendanceRecords.find(
    (r) =>
      r.rollNo.trim().toLowerCase() === student.rollNo.trim().toLowerCase() &&
      r.subject === db.activeSession.subject &&
      r.dateString === todayStr
  );

  if (existingToday) {
    return res.status(409).json({
      error:
        existingToday.status === 'absent'
          ? `Your attendance for ${db.activeSession.subject} today was marked Absent by ${existingToday.markedBy || 'CR/Faculty'}. Please contact your CR or instructor for review.`
          : `Duplicate submission prevented: Attendance for ${student.rollNo} in ${db.activeSession.subject} is already recorded today (${existingToday.verificationCode}).`,
    });
  }

  const otp = generateSixDigitOtp();
  const key = `checkin:${student.rollNo.toLowerCase()}:${db.activeSession.subject}`;
  pendingCheckinOtps.set(key, {
    otp,
    userId: student.rollNo,
    role: session.role,
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
  });

  return res.json({
    success: true,
    rollNo: student.rollNo,
    studentName: student.name,
    subject: db.activeSession.subject,
    distanceKm: Number(distanceKm.toFixed(4)),
    deliveryMode: 'sandbox',
    sandboxOtp: otp,
    expiresInSeconds: 300,
  });
});

// Step 2: Confirm Check-In OTP & Record Authoritative Attendance on Server
app.post('/api/attendance/check-in', requireAuth, (req, res) => {
  const session: ServerSession = (req as any).userSession;
  const { passcode, otp, latitude, longitude, isSimulated } = req.body as {
    passcode?: string;
    otp?: string;
    latitude?: number;
    longitude?: number;
    isSimulated?: boolean;
  };

  const studentRoll = session.rollNo;
  if (!studentRoll) {
    return res.status(400).json({ error: 'Only accounts with a valid Student Roll Number can submit attendance.' });
  }

  const student = db.students.find(
    (s) => s.rollNo.trim().toLowerCase() === studentRoll.trim().toLowerCase()
  );
  if (!student) {
    return res.status(404).json({ error: 'Student Roll Number not found in official roster.' });
  }

  if (!db.activeSession.isAccepting) {
    return res.status(403).json({
      error: 'Attendance window is currently CLOSED by Faculty/CR.',
    });
  }

  if (!passcode || passcode.trim().toUpperCase() !== db.activeSession.code.trim().toUpperCase()) {
    return res.status(400).json({
      error: 'Classroom passcode expired or invalid.',
    });
  }

  const key = `checkin:${student.rollNo.toLowerCase()}:${db.activeSession.subject}`;
  const pending = pendingCheckinOtps.get(key);
  if (!pending || Date.now() > pending.expiresAt) {
    pendingCheckinOtps.delete(key);
    return res.status(400).json({
      error: 'Check-in OTP expired or not requested. Please request a fresh OTP.',
    });
  }

  pending.attempts += 1;
  if (pending.attempts > 5) {
    pendingCheckinOtps.delete(key);
    return res.status(429).json({ error: 'Too many invalid OTP attempts. Please restart check-in.' });
  }

  if (!otp || pending.otp !== otp.trim()) {
    return res.status(401).json({
      error: `Incorrect 6-digit verification OTP (${5 - pending.attempts} attempts left).`,
    });
  }

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Valid GPS coordinates are required.' });
  }

  const geofenceCenterLat = db.activeSession.geofence?.centerLat ?? CUK_CAMPUS.lat;
  const geofenceCenterLon = db.activeSession.geofence?.centerLon ?? CUK_CAMPUS.lon;
  const geofenceRadiusKm = db.activeSession.geofence?.allowedRadiusKm ?? db.activeSession.maxDistanceKm ?? 0.5;

  const distanceKm = calculateHaversineDistance(
    latitude,
    longitude,
    geofenceCenterLat,
    geofenceCenterLon
  );

  if (distanceKm > geofenceRadiusKm) {
    return res.status(403).json({
      error: `Geofence check failed: Distance ${(distanceKm * 1000).toFixed(0)}m exceeds allowed ${(geofenceRadiusKm * 1000).toFixed(0)}m radius.`,
    });
  }

  const now = new Date();
  const todayStr = now.toDateString();

  // Final atomic duplicate check
  const existingToday = db.attendanceRecords.find(
    (r) =>
      r.rollNo.trim().toLowerCase() === student.rollNo.trim().toLowerCase() &&
      r.subject === db.activeSession.subject &&
      r.dateString === todayStr
  );

  if (existingToday) {
    pendingCheckinOtps.delete(key);
    return res.status(409).json({
      error: `Attendance for ${student.rollNo} in ${db.activeSession.subject} has already been recorded today.`,
    });
  }

  pendingCheckinOtps.delete(key);

  const timestampIso = now.toISOString();
  const verificationCode = signAttendanceReceipt(
    student.rollNo,
    db.activeSession.subject,
    todayStr,
    timestampIso
  );

  const newRecord: AttendanceRecord = {
    id: `rec-${Date.now()}-${student.rollNo}`,
    rollNo: student.rollNo,
    studentName: student.name,
    subject: db.activeSession.subject,
    timestamp: timestampIso,
    dateString: todayStr,
    distanceKm: Number(distanceKm.toFixed(4)),
    accuracyMeters: 10,
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    codeUsed: passcode.trim().toUpperCase(),
    verified: true,
    status: 'present',
    isSimulated: !!isSimulated,
    verificationCode,
    receiptHash: verificationCode,
    crDecision: 'approved',
    crRemark: isSimulated ? 'Verified (Sandbox GPS Test Mode)' : 'Server OTP & Geofence Verified',
    markedBy: isSimulated ? 'Self (Sandbox GPS Test Mode)' : 'Self (Server OTP & Geofence Verified)',
    markedByRole: session.isCR ? 'cr' : 'student',
    verificationMethod: 'otp',
  };

  db.attendanceRecords = [newRecord, ...db.attendanceRecords];
  saveDatabase(db);

  return res.json({
    record: newRecord,
  });
});

// Verify a Digital Receipt Hash against the Server Database
app.get('/api/attendance/verify-receipt/:code', requireAuth, (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  const record = db.attendanceRecords.find(
    (r) => (r.verificationCode || r.receiptHash || '').toUpperCase() === code
  );
  if (!record) {
    return res.status(404).json({ valid: false, error: 'Receipt code not found in official server ledger.' });
  }
  return res.json({
    valid: true,
    record,
  });
});

// ============================================================================
// Faculty & CR Management Endpoints (Session, Override, Roster, Schedule, Notices)
// ============================================================================

// Update Active Session / Rotate Code / Toggle Accepting / Update Geofence
app.put('/api/session', requireFacultyOrCR, (req, res) => {
  const updates = req.body as Partial<ActiveSession> & { rotateCode?: boolean };

  if (updates.rotateCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
      randomPart += chars[crypto.randomInt(0, chars.length)];
    }
    db.activeSession.code = `CHM-${randomPart}`;
  } else if (typeof updates.code === 'string' && updates.code.trim()) {
    db.activeSession.code = updates.code.trim().toUpperCase();
  }

  if (updates.subject && SUBJECTS.includes(updates.subject)) {
    db.activeSession.subject = updates.subject;
  }
  if (typeof updates.room === 'string') {
    db.activeSession.room = updates.room.trim();
  }
  if (typeof updates.facultyName === 'string') {
    db.activeSession.facultyName = updates.facultyName.trim();
  }
  if (typeof updates.isOpen === 'boolean') {
    db.activeSession.isOpen = updates.isOpen;
    db.activeSession.isAccepting = updates.isOpen;
  }
  if (typeof updates.isAccepting === 'boolean') {
    db.activeSession.isAccepting = updates.isAccepting;
    db.activeSession.isOpen = updates.isAccepting;
  }
  if (typeof updates.maxDistanceKm === 'number') {
    db.activeSession.maxDistanceKm = updates.maxDistanceKm;
  }
  if (typeof updates.requireCRApproval === 'boolean') {
    db.activeSession.requireCRApproval = updates.requireCRApproval;
  }
  if (typeof updates.requireBiometricVerification === 'boolean') {
    db.activeSession.requireBiometricVerification = updates.requireBiometricVerification;
  }
  if (updates.geofence && typeof updates.geofence.centerLat === 'number' && typeof updates.geofence.centerLon === 'number') {
    const prevGeo = db.activeSession.geofence || {
      centerLat: CUK_CAMPUS.lat,
      centerLon: CUK_CAMPUS.lon,
      allowedRadiusKm: 0.5,
      locationName: 'CUK Science Block',
    };
    db.activeSession.geofence = {
      ...prevGeo,
      centerLat: Number(updates.geofence.centerLat.toFixed(6)),
      centerLon: Number(updates.geofence.centerLon.toFixed(6)),
      allowedRadiusKm:
        typeof updates.geofence.allowedRadiusKm === 'number'
          ? Math.max(0.05, Math.min(5, updates.geofence.allowedRadiusKm))
          : prevGeo.allowedRadiusKm,
      locationName: updates.geofence.locationName || prevGeo.locationName,
    };
  }

  saveDatabase(db);
  return res.json({ activeSession: db.activeSession });
});

// Single or Bulk Attendance Override (Faculty & CR)
app.post('/api/attendance/override', requireFacultyOrCR, (req, res) => {
  const session: ServerSession = (req as any).userSession;
  const { rollNo, subject, status } = req.body as {
    rollNo?: string;
    subject?: ChemistrySubject;
    status?: 'present' | 'absent';
  };

  if (!rollNo || !subject || !status || !['present', 'absent'].includes(status)) {
    return res.status(400).json({ error: 'rollNo, subject, and status (present | absent) are required.' });
  }

  const student = db.students.find(
    (s) => s.rollNo.trim().toLowerCase() === rollNo.trim().toLowerCase()
  );
  if (!student) {
    return res.status(404).json({ error: `Student ${rollNo} not found.` });
  }

  const now = new Date();
  const todayStr = now.toDateString();
  const timestampIso = now.toISOString();
  const actorRole: UserRole = session.role === 'faculty' && !session.isCR ? 'faculty' : 'cr';
  const actorLabel =
    actorRole === 'cr' ? `CR (${session.name})` : `Faculty (${session.name})`;

  // Remove any existing record for this student + subject + today
  const filtered = db.attendanceRecords.filter(
    (r) =>
      !(
        r.rollNo.trim().toLowerCase() === student.rollNo.trim().toLowerCase() &&
        r.subject === subject &&
        r.dateString === todayStr
      )
  );

  const verificationCode =
    status === 'present'
      ? signAttendanceReceipt(student.rollNo, subject, todayStr, timestampIso)
      : `ABS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const geofenceLat = db.activeSession.geofence?.centerLat ?? CUK_CAMPUS.lat;
  const geofenceLon = db.activeSession.geofence?.centerLon ?? CUK_CAMPUS.lon;

  const updatedRecord: AttendanceRecord = {
    id: `rec-ovr-${Date.now()}-${student.rollNo}`,
    rollNo: student.rollNo,
    studentName: student.name,
    subject,
    timestamp: timestampIso,
    dateString: todayStr,
    distanceKm: 0.01,
    accuracyMeters: 10,
    latitude: geofenceLat,
    longitude: geofenceLon,
    codeUsed: db.activeSession.code || 'MANUAL',
    verified: status === 'present',
    status,
    isSimulated: false,
    verificationCode,
    receiptHash: verificationCode,
    crDecision: status === 'present' ? 'approved' : 'rejected',
    crDecidedBy: actorLabel,
    crDecidedAt: timestampIso,
    crRemark: status === 'present' ? `Verified Present by ${actorLabel}` : `Marked Absent by ${actorLabel}`,
    markedBy: actorLabel,
    markedByRole: actorRole,
    verificationMethod: actorRole === 'cr' ? 'cr_override' : 'faculty_override',
  };

  db.attendanceRecords = [updatedRecord, ...filtered];
  saveDatabase(db);

  return res.json({
    record: updatedRecord,
    attendanceRecords: db.attendanceRecords,
  });
});

// Bulk Mark All Present / Absent for a Subject Today
app.post('/api/attendance/bulk', requireFacultyOrCR, (req, res) => {
  const session: ServerSession = (req as any).userSession;
  const { subject, status, onlyUnmarked } = req.body as {
    subject?: ChemistrySubject;
    status?: 'present' | 'absent';
    onlyUnmarked?: boolean;
  };

  if (!subject || !status || !['present', 'absent'].includes(status)) {
    return res.status(400).json({ error: 'Valid subject and status (present | absent) are required.' });
  }

  const now = new Date();
  const todayStr = now.toDateString();
  const actorRole: UserRole = session.role === 'faculty' && !session.isCR ? 'faculty' : 'cr';
  const actorLabel =
    actorRole === 'cr' ? `CR (${session.name})` : `Faculty (${session.name})`;

  let records = [...db.attendanceRecords];

  for (const student of db.students) {
    const existingIdx = records.findIndex(
      (r) =>
        r.rollNo.trim().toLowerCase() === student.rollNo.trim().toLowerCase() &&
        r.subject === subject &&
        r.dateString === todayStr
    );

    if (onlyUnmarked && existingIdx !== -1) {
      continue;
    }

    if (existingIdx !== -1) {
      records.splice(existingIdx, 1);
    }

    const timestampIso = new Date().toISOString();
    const verificationCode =
      status === 'present'
        ? signAttendanceReceipt(student.rollNo, subject, todayStr, timestampIso)
        : `ABS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const geofenceLat = db.activeSession.geofence?.centerLat ?? CUK_CAMPUS.lat;
    const geofenceLon = db.activeSession.geofence?.centerLon ?? CUK_CAMPUS.lon;

    records.unshift({
      id: `rec-bulk-${Date.now()}-${student.rollNo}`,
      rollNo: student.rollNo,
      studentName: student.name,
      subject,
      timestamp: timestampIso,
      dateString: todayStr,
      distanceKm: 0.01,
      accuracyMeters: 10,
      latitude: geofenceLat,
      longitude: geofenceLon,
      codeUsed: db.activeSession.code || 'BULK',
      verified: status === 'present',
      status,
      isSimulated: false,
      verificationCode,
      receiptHash: verificationCode,
      crDecision: status === 'present' ? 'approved' : 'rejected',
      crDecidedBy: actorLabel,
      crDecidedAt: timestampIso,
      crRemark: status === 'present' ? `Verified Present by ${actorLabel}` : `Marked Absent by ${actorLabel}`,
      markedBy: actorLabel,
      markedByRole: actorRole,
      verificationMethod: actorRole === 'cr' ? 'cr_override' : 'faculty_override',
    });
  }

  db.attendanceRecords = records;
  saveDatabase(db);

  return res.json({ attendanceRecords: db.attendanceRecords });
});

// Clear a student's today record (Reset to Unmarked)
app.delete('/api/attendance/today/:subject/:rollNo', requireFacultyOrCR, (req, res) => {
  const subject = req.params.subject as ChemistrySubject;
  const rollNo = req.params.rollNo;
  const todayStr = new Date().toDateString();

  db.attendanceRecords = db.attendanceRecords.filter(
    (r) =>
      !(
        r.rollNo.trim().toLowerCase() === rollNo.trim().toLowerCase() &&
        r.subject === subject &&
        r.dateString === todayStr
      )
  );
  saveDatabase(db);
  return res.json({ attendanceRecords: db.attendanceRecords });
});

// Roster Management (Add, Update with Cascading IDs, Delete, Reset)
app.post('/api/roster', requireFacultyOrCR, (req, res) => {
  const session: ServerSession = (req as any).userSession;
  const isRequesterCR = Boolean(session?.role === 'cr' || session?.isCR);
  const newStudent = req.body as StudentProfile;
  if (!newStudent || !newStudent.rollNo || !newStudent.name) {
    return res.status(400).json({ error: 'Student Roll Number and Name are required.' });
  }
  if (newStudent.isCR && !isRequesterCR) {
    return res.status(403).json({
      error: 'Only a Class Representative (CR) has the right to designate or change CR status.',
    });
  }
  const exists = db.students.some(
    (s) => s.rollNo.trim().toLowerCase() === newStudent.rollNo.trim().toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ error: `Roll Number ${newStudent.rollNo} already exists.` });
  }
  const assignedCR = isRequesterCR ? !!newStudent.isCR : false;
  db.students.push({
    rollNo: newStudent.rollNo.trim(),
    crId: assignedCR ? newStudent.rollNo.trim() : undefined,
    name: newStudent.name.trim(),
    semester: newStudent.semester || 'Sem 1',
    batch: newStudent.batch || 'B.Sc. (Hons) 2026',
    email: newStudent.email?.trim() || `${newStudent.rollNo.trim().toLowerCase()}@demo.university.edu`,
    phone: newStudent.phone?.trim() || '+91 90000 00199',
    isCR: assignedCR,
  });
  saveDatabase(db);
  return res.json({ students: db.students });
});

app.put('/api/roster/:originalRollNo', requireFacultyOrCR, (req, res) => {
  const session: ServerSession = (req as any).userSession;
  const isRequesterCR = Boolean(session?.role === 'cr' || session?.isCR);
  const originalRollNo = req.params.originalRollNo.trim();
  const updated = req.body as StudentProfile;
  if (!updated || !updated.rollNo || !updated.name) {
    return res.status(400).json({ error: 'Roll Number and Name are required.' });
  }

  const targetIndex = db.students.findIndex(
    (s) => s.rollNo.trim().toLowerCase() === originalRollNo.toLowerCase()
  );
  if (targetIndex === -1) {
    return res.status(404).json({ error: `Student ${originalRollNo} not found.` });
  }

  const existingStudent = db.students[targetIndex];
  if (
    updated.isCR !== undefined &&
    Boolean(updated.isCR) !== Boolean(existingStudent.isCR) &&
    !isRequesterCR
  ) {
    return res.status(403).json({
      error: 'Only a Class Representative (CR) has the right to change CR status.',
    });
  }

  // Check duplicate if Roll No changed
  if (originalRollNo.toLowerCase() !== updated.rollNo.trim().toLowerCase()) {
    const duplicate = db.students.some(
      (s) => s.rollNo.trim().toLowerCase() === updated.rollNo.trim().toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({ error: `Student ID ${updated.rollNo} is already assigned to another student.` });
    }
  }

  const nextIsCR = isRequesterCR ? Boolean(updated.isCR) : Boolean(existingStudent.isCR);

  db.students[targetIndex] = {
    rollNo: updated.rollNo.trim(),
    crId: nextIsCR ? updated.rollNo.trim() : undefined,
    name: updated.name.trim(),
    semester: updated.semester || 'Sem 1',
    batch: updated.batch || 'B.Sc. (Hons) 2026',
    email: updated.email?.trim() || `${updated.rollNo.trim().toLowerCase()}@demo.university.edu`,
    phone: updated.phone?.trim() || '',
    isCR: nextIsCR,
  };

  // Cascade Roll No or Name changes across attendance records
  db.attendanceRecords = db.attendanceRecords.map((r) =>
    r.rollNo.trim().toLowerCase() === originalRollNo.toLowerCase()
      ? { ...r, rollNo: updated.rollNo.trim(), studentName: updated.name.trim() }
      : r
  );

  saveDatabase(db);
  return res.json({
    students: db.students,
    attendanceRecords: db.attendanceRecords,
  });
});

app.delete('/api/roster/:rollNo', requireFacultyOrCR, (req, res) => {
  const session: ServerSession = (req as any).userSession;
  const isRequesterCR = Boolean(session?.role === 'cr' || session?.isCR);
  const rollNo = req.params.rollNo.trim().toLowerCase();
  const target = db.students.find((s) => s.rollNo.trim().toLowerCase() === rollNo);
  if (target?.isCR && !isRequesterCR) {
    return res.status(403).json({
      error: 'Only a Class Representative (CR) can remove or change a CR record.',
    });
  }
  db.students = db.students.filter((s) => s.rollNo.trim().toLowerCase() !== rollNo);
  saveDatabase(db);
  return res.json({ students: db.students });
});

app.post('/api/roster/reset', requireFacultyOrCR, (_req, res) => {
  db.students = structuredClone(STUDENT_ROSTER);
  saveDatabase(db);
  return res.json({ students: db.students });
});

// Schedule Management
app.put('/api/schedule', requireFacultyOrCR, (req, res) => {
  const { schedule } = req.body as { schedule?: ClassScheduleSlot[] };
  if (!Array.isArray(schedule)) {
    return res.status(400).json({ error: 'Valid schedule array is required.' });
  }
  db.schedule = schedule;
  saveDatabase(db);
  return res.json({ schedule: db.schedule });
});

app.post('/api/schedule/renew', requireFacultyOrCR, (req, res) => {
  const { slotId } = req.body as { slotId?: string };
  const targetSlot = db.schedule.find((s) => s.id === slotId);
  if (!targetSlot) {
    return res.status(404).json({ error: 'Schedule slot not found.' });
  }

  const nowIso = new Date().toISOString();
  db.schedule = db.schedule.map((s) => ({
    ...s,
    isOpenForAttendance: s.id === targetSlot.id,
    attendanceRenewedAt: s.id === targetSlot.id ? nowIso : s.attendanceRenewedAt,
  }));

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars[crypto.randomInt(0, chars.length)];
  }

  db.activeSession = {
    ...db.activeSession,
    subject: targetSlot.subject,
    room: targetSlot.room,
    facultyName: targetSlot.facultyName,
    startTime: nowIso,
    isAccepting: true,
    code: `CUK-${targetSlot.periodNumber}${randomPart.slice(0, 2)}`,
  };

  saveDatabase(db);
  return res.json({
    schedule: db.schedule,
    activeSession: db.activeSession,
  });
});

// Notices Management
app.post('/api/notices', requireFacultyOrCR, (req, res) => {
  const notice = req.body as DepartmentNotice;
  if (!notice || !notice.title || !notice.content) {
    return res.status(400).json({ error: 'Notice title and content are required.' });
  }
  const created: DepartmentNotice = {
    id: notice.id || `not-${Date.now()}`,
    title: notice.title.trim(),
    content: notice.content.trim(),
    category: notice.category || 'General',
    date: notice.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    author: notice.author || 'Department Office',
    authorRole: notice.authorRole || 'Faculty',
    isPinned: !!notice.isPinned,
  };
  db.notices = [created, ...db.notices];
  saveDatabase(db);
  return res.json({ notices: db.notices });
});

app.put('/api/notices/:id', requireFacultyOrCR, (req, res) => {
  const id = req.params.id;
  const updated = req.body as Partial<DepartmentNotice>;
  db.notices = db.notices.map((n) => (n.id === id ? { ...n, ...updated } : n));
  saveDatabase(db);
  return res.json({ notices: db.notices });
});

app.delete('/api/notices/:id', requireFacultyOrCR, (req, res) => {
  const id = req.params.id;
  db.notices = db.notices.filter((n) => n.id !== id);
  saveDatabase(db);
  return res.json({ notices: db.notices });
});

// Reset Entire Demo Database
app.post('/api/reset-demo', requireFacultyOrCR, (_req, res) => {
  db = createInitialDb();
  saveDatabase(db);
  return res.json({
    students: db.students,
    activeSession: db.activeSession,
    attendanceRecords: db.attendanceRecords,
    schedule: db.schedule,
    notices: db.notices,
  });
});

// Healthcheck routes for Cloud Run / GCP load balancer container probes
app.get(['/healthz', '/api/health'], (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() });
});

// API: Built-in CUK Chemistry Academic & Campus Advisor (Zero external API key required)
app.post('/api/chat', async (req, res) => {
  try {
    const {
      messages,
      groundingMode = 'auto', // 'search' | 'maps' | 'auto'
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const latestUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.text || '';
    const lowerMsg = latestUserMsg.toLowerCase();

    const isLocationQuery =
      groundingMode === 'maps' ||
      (groundingMode === 'auto' &&
        /\b(map|location|where|campus|hostel|library|block|building|kadaganchi|kalaburagi|gulbarga|nearby|direction|distance|cafeteria|canteen|hospital|bank|gate|station|bus)\b/i.test(
          lowerMsg
        ));

    const activeGrounding: 'search' | 'maps' =
      groundingMode === 'search' ? 'search' : groundingMode === 'maps' ? 'maps' : isLocationQuery ? 'maps' : 'search';

    let replyText = `[CUK Chemistry Academic & Campus Reference] `;

    if (lowerMsg.includes('attendance') || lowerMsg.includes('rule') || lowerMsg.includes('75') || lowerMsg.includes('proxy')) {
      replyText += `\n\n📌 UGC & CUK Attendance Policy:\n• Per Ordinance Rule 14.2, 75% minimum attendance is mandatory for Semester End-Exams.\n• Physical presence is geofenced within 500m of the Science Block (17.4320°N, 76.6710°E).\n• Attendance is verified on the server via session passcode and one-time verification code.`;
    } else if (isLocationQuery) {
      replyText += `\n\n📍 Central University of Karnataka Campus Guide (17.4320°N, 76.6710°E):\n• Science Block & Chemistry Wing: Near Academic Circle, Aland Road, Kadaganchi.\n• Central Instrumentation Facility (CIF): Ground Floor Science Block (400 MHz FT-NMR & HPLC).\n• Lecture Halls CH-101 to CH-103: First Floor, Chemistry Wing.\n• Hostels: Student Hostel Complex is ~750m south of the Academic Complex.`;
    } else if (lowerMsg.includes('nmr') || lowerMsg.includes('shift') || lowerMsg.includes('spectroscop')) {
      replyText += `\n\n🔬 1H NMR Chemical Shift Reference:\n• TMS Reference Standard: 0.0 ppm\n• Saturated Alkanes (R-CH3): 0.8 – 1.2 ppm\n• Alkenes (C=C-H): 4.5 – 6.5 ppm (deshielded by pi-electron diamagnetic anisotropy)\n• Aromatic Protons (Ar-H): 6.5 – 8.2 ppm (ring current deshielding)\n• Aldehydes (R-CHO): 9.5 – 10.5 ppm\n• Carboxylic Acids (R-COOH): 10.5 – 12.5 ppm (broad, exchangeable with D2O)`;
    } else if (lowerMsg.includes('crystal') || lowerMsg.includes('orbital') || lowerMsg.includes('splitting') || lowerMsg.includes('cfse')) {
      replyText += `\n\n⚛️ Crystal Field Theory (CFT) Summary:\n• Octahedral Complexes [ML6]: 5 degenerate d-orbitals split into lower-energy t2g (dxy, dyz, dxz: -0.4 Δo each) and higher-energy eg (dx2-y2, dz2: +0.6 Δo each).\n• Tetrahedral Complexes [ML4]: Inverted splitting with lower-energy e (-0.6 Δt) and higher-energy t2 (+0.4 Δt), where Δt ≈ (4/9) Δo.\n• Spectrochemical Series: I⁻ < Br⁻ < Cl⁻ < F⁻ < OH⁻ < H2O < NH3 < en < CN⁻ < CO.`;
    } else if (lowerMsg.includes('sn1') || lowerMsg.includes('sn2') || lowerMsg.includes('nucleophilic') || lowerMsg.includes('organic')) {
      replyText += `\n\n🧪 Organic Chemistry Doubt Solution:\n• SN2 (Bimolecular Nucleophilic Substitution): Concerted single-step mechanism with backside nucleophilic attack through a pentacoordinate transition state, resulting in 100% Walden inversion of configuration (Rate = k[Substrate][Nucleophile]). Favored by primary alkyl halides and polar aprotic solvents (DMSO, Acetone, DMF).\n• SN1 (Unimolecular Nucleophilic Substitution): Two-step mechanism proceeding via a planar carbocation intermediate, leading to racemization (Rate = k[Substrate]). Favored by tertiary substrates and polar protic solvents.`;
    } else {
      replyText += `\n\nI can resolve your academic and department queries using the built-in CUK Chemistry Knowledge Base:\n1. 🔍 Chemistry Reference: Organic reaction mechanisms (SN1/SN2), 1H NMR spectroscopy tables, Crystal Field Theory, and IUPAC standards.\n2. 📍 Campus Guide: CUK Kadaganchi campus facilities, Science Block laboratories, Central Library, and 500m attendance geofence rules.\n3. 📋 Attendance Rules: UGC 75% eligibility calculation, session passcodes, and cryptographic receipt verification.`;
    }

    return res.json({
      text: replyText,
      groundingUsed: activeGrounding,
      webSources:
        activeGrounding === 'search'
          ? [
              {
                title: 'IUPAC Gold Book - Chemical Terminology Compendium',
                uri: 'https://goldbook.iupac.org/',
              },
              {
                title: 'Central University of Karnataka - School of Chemical Sciences',
                uri: 'https://www.cuk.ac.in/',
              },
            ]
          : [],
      mapSources:
        activeGrounding === 'maps'
          ? [
              {
                title: 'Central University of Karnataka, Kadaganchi on Maps',
                uri: 'https://www.openstreetmap.org/?mlat=17.4320&mlon=76.6710#map=17/17.4320/76.6710',
                reviewSnippets: ['Main academic campus on Aland Road, Kalaburagi with Science Block and Central Library.'],
              },
            ]
          : [],
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || 'Failed to process query.',
    });
  }
});

app.post('/api/doubt-video', async (_req, res) => {
  return res.status(400).json({
    error: 'Video synthesis is disabled in standalone attendance portal deployments.',
  });
});

// Mount Vite or serve static
async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const distIndex = path.resolve(distPath, 'index.html');
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && fs.existsSync(distIndex)) {
    console.log('Serving production static build from:', distPath);
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex);
      } else {
        res.status(200).send('<!doctype html><html><head><meta http-equiv="refresh" content="1"></head><body>Rebuilding application...</body></html>');
      }
    });
  } else {
    try {
      console.log('Starting with Vite middleware...');
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.error('Vite middleware unavailable, falling back to static dist:', viteErr);
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        if (fs.existsSync(distIndex)) {
          res.sendFile(distIndex);
        } else {
          res.status(503).send('Application static build not found.');
        }
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} (mode: ${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
