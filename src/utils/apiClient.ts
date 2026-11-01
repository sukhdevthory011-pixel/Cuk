import {
  ActiveSession,
  AttendanceRecord,
  AuthUser,
  ChemistrySubject,
  ClassScheduleSlot,
  DepartmentNotice,
  StudentProfile,
  UserRole,
} from '../types/attendance';

const AUTH_TOKEN_KEY = 'cuk_chem_auth_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export interface RequestOtpResponse {
  success: boolean;
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  isCR: boolean;
  deliveryMode: 'sandbox' | 'live';
  sandboxOtp?: string;
  expiresInSeconds: number;
}

export interface VerifyOtpResponse {
  token: string;
  user: AuthUser;
}

export interface PortalStateResponse {
  students: StudentProfile[];
  activeSession: ActiveSession;
  attendanceRecords: AttendanceRecord[];
  schedule: ClassScheduleSlot[];
  notices: DepartmentNotice[];
  updatedAt: string;
  roleScope: 'full' | 'self-only';
}

export const portalApi = {
  requestLoginOtp(role: UserRole, userId: string): Promise<RequestOtpResponse> {
    return apiRequest('/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ role, userId }),
    });
  },

  verifyLoginOtp(role: UserRole, userId: string, otp: string): Promise<VerifyOtpResponse> {
    return apiRequest('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ role, userId, otp }),
    });
  },

  switchRole(targetRole: UserRole): Promise<{ user: AuthUser }> {
    return apiRequest('/api/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ targetRole }),
    });
  },

  logout(): Promise<{ success: boolean }> {
    return apiRequest('/api/auth/logout', { method: 'POST' });
  },

  fetchPortalState(): Promise<PortalStateResponse> {
    return apiRequest('/api/state', { method: 'GET' });
  },

  requestCheckinOtp(payload: {
    passcode: string;
    latitude: number;
    longitude: number;
  }): Promise<{
    success: boolean;
    rollNo: string;
    studentName: string;
    subject: ChemistrySubject;
    distanceKm: number;
    deliveryMode: 'sandbox' | 'live';
    sandboxOtp?: string;
    expiresInSeconds: number;
  }> {
    return apiRequest('/api/attendance/request-checkin-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  submitCheckin(payload: {
    passcode: string;
    otp: string;
    latitude: number;
    longitude: number;
    isSimulated?: boolean;
  }): Promise<{ record: AttendanceRecord }> {
    return apiRequest('/api/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  verifyReceipt(code: string): Promise<{ valid: boolean; record: AttendanceRecord }> {
    return apiRequest(`/api/attendance/verify-receipt/${encodeURIComponent(code)}`, {
      method: 'GET',
    });
  },

  updateSession(
    updates: Partial<ActiveSession> & { rotateCode?: boolean }
  ): Promise<{ activeSession: ActiveSession }> {
    return apiRequest('/api/session', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  overrideAttendance(payload: {
    rollNo: string;
    subject: ChemistrySubject;
    status: 'present' | 'absent';
  }): Promise<{ record: AttendanceRecord; attendanceRecords: AttendanceRecord[] }> {
    return apiRequest('/api/attendance/override', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  bulkMarkAttendance(payload: {
    subject: ChemistrySubject;
    status: 'present' | 'absent';
    onlyUnmarked?: boolean;
  }): Promise<{ attendanceRecords: AttendanceRecord[] }> {
    return apiRequest('/api/attendance/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  clearTodayAttendance(
    subject: ChemistrySubject,
    rollNo: string
  ): Promise<{ attendanceRecords: AttendanceRecord[] }> {
    return apiRequest(
      `/api/attendance/today/${encodeURIComponent(subject)}/${encodeURIComponent(rollNo)}`,
      { method: 'DELETE' }
    );
  },

  addStudent(student: StudentProfile): Promise<{ students: StudentProfile[] }> {
    return apiRequest('/api/roster', {
      method: 'POST',
      body: JSON.stringify(student),
    });
  },

  updateStudent(
    originalRollNo: string,
    updatedStudent: StudentProfile
  ): Promise<{ students: StudentProfile[]; attendanceRecords: AttendanceRecord[] }> {
    return apiRequest(`/api/roster/${encodeURIComponent(originalRollNo)}`, {
      method: 'PUT',
      body: JSON.stringify(updatedStudent),
    });
  },

  deleteStudent(rollNo: string): Promise<{ students: StudentProfile[] }> {
    return apiRequest(`/api/roster/${encodeURIComponent(rollNo)}`, {
      method: 'DELETE',
    });
  },

  resetRoster(): Promise<{ students: StudentProfile[] }> {
    return apiRequest('/api/roster/reset', { method: 'POST' });
  },

  updateSchedule(schedule: ClassScheduleSlot[]): Promise<{ schedule: ClassScheduleSlot[] }> {
    return apiRequest('/api/schedule', {
      method: 'PUT',
      body: JSON.stringify({ schedule }),
    });
  },

  renewScheduleSlot(
    slotId: string
  ): Promise<{ schedule: ClassScheduleSlot[]; activeSession: ActiveSession }> {
    return apiRequest('/api/schedule/renew', {
      method: 'POST',
      body: JSON.stringify({ slotId }),
    });
  },

  addNotice(notice: DepartmentNotice): Promise<{ notices: DepartmentNotice[] }> {
    return apiRequest('/api/notices', {
      method: 'POST',
      body: JSON.stringify(notice),
    });
  },

  updateNotice(
    id: string,
    notice: Partial<DepartmentNotice>
  ): Promise<{ notices: DepartmentNotice[] }> {
    return apiRequest(`/api/notices/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(notice),
    });
  },

  deleteNotice(id: string): Promise<{ notices: DepartmentNotice[] }> {
    return apiRequest(`/api/notices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  resetDemoData(): Promise<PortalStateResponse> {
    return apiRequest('/api/reset-demo', { method: 'POST' });
  },
};
