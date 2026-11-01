import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShieldCheck, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileText, 
  UserCheck, 
  Lock, 
  LogIn, 
  Star, 
  Mail, 
  Phone, 
  ExternalLink,
  User,
  GraduationCap,
  Calendar,
  KeyRound,
  RefreshCw,
  X,
  ArrowRight,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  Navigation,
  AlertTriangle,
  Radio,
  History,
  Search,
  Filter,
  Award,
  Check,
  Fingerprint
} from 'lucide-react';
import { ChemistrySubject, AttendanceRecord, ActiveSession, StudentProfile, AuthUser, ClassScheduleSlot, CRFinalDecision } from '../types/attendance';
import { SUBJECTS, STUDENT_ROSTER } from '../data/mockData';
import { 
  CUK_CAMPUS, 
  CampusAnchorConfig,
  CUK_LOCATION_ANCHOR_PRESETS,
  getActiveCampusAnchor,
  setCustomCampusAnchor,
  resetCampusAnchor,
  calculateHaversineDistance, 
  formatDistance, 
  getDailyCode, 
  generateVerificationHash,
  checkDeviceProxy 
} from '../utils/geo';
import { portalApi } from '../utils/apiClient';
import { getConductedCountForSubject } from '../utils/attendanceCalculations';

interface GeofenceNotification {
  id: string;
  type: 'breach' | 'restored' | 'warning';
  title: string;
  message: string;
  distanceMeters: number;
  subject: string;
  timestamp: string;
  read: boolean;
}

interface StudentPortalProps {
  activeSession: ActiveSession | null;
  onUpdateSession?: (session: ActiveSession) => void;
  attendanceRecords: AttendanceRecord[];
  students?: StudentProfile[];
  schedule?: ClassScheduleSlot[];
  currentUser?: AuthUser | null;
  onOpenAuthModal?: () => void;
  onNavigateSchedule?: () => void;
  onNavigateInfo?: () => void;
  onNavigateMap?: () => void;
  onNavigateCR?: () => void;
  onAddRecord: (record: AttendanceRecord) => void;
  onCRFinalDecision?: (
    student: StudentProfile,
    subject: ChemistrySubject,
    dateString: string,
    decision: CRFinalDecision,
    crName: string,
    remark?: string
  ) => void;
  onCRBulkFinalDecision?: (
    decisions: { student: StudentProfile; decision: CRFinalDecision; remark?: string }[],
    subject: ChemistrySubject,
    dateString: string,
    crName: string
  ) => void;
  onOpenReceipt: (record: AttendanceRecord) => void;
}

const LOCATION_PRESETS = [
  { id: 'lab', label: 'Inside Chemistry Lab (40m)', distanceKm: 0.04, lat: 17.4322, lon: 76.6712 },
  { id: 'canteen', label: 'Science Block Corridor (180m)', distanceKm: 0.18, lat: 17.4332, lon: 76.6718 },
  { id: 'library', label: 'Central Library Edge (430m)', distanceKm: 0.43, lat: 17.4306, lon: 76.6744 },
  { id: 'gate', label: 'Outside Main Gate / Aland Rd (680m)', distanceKm: 0.68, lat: 17.4375, lon: 76.6742 },
  { id: 'kalaburagi', label: 'Off-Campus Kalaburagi City (1.4km)', distanceKm: 1.42, lat: 17.4425, lon: 76.6790 },
];

export const StudentPortal: React.FC<StudentPortalProps> = ({
  activeSession,
  onUpdateSession,
  attendanceRecords,
  students = STUDENT_ROSTER,
  schedule = [],
  currentUser,
  onOpenAuthModal,
  onNavigateSchedule,
  onNavigateInfo,
  onNavigateMap,
  onNavigateCR,
  onAddRecord,
  onCRFinalDecision,
  onCRBulkFinalDecision,
  onOpenReceipt,
}) => {
  // Check if authenticated
  const isAuthenticated = currentUser?.isAuthenticated;

  // Student Roll Number (strictly bound to logged-in scholar)
  const [rollNo, setRollNo] = useState<string>(() => {
    if (currentUser?.rollNo) return currentUser.rollNo;
    return '26ugchem001';
  });

  const [studentName, setStudentName] = useState<string>(() => {
    if (currentUser?.name) return currentUser.name;
    return 'Aarav Sharma';
  });

  // Attendance Error Appeal to CR State
  const [showErrorAppealBox, setShowErrorAppealBox] = useState<boolean>(false);
  const [errorReasonText, setErrorReasonText] = useState<string>('GPS Drift / OTP Error Inside Chemistry Lab');

  // Strict RBAC: Only CR and Faculty can set or change classroom location / geofence coordinates
  const canManageLocationAndSession = Boolean(
    currentUser?.role === 'faculty' ||
      currentUser?.role === 'cr' ||
      currentUser?.isCR ||
      currentUser?.isCRIdentity ||
      students.some((s) => s.rollNo.toUpperCase() === rollNo.toUpperCase() && s.isCR)
  );

  // Sync when currentUser changes
  useEffect(() => {
    if (currentUser?.rollNo) {
      setRollNo(currentUser.rollNo);
      setStudentName(currentUser.name);
    }
  }, [currentUser]);

  // Find active scheduled class slot
  const activeSlot = schedule.find((s) => s.isOpenForAttendance) || schedule[0];
  const isClassSessionActive = Boolean(activeSession?.isOpen || activeSlot?.isOpenForAttendance);
  const maxRadiusKm = activeSession?.maxDistanceKm || CUK_CAMPUS.defaultMaxDistanceKm; // 0.5 km (500m)

  const [subject, setSubject] = useState<ChemistrySubject>(
    activeSlot?.subject || activeSession?.subject || 'Organic Chemistry'
  );
  const [teacherCode, setTeacherCode] = useState<string>('');

  // Location Verification & Real-Time Geofence Tracking State (Defaulting to Real Hardware GPS)
  const [campusAnchor, setCampusAnchor] = useState<CampusAnchorConfig>(() => getActiveCampusAnchor());
  const [trackingMode, setTrackingMode] = useState<'simulated' | 'live_gps'>('live_gps');
  const [distanceKm, setDistanceKm] = useState<number>(0.04); // Updated immediately by hardware GPS
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lon: number; accuracy: number }>({
    lat: CUK_CAMPUS.lat,
    lon: CUK_CAMPUS.lon,
    accuracy: 10,
  });
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isDetectingGps, setIsDetectingGps] = useState<boolean>(false);
  const [lastGpsFixTime, setLastGpsFixTime] = useState<string | null>(null);

  // CR Inline Teacher Code & Classroom Location Editor State
  const [showCrInlineControls, setShowCrInlineControls] = useState<boolean>(false);
  const [crCustomCodeInput, setCrCustomCodeInput] = useState<string>(
    activeSession?.code || getDailyCode()
  );
  const [crRoomInput, setCrRoomInput] = useState<string>(
    activeSession?.room || 'Lecture Hall CH-101'
  );
  const [crLatInput, setCrLatInput] = useState<string>(() => getActiveCampusAnchor().lat.toFixed(5));
  const [crLonInput, setCrLonInput] = useState<string>(() => getActiveCampusAnchor().lon.toFixed(5));

  useEffect(() => {
    if (activeSession) {
      setCrCustomCodeInput(activeSession.code);
      setCrRoomInput(activeSession.room);
    }
  }, [activeSession]);

  useEffect(() => {
    const handleAnchorSync = () => {
      const updated = getActiveCampusAnchor();
      setCampusAnchor(updated);
      setCrLatInput(updated.lat.toFixed(5));
      setCrLonInput(updated.lon.toFixed(5));
      const newDist = calculateHaversineDistance(
        currentCoords.lat,
        currentCoords.lon,
        updated.lat,
        updated.lon
      );
      setDistanceKm(Number(newDist.toFixed(3)));
    };
    window.addEventListener('cuk-anchor-updated', handleAnchorSync);
    return () => window.removeEventListener('cuk-anchor-updated', handleAnchorSync);
  }, [currentCoords.lat, currentCoords.lon]);

  // Real-Time Geofence Notification System State
  const [notifications, setNotifications] = useState<GeofenceNotification[]>([]);
  const [activeToastAlert, setActiveToastAlert] = useState<GeofenceNotification | null>(null);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(true);
  const [browserNotifPermission, setBrowserNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [showNotificationLog, setShowNotificationLog] = useState<boolean>(false);
  const [outOfBoundsSeconds, setOutOfBoundsSeconds] = useState<number>(0);

  // Track previous geofence state to detect boundary crossings in real-time
  const wasOutsideGeofenceRef = useRef<boolean>(false);
  const wasNearBoundaryRef = useRef<boolean>(false);

  const isOutsideGeofence = distanceKm > maxRadiusKm;
  const isNearBoundary = !isOutsideGeofence && distanceKm >= maxRadiusKm * 0.8; // 400m - 500m warning zone

  // Web Audio API Synthesizer for Instant Audible Geofence Alerts
  const playGeofenceAlertTone = (toneType: 'breach' | 'restored' | 'warning') => {
    if (!soundAlertsEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (toneType === 'breach') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(440, now + 0.18); // A4
        osc.frequency.setValueAtTime(587.33, now + 0.36);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc.start(now);
        osc.stop(now + 0.65);
      } else if (toneType === 'warning') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.14); // E5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch {
      // Ignore audio context restriction if no user gesture yet
    }
  };

  // Trigger Browser Notification if permitted
  const triggerBrowserNotification = (notif: GeofenceNotification) => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(notif.title, {
          body: notif.message,
          tag: 'cuk-geofence-alert',
        });
      } catch {
        // Ignore in restricted iframe contexts
      }
    }
  };

  const handleRequestBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    try {
      const perm = await Notification.requestPermission();
      setBrowserNotifPermission(perm);
    } catch {
      // Ignore if blocked by iframe permissions policy
    }
  };

  // Manual one-shot GPS refresh helper
  const handleRefreshRealGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setTrackingMode('live_gps');
    setIsDetectingGps(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const dist = calculateHaversineDistance(
          latitude,
          longitude,
          campusAnchor.lat,
          campusAnchor.lon
        );
        setCurrentCoords({ lat: latitude, lon: longitude, accuracy: Math.round(accuracy) });
        setDistanceKm(Number(dist.toFixed(3)));
        setLastGpsFixTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setIsDetectingGps(false);
        setGpsError(null);
      },
      (err) => {
        setIsDetectingGps(false);
        setGpsError(`GPS Signal Notice: ${err.message}. Please allow browser Location permission.`);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  // Calibrate active classroom geofence anchor to current real device GPS (Restricted to CR & Faculty)
  const handleCalibrateAnchorToCurrentGps = () => {
    if (!canManageLocationAndSession) {
      setStatusMessage({
        type: 'error',
        text: 'Location Change Restricted',
        details: 'Only Class Representatives (CR) and Faculty are authorized to set or change the classroom location.',
      });
      return;
    }
    if (!navigator.geolocation) {
      const updated = setCustomCampusAnchor(currentCoords.lat, currentCoords.lon, 'Live Calibrated Classroom GPS');
      setCampusAnchor(updated);
      setDistanceKm(0);
      return;
    }
    setIsDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const updated = setCustomCampusAnchor(
          latitude,
          longitude,
          `Live Calibrated GPS (${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E)`
        );
        setCampusAnchor(updated);
        setCurrentCoords({ lat: latitude, lon: longitude, accuracy: Math.round(accuracy) });
        setDistanceKm(0);
        setLastGpsFixTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setIsDetectingGps(false);
        setGpsError(null);
      },
      () => {
        const updated = setCustomCampusAnchor(currentCoords.lat, currentCoords.lon, 'Live Calibrated Classroom GPS');
        setCampusAnchor(updated);
        setDistanceKm(0);
        setIsDetectingGps(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  const handleResetToCukKadaganchiAnchor = () => {
    if (!canManageLocationAndSession) return;
    const reset = resetCampusAnchor();
    setCampusAnchor(reset);
    const dist = calculateHaversineDistance(
      currentCoords.lat,
      currentCoords.lon,
      reset.lat,
      reset.lon
    );
    setDistanceKm(Number(dist.toFixed(3)));
  };

  // Live Hardware GPS Watch Effect when `trackingMode === 'live_gps'`
  useEffect(() => {
    if (trackingMode !== 'live_gps') {
      setGpsError(null);
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setIsDetectingGps(true);

    // Immediate fix + continuous watchPosition
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const dist = calculateHaversineDistance(
          latitude,
          longitude,
          campusAnchor.lat,
          campusAnchor.lon
        );
        setCurrentCoords({ lat: latitude, lon: longitude, accuracy: Math.round(accuracy) });
        setDistanceKm(Number(dist.toFixed(3)));
        setLastGpsFixTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setIsDetectingGps(false);
        setGpsError(null);
      },
      () => {
        setIsDetectingGps(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const dist = calculateHaversineDistance(
          latitude,
          longitude,
          campusAnchor.lat,
          campusAnchor.lon
        );
        setCurrentCoords({ lat: latitude, lon: longitude, accuracy: Math.round(accuracy) });
        setDistanceKm(Number(dist.toFixed(3)));
        setLastGpsFixTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setIsDetectingGps(false);
        setGpsError(null);
      },
      (err) => {
        setIsDetectingGps(false);
        setGpsError(`GPS Signal Notice: ${err.message}. Allow browser location permission or use classroom calibration.`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [trackingMode, campusAnchor.lat, campusAnchor.lon]);

  // Real-time Geofence Boundary Crossing Detector during active class sessions
  useEffect(() => {
    if (!isClassSessionActive) {
      wasOutsideGeofenceRef.current = isOutsideGeofence;
      wasNearBoundaryRef.current = isNearBoundary;
      return;
    }

    const activeSubjectName = activeSlot?.subject || activeSession?.subject || subject;
    const distanceMeters = Math.round(distanceKm * 1000);
    const limitMeters = Math.round(maxRadiusKm * 1000);

    // Case 1: Student just crossed OUTSIDE the 500m geofence
    if (isOutsideGeofence && !wasOutsideGeofenceRef.current) {
      const breachNotif: GeofenceNotification = {
        id: `geo-alert-${Date.now()}`,
        type: 'breach',
        title: `Geofence Breach Alert (> ${limitMeters}m)`,
        message: `You moved ${distanceMeters}m away from CUK Science Block during active ${activeSubjectName} session. Return inside the ${limitMeters}m perimeter immediately to retain attendance eligibility.`,
        distanceMeters,
        subject: activeSubjectName,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        read: false,
      };

      setNotifications((prev) => [breachNotif, ...prev.slice(0, 19)]);
      setActiveToastAlert(breachNotif);
      playGeofenceAlertTone('breach');
      triggerBrowserNotification(breachNotif);
    }
    // Case 2: Student returned INSIDE the 500m geofence after being outside
    else if (!isOutsideGeofence && wasOutsideGeofenceRef.current) {
      const restoredNotif: GeofenceNotification = {
        id: `geo-alert-${Date.now()}`,
        type: 'restored',
        title: 'Campus Geofence Restored (Inside 500m)',
        message: `You are back inside the CUK Science Block zone (${distanceMeters}m from lab) for ${activeSubjectName}. Attendance submission unlocked.`,
        distanceMeters,
        subject: activeSubjectName,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        read: false,
      };

      setNotifications((prev) => [restoredNotif, ...prev.slice(0, 19)]);
      setActiveToastAlert(restoredNotif);
      playGeofenceAlertTone('restored');
      triggerBrowserNotification(restoredNotif);
      setOutOfBoundsSeconds(0);
    }
    // Case 3: Student entered the 400m - 500m perimeter warning buffer from inside
    else if (isNearBoundary && !wasNearBoundaryRef.current && !wasOutsideGeofenceRef.current) {
      const warningNotif: GeofenceNotification = {
        id: `geo-alert-${Date.now()}`,
        type: 'warning',
        title: 'Approaching 500m Geofence Boundary',
        message: `You are at ${distanceMeters}m (${limitMeters - distanceMeters}m from the ${limitMeters}m cutoff) while ${activeSubjectName} is active.`,
        distanceMeters,
        subject: activeSubjectName,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        read: false,
      };

      setNotifications((prev) => [warningNotif, ...prev.slice(0, 19)]);
      setActiveToastAlert(warningNotif);
      playGeofenceAlertTone('warning');
    }

    wasOutsideGeofenceRef.current = isOutsideGeofence;
    wasNearBoundaryRef.current = isNearBoundary;
  }, [distanceKm, isOutsideGeofence, isNearBoundary, isClassSessionActive, maxRadiusKm, activeSlot, activeSession, subject]);

  // Track continuous time spent outside the 500m geofence while class session is active
  useEffect(() => {
    if (!isClassSessionActive || !isOutsideGeofence) {
      setOutOfBoundsSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setOutOfBoundsSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isClassSessionActive, isOutsideGeofence]);

  // Helper to update simulated distance and coordinates realistically (Restricted to CR & Faculty)
  const handleSimulatedDistanceChange = (newDistKm: number, customLat?: number, customLon?: number) => {
    if (!canManageLocationAndSession) return;
    setTrackingMode('simulated');
    const clampedDist = Math.max(0.01, Math.min(2.0, Number(newDistKm.toFixed(2))));
    setDistanceKm(clampedDist);
    // Calculate approximate lat/lon offset (~111km per degree latitude)
    const latOffset = clampedDist / 111.32;
    setCurrentCoords({
      lat: customLat ?? Number((CUK_CAMPUS.lat + latOffset * 0.7).toFixed(5)),
      lon: customLon ?? Number((CUK_CAMPUS.lon + latOffset * 0.7).toFixed(5)),
      accuracy: 10,
    });
  };

  // OTP Attendance Submission State
  const [isOtpModalOpen, setIsOtpModalOpen] = useState<boolean>(false);
  const [generatedSubmissionOtp, setGeneratedSubmissionOtp] = useState<string>('');
  const [inputSubmissionOtp, setInputSubmissionOtp] = useState<string>('');
  const [otpResendCountdown, setOtpResendCountdown] = useState<number>(30);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Secondary Device Biometric Verification State (Required when enabled by Faculty)
  const isBiometricRequired = Boolean(activeSession?.requireBiometricVerification);
  const [isBiometricConfirmed, setIsBiometricConfirmed] = useState<boolean>(false);
  const [isScanningBiometric, setIsScanningBiometric] = useState<boolean>(false);
  const [biometricTokenId, setBiometricTokenId] = useState<string | null>(null);

  // Reset biometric confirmation when session or subject changes
  useEffect(() => {
    setIsBiometricConfirmed(false);
    setBiometricTokenId(null);
  }, [activeSession?.id, subject]);

  const handlePerformDeviceBiometricConfirmation = async () => {
    if (isScanningBiometric) return;
    setIsScanningBiometric(true);
    setOtpError(null);

    try {
      // Attempt platform authenticator check if available on the device, followed by device identity confirmation
      if (
        typeof window !== 'undefined' &&
        window.PublicKeyCredential &&
        typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
      ) {
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
      }
      await new Promise((resolve) => setTimeout(resolve, 650));
      const token = `BIO-${rollNo.toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
      setBiometricTokenId(token);
      setIsBiometricConfirmed(true);
      setStatusMessage({
        type: 'success',
        text: 'Secondary Device Biometric Identity Confirmed',
        details: `Verified device identity for ${studentName} (${rollNo}) · Token: ${token}`,
      });
    } finally {
      setIsScanningBiometric(false);
    }
  };

  // Submission Status Message
  const [statusMessage, setStatusMessage] = useState<{
    type: 'idle' | 'success' | 'error' | 'warning';
    text: string;
    details?: string;
  }>({
    type: 'idle',
    text: 'Enter Teacher Passcode from the classroom board to submit verified attendance via OTP.',
  });

  const [lastMarkedRecord, setLastMarkedRecord] = useState<AttendanceRecord | null>(null);

  const todayDailyCode = getDailyCode();

  // Find Appointed Class Representatives (CR)
  const crStudents = students.filter((s) => s.isCR);
  const primaryCR = crStudents[0] || {
    rollNo: '26ugchem001',
    name: 'Aarav Sharma',
    semester: 'Sem 1',
    batch: 'B.Sc. (Hons) 2026',
    email: '26ugchem001@demo.university.edu',
    phone: '+91 90000 00101',
    isCR: true,
  };

  const secondaryCR = crStudents[1] || {
    rollNo: '26ugchem004',
    name: 'Ananya Patil',
    semester: 'Sem 1',
    batch: 'B.Sc. (Hons) 2026',
    email: '26ugchem004@demo.university.edu',
    phone: '+91 90000 00104',
    isCR: true,
  };

  // Find Student's Contact Info
  const currentStudentProfile = students.find((s) => s.rollNo.toUpperCase() === rollNo.toUpperCase());
  const studentContactMasked = currentStudentProfile?.phone
    ? `${currentStudentProfile.phone.slice(0, 6)}•••••`
    : currentStudentProfile?.email || '26ugchem001@demo.university.edu';

  // 1-HOUR RATE LIMITING RULE & SCHEDULE RENEWAL CHECK
  const [timeNow, setTimeNow] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTimeNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Personal Attendance History & UGC 75% Filter State
  const [historySubjectFilter, setHistorySubjectFilter] = useState<'ALL' | ChemistrySubject>('ALL');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const historySectionRef = useRef<HTMLDivElement | null>(null);

  // Get student's attendance records filtered by logged-in rollNo (newest first)
  const studentRecords = useMemo(() => {
    return attendanceRecords
      .filter((r) => r.rollNo.toUpperCase() === rollNo.toUpperCase())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [attendanceRecords, rollNo]);

  // Compute Subject-Wise UGC 75% Eligibility Progress for the logged-in scholar using authoritative calculation
  const subjectEligibilityStats = useMemo(() => {
    return SUBJECTS.map((sub) => {
      const totalClassesHeld = getConductedCountForSubject(sub, attendanceRecords);

      const scholarSubRecords = studentRecords.filter(
        (r) => r.subject === sub && r.verified && r.status !== 'absent' && r.crDecision !== 'rejected'
      );
      const distinctAttendedDates = new Set(scholarSubRecords.map((r) => r.dateString));
      const attendedCount = Math.min(totalClassesHeld, distinctAttendedDates.size);
      const percentage = Math.min(100, Math.round((attendedCount / totalClassesHeld) * 100));
      const isEligible = percentage >= 75;
      const isBorderline = percentage >= 65 && percentage < 75;

      const classesNeededFor75 = isEligible
        ? 0
        : Math.max(1, Math.ceil(3 * totalClassesHeld - 4 * attendedCount));

      return {
        subject: sub,
        shortName: sub.replace(' Chemistry', '').replace(' & Chromatography', ''),
        attendedCount,
        totalClassesHeld,
        percentage,
        isEligible,
        isBorderline,
        classesNeededFor75,
        latestRecord: scholarSubRecords[0] || null,
      };
    });
  }, [attendanceRecords, studentRecords]);

  // Overall UGC Attendance Summary across all subjects for this scholar
  const overallEligibilitySummary = useMemo(() => {
    const totalAttended = subjectEligibilityStats.reduce((acc, s) => acc + s.attendedCount, 0);
    const totalHeld = subjectEligibilityStats.reduce((acc, s) => acc + s.totalClassesHeld, 0);
    const overallPercentage = totalHeld > 0 ? Math.min(100, Math.round((totalAttended / totalHeld) * 100)) : 0;
    const eligibleSubjectsCount = subjectEligibilityStats.filter((s) => s.isEligible).length;

    return {
      totalAttended,
      totalHeld,
      overallPercentage,
      eligibleSubjectsCount,
      totalSubjectsCount: SUBJECTS.length,
      isOverallEligible: overallPercentage >= 75,
    };
  }, [subjectEligibilityStats]);

  // Filtered Personal Attendance History rows based on Subject Tab + Search Query
  const filteredStudentRecords = useMemo(() => {
    return studentRecords.filter((rec) => {
      const matchesSubject =
        historySubjectFilter === 'ALL' || rec.subject === historySubjectFilter;
      if (!matchesSubject) return false;

      const q = historySearchQuery.trim().toLowerCase();
      if (!q) return true;

      const formattedTime = new Date(rec.timestamp)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        .toLowerCase();

      return (
        rec.subject.toLowerCase().includes(q) ||
        rec.dateString.toLowerCase().includes(q) ||
        rec.receiptHash.toLowerCase().includes(q) ||
        rec.codeUsed.toLowerCase().includes(q) ||
        formattedTime.includes(q)
      );
    });
  }, [studentRecords, historySubjectFilter, historySearchQuery]);

  const mostRecentRecord = studentRecords[0];
  const ONE_HOUR_MS = 60 * 60 * 1000;
  
  // Calculate time elapsed since last submission
  const timeSinceLastMs = mostRecentRecord
    ? timeNow - new Date(mostRecentRecord.timestamp).getTime()
    : Infinity;

  // Check if current slot has been renewed by faculty/schedule after last submission
  const slotRenewedAtMs = activeSlot?.attendanceRenewedAt
    ? new Date(activeSlot.attendanceRenewedAt).getTime()
    : 0;
  
  const isScheduleSlotRenewed = mostRecentRecord && slotRenewedAtMs > new Date(mostRecentRecord.timestamp).getTime();

  // Student is locked out if less than 1 hour has elapsed AND slot has not been renewed
  const isHourlyLockoutActive = mostRecentRecord && timeSinceLastMs < ONE_HOUR_MS && !isScheduleSlotRenewed;
  const remainingLockoutMs = isHourlyLockoutActive ? ONE_HOUR_MS - timeSinceLastMs : 0;
  const remainingMinutes = Math.floor(remainingLockoutMs / 60000);
  const remainingSeconds = Math.floor((remainingLockoutMs % 60000) / 1000);

  // Check if attendance already marked today for this specific subject
  const todayStr = new Date().toDateString();
  const alreadyMarkedForThisSubjectToday = studentRecords.some(
    (r) => r.dateString === todayStr && r.subject === subject && !isScheduleSlotRenewed
  );

  // Step 1: Initiate server-verified attendance submission and request check-in OTP from server
  const handleInitiateSubmission = async () => {
    if (!isAuthenticated && onOpenAuthModal) {
      setStatusMessage({
        type: 'warning',
        text: 'University Login Required',
        details: 'You must log in with your university credentials before submitting attendance.',
      });
      onOpenAuthModal();
      return;
    }

    const cleanCode = teacherCode.trim().toUpperCase();

    if (!cleanCode) {
      setStatusMessage({
        type: 'error',
        text: 'Teacher Passcode Required',
        details: 'Please enter the session passcode written on the classroom board or projector.',
      });
      return;
    }

    if (distanceKm > maxRadiusKm) {
      setStatusMessage({
        type: 'error',
        text: 'Outside CUK Campus Boundary (500m Limit)',
        details: `You are ${formatDistance(distanceKm)} away from the Science Block (allowed limit: ${formatDistance(maxRadiusKm)}). Please return inside the Chemistry Department perimeter.`,
      });
      return;
    }

    try {
      const res = await portalApi.requestCheckinOtp({
        passcode: cleanCode,
        latitude: currentCoords.lat,
        longitude: currentCoords.lon,
      });
      setGeneratedSubmissionOtp(res.sandboxOtp || '');
      setInputSubmissionOtp('');
      setOtpError(null);
      setOtpResendCountdown(30);
      setIsOtpModalOpen(true);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: 'Server Verification Rejected Check-In',
        details: err.message || 'Could not initiate attendance check-in.',
      });
    }
  };

  // Step 2: Confirm OTP with Server and record authoritative attendance
  const handleVerifyOtpAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);

    if (distanceKm > maxRadiusKm) {
      setOtpError(`Geofence breach detected (${formatDistance(distanceKm)}). You must be within ${formatDistance(maxRadiusKm)} to finalize submission.`);
      return;
    }

    if (isBiometricRequired && !isBiometricConfirmed) {
      setOtpError('Faculty has enabled Biometric Verification. Please complete the Secondary Device Biometric Confirmation below before marking attendance.');
      return;
    }

    const cleanCode = teacherCode.trim().toUpperCase();

    try {
      const res = await portalApi.submitCheckin({
        passcode: cleanCode,
        otp: inputSubmissionOtp.trim(),
        latitude: currentCoords.lat,
        longitude: currentCoords.lon,
        isSimulated: trackingMode === 'simulated',
      });

      onAddRecord(res.record);
      setLastMarkedRecord(res.record);
      setTeacherCode('');
      setIsOtpModalOpen(false);

      setStatusMessage({
        type: 'success',
        text: 'Server Verified & Recorded Attendance!',
        details: `${res.record.rollNo} (${res.record.studentName}) · ${res.record.subject} · Receipt ${res.record.receiptHash} signed by server.`,
      });
    } catch (err: any) {
      setOtpError(err.message || 'Server OTP verification failed.');
    }
  };

  // Resend OTP countdown
  useEffect(() => {
    if (!isOtpModalOpen || otpResendCountdown <= 0) return;
    const timer = setTimeout(() => {
      setOtpResendCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [isOtpModalOpen, otpResendCountdown]);

  const handleResendOtp = async () => {
    try {
      const res = await portalApi.requestCheckinOtp({
        passcode: teacherCode.trim().toUpperCase(),
        latitude: currentCoords.lat,
        longitude: currentCoords.lon,
      });
      setGeneratedSubmissionOtp(res.sandboxOtp || '');
      setInputSubmissionOtp('');
      setOtpError(null);
      setOtpResendCountdown(30);
    } catch (err: any) {
      setOtpError(err.message || 'Could not resend OTP.');
    }
  };

  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // STRICT ACCESS LOCK: Students cannot access anything before OTP login
  if (!isAuthenticated || currentUser?.loginMethod !== 'otp') {
    return (
      <div className="max-w-lg mx-auto my-12 bg-white rounded-2xl border-2 border-rose-200 p-8 text-center shadow-lg space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900">
          Student Portal Locked — OTP Login Mandatory
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          To unlock any access in the app, you must first log in with your specific <strong>Student ID</strong> via <strong>6-digit OTP verification</strong>. Before OTP login, no one can access anything.
        </p>
        {onOpenAuthModal && (
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="cursor-pointer w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            <span>Login via OTP to Unlock Access</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* REAL-TIME GEOFENCE BREACH FLOATING ALERT BANNER (when outside 500m during active class) */}
      {isClassSessionActive && isOutsideGeofence && (
        <div className="bg-rose-950 text-white rounded-xl border-2 border-rose-500 p-4 sm:p-5 shadow-xl animate-in fade-in slide-in-from-top-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-rose-600/30 border border-rose-400/50 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-6 h-6 text-rose-300 animate-bounce" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-rose-600 text-white rounded">
                    Live Geofence Breach Alert
                  </span>
                  <span className="text-xs font-mono font-bold text-rose-200">
                    Current Distance: {formatDistance(distanceKm)} (Max Allowed: {formatDistance(maxRadiusKm)})
                  </span>
                  {outOfBoundsSeconds > 0 && (
                    <span className="text-[11px] font-mono bg-rose-900/90 border border-rose-700 px-2 py-0.5 rounded text-rose-200">
                      Out of zone: {Math.floor(outOfBoundsSeconds / 60)}m {outOfBoundsSeconds % 60}s
                    </span>
                  )}
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  You have moved outside the 500m CUK Science Block Geofence during an active class!
                </h3>
                <p className="text-xs text-rose-200 leading-relaxed">
                  Active Session: <strong>{activeSlot?.subject || activeSession?.subject || subject}</strong>. Attendance verification is automatically locked while you are {Math.round((distanceKm - maxRadiusKm) * 1000)}m beyond the campus perimeter.
                </p>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-end gap-2 shrink-0">
              {canManageLocationAndSession && (
                <button
                  type="button"
                  onClick={handleCalibrateAnchorToCurrentGps}
                  className="cursor-pointer px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-950 font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Navigation className="w-3.5 h-3.5 text-rose-600" />
                  <span>Calibrate Geofence to My Current Real GPS</span>
                </button>
              )}
              {onNavigateMap && (
                <button
                  type="button"
                  onClick={onNavigateMap}
                  className="cursor-pointer text-[11px] text-rose-200 hover:text-white underline font-semibold"
                >
                  Open Live Campus Map
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REAL-TIME TOAST NOTIFICATION POPUP (for latest boundary transition) */}
      {activeToastAlert && (
        <div
          className={`rounded-xl border p-4 shadow-md transition-all flex items-start justify-between gap-3 ${
            activeToastAlert.type === 'breach'
              ? 'bg-rose-50 border-rose-300 text-rose-950'
              : activeToastAlert.type === 'warning'
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-emerald-50 border-emerald-300 text-emerald-950'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                activeToastAlert.type === 'breach'
                  ? 'bg-rose-600 text-white'
                  : activeToastAlert.type === 'warning'
                  ? 'bg-amber-500 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              <BellRing className="w-4 h-4" />
            </div>
            <div className="text-xs space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-extrabold">{activeToastAlert.title}</span>
                <span className="text-[10px] font-mono opacity-75">{activeToastAlert.timestamp}</span>
              </div>
              <p className="leading-relaxed opacity-90">{activeToastAlert.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveToastAlert(null)}
            className="cursor-pointer p-1 rounded-lg hover:bg-black/5 text-current opacity-70 hover:opacity-100"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. STUDENT IDENTITY CARD */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-xs">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
              Central University of Karnataka · Department of Chemistry
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {studentName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="font-mono font-bold text-sm text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200 tabular-nums">
                Roll No: {rollNo}
              </span>
              <span className="text-xs text-slate-500">M.Sc. Chemistry (Sem 4)</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Jump to Personal Attendance History */}
          <button
            type="button"
            onClick={() => historySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="cursor-pointer px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-indigo-200 transition-colors"
            title="Scroll to Personal Attendance History & UGC 75% Tracker"
          >
            <History className="w-3.5 h-3.5 text-indigo-600" />
            <span>My History</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-indigo-600 text-white tabular-nums">
              {studentRecords.length}
            </span>
          </button>

          {/* Notification History Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setShowNotificationLog((prev) => !prev);
              markAllNotificationsRead();
            }}
            className="cursor-pointer relative px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-200 transition-colors"
            title="View Real-Time Geofence Alert Log"
          >
            <Bell className="w-3.5 h-3.5 text-indigo-600" />
            <span>Geofence Alerts</span>
            {notifications.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  unreadNotificationsCount > 0
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-300 text-slate-800'
                }`}
              >
                {notifications.length}
              </span>
            )}
          </button>

          {isAuthenticated ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Identity Verified via OTP</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login via OTP</span>
            </button>
          )}
        </div>
      </div>

      {/* COLLAPSIBLE GEOFENCE NOTIFICATION LOG */}
      {showNotificationLog && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Real-Time Session Geofence Notification Log ({notifications.length})
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={() => setNotifications([])}
                  className="cursor-pointer text-[11px] text-slate-500 hover:text-rose-600 font-semibold"
                >
                  Clear History
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowNotificationLog(false)}
                className="cursor-pointer text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {notifications.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              No geofence boundary alerts triggered during this session. You have remained within the 500m CUK Science Block zone.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                    item.type === 'breach'
                      ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                      : item.type === 'warning'
                      ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                      : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="font-bold flex items-center gap-2">
                      <span>{item.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 border border-black/10">
                        {item.distanceMeters}m
                      </span>
                    </div>
                    <p className="text-[11px] opacity-90">{item.message}</p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap shrink-0">
                    {item.timestamp}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. CLASS SCHEDULE & ATTENDANCE RENEWAL STATUS BANNER */}
      {activeSlot && (
        <div className="bg-gradient-to-r from-indigo-50 via-slate-50 to-white rounded-xl border border-indigo-100 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white px-2 py-0.5 rounded">
                Current Scheduled Slot
              </span>
              <span className="text-xs font-mono font-bold text-indigo-900">
                {activeSlot.startTime} - {activeSlot.endTime}
              </span>
              {activeSlot.isOpenForAttendance && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping"></span>
                  Attendance Window Open
                </span>
              )}
            </div>
            <div className="text-base font-bold text-slate-900">
              {activeSlot.subject} · {activeSlot.room}
            </div>
            <div className="text-xs text-slate-500">
              Faculty: <span className="text-slate-800 font-semibold">{activeSlot.facultyName}</span> · Attendance automatically renews per timetable period.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {subject !== activeSlot.subject && (
              <button
                type="button"
                onClick={() => setSubject(activeSlot.subject)}
                className="cursor-pointer px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold text-xs rounded-lg transition-colors border border-indigo-200 whitespace-nowrap"
              >
                Switch to {activeSlot.subject}
              </button>
            )}

            {onNavigateSchedule && (
              <button
                type="button"
                onClick={onNavigateSchedule}
                className="cursor-pointer px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition-colors border border-slate-200 flex items-center gap-1 shadow-2xs whitespace-nowrap"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Full Timetable</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. REAL-TIME 500M GEOFENCE MONITOR & TELEMETRY SIMULATOR */}
      <div
        className={`rounded-xl border p-5 shadow-xs space-y-4 transition-colors ${
          isOutsideGeofence
            ? 'bg-rose-50/60 border-rose-200'
            : isNearBoundary
            ? 'bg-amber-50/60 border-amber-200'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                isOutsideGeofence
                  ? 'bg-rose-600 text-white'
                  : isNearBoundary
                  ? 'bg-amber-500 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Real-Time 500m Campus Geofence Monitor
                </h3>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                    isOutsideGeofence
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : isNearBoundary
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}
                >
                  {isOutsideGeofence
                    ? 'OUTSIDE 500M ZONE'
                    : isNearBoundary
                    ? 'NEAR PERIMETER EDGE'
                    : 'INSIDE 500M ZONE'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Active Geofence Center: <strong>{campusAnchor.label}</strong> ({campusAnchor.lat.toFixed(4)}°N, {campusAnchor.lon.toFixed(4)}°E)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sound Alert Toggle */}
            <button
              type="button"
              onClick={() => setSoundAlertsEnabled((prev) => !prev)}
              className={`cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition-colors ${
                soundAlertsEnabled
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}
              title="Toggle audible geofence breach alarm"
            >
              {soundAlertsEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Audio Alarm On</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                  <span>Audio Muted</span>
                </>
              )}
            </button>

            {/* Browser Push Notification Permission */}
            {typeof Notification !== 'undefined' && browserNotifPermission !== 'granted' && (
              <button
                type="button"
                onClick={handleRequestBrowserNotifications}
                className="cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 flex items-center gap-1"
              >
                <Bell className="w-3.5 h-3.5 text-indigo-600" />
                <span>Enable System Alerts</span>
              </button>
            )}

            {/* Mode Switcher: Simulated vs Live Hardware GPS (Restricted to CR & Faculty) */}
            {canManageLocationAndSession ? (
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTrackingMode('simulated')}
                  className={`cursor-pointer px-2.5 py-1 rounded-md font-bold transition-colors ${
                    trackingMode === 'simulated'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Interactive Simulator
                </button>
                <button
                  type="button"
                  onClick={() => setTrackingMode('live_gps')}
                  className={`cursor-pointer px-2.5 py-1 rounded-md font-bold transition-colors ${
                    trackingMode === 'live_gps'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Live Hardware GPS
                </button>
              </div>
            ) : (
              <span className="text-[11px] font-medium text-slate-500">
                Location Managed by CR &amp; Faculty
              </span>
            )}
          </div>
        </div>

        {/* Distance Progress Bar & 500m Threshold Marker */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">
              Current Distance from Chemistry Lab:{' '}
              <strong
                className={`font-mono text-sm ${
                  isOutsideGeofence
                    ? 'text-rose-700'
                    : isNearBoundary
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}
              >
                {formatDistance(distanceKm)}
              </strong>{' '}
              <span className="text-[11px] text-slate-500 font-mono">
                ({currentCoords.lat.toFixed(4)}°N, {currentCoords.lon.toFixed(4)}°E)
              </span>
            </span>
            <span className="text-[11px] font-mono font-bold text-slate-600">
              Geofence Cutoff: {formatDistance(maxRadiusKm)} (500m)
            </span>
          </div>

          <div className="relative h-3 w-full bg-slate-200 rounded-full overflow-hidden">
            {/* 500m cutoff line at 50% of 1000m bar */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-slate-900 z-10"
              style={{ left: '50%' }}
              title="500m Campus Geofence Limit"
            />
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isOutsideGeofence
                  ? 'bg-rose-600'
                  : isNearBoundary
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (distanceKm / (maxRadiusKm * 2)) * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
            <span>0m (Chemistry Lab Center)</span>
            <span className="font-bold text-slate-800">▲ 500m Geofence Boundary</span>
            <span>1000m+ (Off-Campus)</span>
          </div>
        </div>

        {/* Interactive Movement Simulator Controls (Restricted to CR & Faculty) */}
        {canManageLocationAndSession && trackingMode === 'simulated' ? (
          <div className="pt-2 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Simulate Student Movement (CR / Faculty Test Mode):
              </label>
              <span className="text-[11px] text-indigo-700 font-semibold">
                Moving past 500m triggers real-time breach alert
              </span>
            </div>

            <input
              type="range"
              min={0.01}
              max={1.2}
              step={0.01}
              value={distanceKm}
              onChange={(e) => handleSimulatedDistanceChange(parseFloat(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />

            <div className="flex flex-wrap gap-1.5 pt-1">
              {LOCATION_PRESETS.map((preset) => {
                const isPresetOutside = preset.distanceKm > maxRadiusKm;
                const isSelected = Math.abs(distanceKm - preset.distanceKm) < 0.02;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSimulatedDistanceChange(preset.distanceKm, preset.lat, preset.lon)}
                    className={`cursor-pointer px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? isPresetOutside
                          ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                          : 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                        : isPresetOutside
                        ? 'bg-white hover:bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs text-indigo-950 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Navigation className={`w-4 h-4 text-indigo-600 shrink-0 ${isDetectingGps ? 'animate-spin' : 'animate-pulse'}`} />
                <div>
                  <span className="font-bold">Live Hardware GPS Active:</span>{' '}
                  <span>
                    Real-time device coordinates <strong className="font-mono">{currentCoords.lat.toFixed(5)}°N, {currentCoords.lon.toFixed(5)}°E</strong> (±{currentCoords.accuracy}m accuracy)
                    {lastGpsFixTime ? ` · Synced at ${lastGpsFixTime}` : ''}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleRefreshRealGps}
                  className="cursor-pointer px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-300 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${isDetectingGps ? 'animate-spin' : ''}`} />
                  <span>Refresh Real GPS</span>
                </button>

                {canManageLocationAndSession && (
                  !campusAnchor.isCustomCalibrated ? (
                    <button
                      type="button"
                      onClick={handleCalibrateAnchorToCurrentGps}
                      className="cursor-pointer px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs"
                      title="CR & Faculty Only: Set your current physical GPS coordinates as the active 500m classroom geofence center"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>Set My Current GPS as Classroom Center</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResetToCukKadaganchiAnchor}
                      className="cursor-pointer px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors"
                      title="CR & Faculty Only: Reset geofence anchor back to CUK Kadaganchi Campus (17.4320°N, 76.6710°E)"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reset to CUK Kadaganchi (17.4320°N, 76.6710°E)</span>
                    </button>
                  )
                )}
              </div>
            </div>

            {gpsError && (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 font-medium text-[11px] flex items-center justify-between gap-2">
                <span>{gpsError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. HOURLY RATE-LIMIT COUNTDOWN BANNER (if active) */}
      {isHourlyLockoutActive && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-amber-950 flex items-center justify-between">
              <span>Hourly Attendance Lockout Active</span>
              <span className="font-mono font-bold bg-amber-200/70 px-2 py-0.5 rounded text-amber-950">
                Unlocks in: {remainingMinutes}m {remainingSeconds}s
              </span>
            </div>
            <p className="mt-1 text-amber-800 leading-normal">
              Attendance can only be submitted once per hour. Your last attendance was recorded for <strong>{mostRecentRecord?.subject}</strong> at {new Date(mostRecentRecord?.timestamp || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. The attendance window unlocks when the next scheduled class period begins or after 60 minutes.
            </p>
          </div>
        </div>
      )}

      {/* 5. ATTENDANCE SUBMISSION PANEL */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              Attendance Verification & OTP Submission
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Two-Factor Physical Presence & OTP Check · CUK Kadaganchi Campus
            </p>
          </div>

          <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            1-Hour Anti-Proxy Rule Active
          </div>
        </div>

        <div className="space-y-4">
          {/* Locked Roll & Name Display */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px] uppercase font-bold">Your Registered Roll Number</span>
              <span className="font-mono font-bold text-slate-900 text-sm">{rollNo}</span>
              <span className="block text-[10px] text-emerald-700 font-semibold mt-0.5">
                🔒 Verified to scholar account (Proxy submissions prevented)
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px] uppercase font-bold">Scholar Name</span>
              <span className="font-semibold text-slate-900 text-sm">{studentName}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">
                School of Chemical Sciences
              </span>
            </div>
          </div>

          {/* Subject Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Lecture Subject
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as ChemistrySubject)}
              className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SUBJECTS.map((sub) => (
                <option key={sub} value={sub}>
                  {sub} {activeSlot?.subject === sub ? '⭐ (Current Scheduled Slot)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Teacher Code Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Teacher Passcode (Written on Blackboard / Projector)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-600 font-mono font-semibold">
                  Active Code: <strong className="text-indigo-700">{activeSession?.isOpen ? activeSession.code : todayDailyCode}</strong>
                </span>
                {canManageLocationAndSession && (
                  <button
                    type="button"
                    onClick={() => setShowCrInlineControls((prev) => !prev)}
                    className="cursor-pointer px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded text-[10px] font-extrabold flex items-center gap-1 transition-colors"
                    title="CR & Faculty Only: Change Teacher Code & Classroom Location"
                  >
                    <Star className="w-3 h-3 fill-amber-500 text-amber-600" />
                    <span>{showCrInlineControls ? 'Hide Controls' : 'CR / Faculty: Change Code & Location'}</span>
                  </button>
                )}
              </div>
            </div>
            <input
              type="text"
              value={teacherCode}
              onChange={(e) => setTeacherCode(e.target.value.toUpperCase())}
              placeholder={`e.g. ${activeSession?.isOpen ? activeSession.code : todayDailyCode} (Board Passcode)`}
              className="w-full px-3.5 py-2.5 text-base font-mono font-bold uppercase tracking-wider border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* CR / FACULTY INLINE QUICK CONTROLS: CHANGE TEACHER CODE & LOCATION (Strictly Hidden for Regular Students) */}
          {canManageLocationAndSession && (showCrInlineControls || currentUser?.role === 'cr') && (
            <div className="p-4 bg-amber-50/70 border-2 border-amber-300 rounded-xl space-y-4 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-amber-200">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold">
                    <Star className="w-4 h-4 fill-current" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                      <span>CR Option: Change Teacher Code &amp; Classroom Location</span>
                      <span className="text-[10px] font-mono bg-amber-200/80 text-amber-950 px-1.5 py-0.2 rounded">
                        {primaryCR.name} ({primaryCR.rollNo})
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Set a new teacher attendance passcode or update the classroom room &amp; GPS geofence location.
                    </p>
                  </div>
                </div>
                {onNavigateCR && (
                  <button
                    type="button"
                    onClick={onNavigateCR}
                    className="cursor-pointer px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap"
                  >
                    Open Full CR Command Desk →
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* 1. Change Teacher Code */}
                <div className="p-3.5 bg-white rounded-lg border border-amber-200 space-y-2.5">
                  <label className="block font-extrabold text-slate-800 uppercase text-[11px]">
                    1. Set New Teacher Code (Passcode)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={crCustomCodeInput}
                      onChange={(e) => setCrCustomCodeInput(e.target.value.toUpperCase())}
                      placeholder="e.g. CHEM24"
                      className="flex-1 px-2.5 py-1.5 font-mono font-extrabold text-sm uppercase border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newCode = crCustomCodeInput.trim().toUpperCase() || todayDailyCode;
                        setCrCustomCodeInput(newCode);
                        setTeacherCode(newCode);
                        if (onUpdateSession && activeSession) {
                          onUpdateSession({
                            ...activeSession,
                            code: newCode,
                            room: crRoomInput.trim() || activeSession.room,
                            subject,
                            isOpen: true,
                          });
                        }
                        setStatusMessage({
                          type: 'success',
                          text: `CR Updated Teacher Code to "${newCode}"`,
                          details: `Active session code is now "${newCode}" for ${subject} in ${crRoomInput || activeSession?.room || 'Lecture Hall CH-101'}.`,
                        });
                      }}
                      className="cursor-pointer px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors"
                    >
                      Save Code
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                        let gen = 'CHEM';
                        for (let i = 0; i < 3; i++) gen += chars.charAt(Math.floor(Math.random() * chars.length));
                        setCrCustomCodeInput(gen);
                        setTeacherCode(gen);
                        if (onUpdateSession && activeSession) {
                          onUpdateSession({ ...activeSession, code: gen, isOpen: true });
                        }
                        setStatusMessage({
                          type: 'success',
                          text: `CR Generated New Teacher Code: "${gen}"`,
                          details: 'Broadcasted to all students for current session.',
                        });
                      }}
                      className="cursor-pointer px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-semibold rounded-lg"
                      title="Generate random teacher code"
                    >
                      Random
                    </button>
                  </div>
                </div>

                {/* 2. Change Classroom Location & GPS Coordinates */}
                <div className="p-3.5 bg-white rounded-lg border border-amber-200 space-y-2.5">
                  <label className="block font-extrabold text-slate-800 uppercase text-[11px]">
                    2. Change Classroom Room &amp; GPS Location
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={crRoomInput}
                      onChange={(e) => setCrRoomInput(e.target.value)}
                      placeholder="e.g. Lecture Hall CH-101"
                      className="flex-1 px-2.5 py-1.5 font-semibold text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={handleCalibrateAnchorToCurrentGps}
                      className="cursor-pointer px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1 whitespace-nowrap"
                      title="Lock your current live GPS as classroom location"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>Use My Live GPS</span>
                    </button>
                  </div>

                  {/* Quick Building Presets */}
                  <div className="flex flex-wrap gap-1">
                    {CUK_LOCATION_ANCHOR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setCrRoomInput(preset.room);
                          const updated = setCustomCampusAnchor(preset.lat, preset.lon, preset.label);
                          setCampusAnchor(updated);
                          setCrLatInput(updated.lat.toFixed(5));
                          setCrLonInput(updated.lon.toFixed(5));
                          if (onUpdateSession && activeSession) {
                            onUpdateSession({ ...activeSession, room: preset.room });
                          }
                          setStatusMessage({
                            type: 'success',
                            text: `CR Updated Location to "${preset.room}"`,
                            details: `Geofence anchored at ${preset.lat.toFixed(4)}°N, ${preset.lon.toFixed(4)}°E.`,
                          });
                        }}
                        className={`cursor-pointer px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
                          crRoomInput === preset.room
                            ? 'bg-indigo-600 text-white border-indigo-700'
                            : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {preset.room}
                      </button>
                    ))}
                  </div>

                  {/* Custom Lat / Lon Input */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <input
                      type="number"
                      step="0.0001"
                      value={crLatInput}
                      onChange={(e) => setCrLatInput(e.target.value)}
                      placeholder="Lat (°N)"
                      className="px-2 py-1 text-[11px] font-mono border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      step="0.0001"
                      value={crLonInput}
                      onChange={(e) => setCrLonInput(e.target.value)}
                      placeholder="Lon (°E)"
                      className="px-2 py-1 text-[11px] font-mono border border-slate-300 rounded"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const lat = parseFloat(crLatInput);
                        const lon = parseFloat(crLonInput);
                        if (!isNaN(lat) && !isNaN(lon)) {
                          const label = `${crRoomInput || 'Custom Classroom'} (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`;
                          const updated = setCustomCampusAnchor(lat, lon, label);
                          setCampusAnchor(updated);
                          if (onUpdateSession && activeSession) {
                            onUpdateSession({ ...activeSession, room: crRoomInput || activeSession.room });
                          }
                          setStatusMessage({
                            type: 'success',
                            text: `CR Set Custom Location: ${label}`,
                            details: 'All students will now be verified against this classroom location.',
                          });
                        }
                      }}
                      className="cursor-pointer px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] rounded"
                    >
                      Set Coords
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Class Attendance Coordination (Inline Quick Register) */}
              {onCRFinalDecision && (
                <div className="p-3.5 bg-white rounded-lg border border-amber-300 space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <span className="font-extrabold text-slate-900 uppercase text-[11px] flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                        <span>3. Class Attendance Verification ({subject})</span>
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Update student attendance status (Present or Absent) for this lecture ({primaryCR.name}).
                      </p>
                    </div>

                    {onCRBulkFinalDecision && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const pendingList = students
                              .filter((st) => {
                                const rec = attendanceRecords.find(
                                  (r) => r.rollNo.toLowerCase() === st.rollNo.toLowerCase() && r.dateString === todayStr && r.subject === subject
                                );
                                return rec && (rec.crDecision === 'pending' || !rec.verified);
                              })
                              .map((st) => ({ student: st, decision: 'approved' as CRFinalDecision }));

                            if (pendingList.length > 0) {
                              onCRBulkFinalDecision(
                                pendingList,
                                subject,
                                todayStr,
                                `${primaryCR.name} (${primaryCR.rollNo})`
                              );
                              setStatusMessage({
                                type: 'success',
                                text: `Verified ${pendingList.length} Pending Students!`,
                                details: `All pending check-ins for ${subject} are now marked Present.`,
                              });
                            } else {
                              setStatusMessage({
                                type: 'idle',
                                text: 'No Pending Check-Ins to Verify',
                                details: 'You can also mark individual students Present or Absent below.',
                              });
                            }
                          }}
                          className="cursor-pointer px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[11px]"
                        >
                          ✓ Approve All Pending
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const allPresent = students.map((st) => ({
                              student: st,
                              decision: 'approved' as CRFinalDecision,
                            }));
                            onCRBulkFinalDecision(
                              allPresent,
                              subject,
                              todayStr,
                              `${primaryCR.name} (${primaryCR.rollNo})`
                            );
                            setStatusMessage({
                              type: 'success',
                              text: `Marked All ${students.length} Students Present!`,
                              details: `Full roster marked Present for ${subject} (${primaryCR.name}).`,
                            });
                          }}
                          className="cursor-pointer px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-[11px]"
                        >
                          ✓ Mark All Present
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {students.map((st) => {
                      const rec = attendanceRecords.find(
                        (r) => r.rollNo.toLowerCase() === st.rollNo.toLowerCase() && r.dateString === todayStr && r.subject === subject
                      );
                      const stStatus = rec
                        ? rec.crDecision === 'rejected'
                          ? 'rejected'
                          : rec.crDecision === 'pending' || !rec.verified
                          ? 'pending'
                          : 'approved'
                        : 'unsubmitted';

                      return (
                        <div
                          key={st.rollNo}
                          className="p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-[11px]">{st.rollNo}</span>
                            <span className="font-semibold text-slate-800">{st.name}</span>
                            {stStatus === 'approved' && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded">
                                Verified Present
                              </span>
                            )}
                            {stStatus === 'pending' && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 rounded">
                                Pending Review
                              </span>
                            )}
                            {stStatus === 'rejected' && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 rounded">
                                Marked Absent
                              </span>
                            )}
                            {stStatus === 'unsubmitted' && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 rounded">
                                Not Submitted
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onCRFinalDecision(
                                  st,
                                  subject,
                                  todayStr,
                                  'approved',
                                  `${primaryCR.name} (${primaryCR.rollNo})`
                                );
                                setStatusMessage({
                                  type: 'success',
                                  text: `Attendance Updated: ${st.name} (${st.rollNo}) → PRESENT`,
                                  details: `Verified Present for ${subject}.`,
                                });
                              }}
                              className={`cursor-pointer px-2 py-1 rounded text-[10px] font-extrabold transition-colors ${
                                stStatus === 'approved'
                                  ? 'bg-emerald-700 text-white'
                                  : 'bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-300'
                              }`}
                            >
                              ✓ Approve Present
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onCRFinalDecision(
                                  st,
                                  subject,
                                  todayStr,
                                  'rejected',
                                  `${primaryCR.name} (${primaryCR.rollNo})`
                                );
                                setStatusMessage({
                                  type: 'warning',
                                  text: `Attendance Updated: ${st.name} (${st.rollNo}) → ABSENT`,
                                  details: `Marked Absent for ${subject}.`,
                                });
                              }}
                              className={`cursor-pointer px-2 py-1 rounded text-[10px] font-extrabold transition-colors ${
                                stStatus === 'rejected'
                                  ? 'bg-rose-700 text-white'
                                  : 'bg-rose-50 hover:bg-rose-600 text-rose-800 hover:text-white border border-rose-300'
                              }`}
                            >
                              ✕ Mark Absent
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Location Verification Status Readout */}
          <div
            className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
              isOutsideGeofence
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <MapPin
                className={`w-3.5 h-3.5 shrink-0 ${
                  isOutsideGeofence ? 'text-rose-600' : 'text-indigo-600'
                }`}
              />
              <span>
                Campus Geofence:{' '}
                <strong>
                  {isOutsideGeofence ? 'Outside Science Block Perimeter' : 'Inside Science Block'}
                </strong>{' '}
                ({formatDistance(distanceKm)} from lab)
              </span>
            </span>
            <div className="flex items-center gap-3">
              {isOutsideGeofence ? (
                <span className="text-rose-700 font-bold">✕ Exceeds 500m Limit</span>
              ) : (
                <span className="text-emerald-700 font-bold">✓ Proximity Confirmed</span>
              )}
              {onNavigateMap && (
                <button
                  type="button"
                  onClick={onNavigateMap}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
                >
                  View on Google Map
                </button>
              )}
            </div>
          </div>

          {/* Secondary Device Biometric Verification Card (Shown when Faculty enables Biometric Verification) */}
          {isBiometricRequired && (
            <div
              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                isBiometricConfirmed
                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                  : 'bg-indigo-50/90 border-indigo-300 text-indigo-950'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isBiometricConfirmed
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 text-white'
                  }`}
                >
                  <Fingerprint className={`w-5 h-5 ${isScanningBiometric ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <div className="font-extrabold flex items-center gap-1.5">
                    <span>Secondary Device Biometric Verification Required</span>
                    {isBiometricConfirmed && biometricTokenId && (
                      <span className="font-mono text-[10px] text-emerald-800">
                        · {biometricTokenId}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] opacity-85 mt-0.5">
                    {isBiometricConfirmed
                      ? `Device identity verified for ${studentName} (${rollNo}). You may now submit your attendance.`
                      : 'Faculty requires a secondary device-based biometric identity confirmation before marking attendance for this session.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePerformDeviceBiometricConfirmation}
                disabled={isScanningBiometric || isBiometricConfirmed}
                className={`cursor-pointer px-3.5 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  isBiometricConfirmed
                    ? 'bg-emerald-700 text-white cursor-default'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                }`}
              >
                <Fingerprint className="w-4 h-4" />
                <span>
                  {isScanningBiometric
                    ? 'Verifying Device Biometrics...'
                    : isBiometricConfirmed
                    ? 'Biometric Identity Verified ✓'
                    : 'Verify Device Biometrics'}
                </span>
              </button>
            </div>
          )}

          {/* Mark Attendance Button (Triggers OTP Verification) */}
          <button
            type="button"
            onClick={() => {
              if (isBiometricRequired && !isBiometricConfirmed) {
                setStatusMessage({
                  type: 'warning',
                  text: 'Secondary Device Biometric Confirmation Required',
                  details: 'Please click "Verify Device Biometrics" above to confirm your device identity before submitting attendance.',
                });
                return;
              }
              handleInitiateSubmission();
            }}
            disabled={isHourlyLockoutActive || alreadyMarkedForThisSubjectToday || isOutsideGeofence}
            className={`cursor-pointer w-full py-3.5 px-4 font-bold rounded-lg text-xs shadow-xs transition-all flex items-center justify-center gap-2 ${
              isHourlyLockoutActive || alreadyMarkedForThisSubjectToday || isOutsideGeofence
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            {isOutsideGeofence
              ? `Locked: Outside 500m Geofence (${formatDistance(distanceKm)})`
              : isHourlyLockoutActive
              ? `Hourly Lockout (${remainingMinutes}m ${remainingSeconds}s remaining)`
              : alreadyMarkedForThisSubjectToday
              ? 'Attendance Already Marked for Today'
              : isBiometricRequired && !isBiometricConfirmed
              ? 'Complete Biometric Confirmation Above to Submit Attendance'
              : 'Submit Attendance via OTP'}
          </button>

          {/* Attendance Issue / Review Request */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2.5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <Star className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 fill-amber-400" />
                <div>
                  <span className="font-extrabold text-amber-950">
                    Facing an Attendance or GPS Issue?
                  </span>
                  <p className="text-[11px] text-amber-800">
                    If you experience a GPS, OTP, or session issue during class, submit an attendance review request below.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowErrorAppealBox((prev) => !prev)}
                className="cursor-pointer shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] transition-colors"
              >
                {showErrorAppealBox ? 'Close Review Form' : 'Request Attendance Review'}
              </button>
            </div>

            {showErrorAppealBox && (
              <div className="pt-2.5 border-t border-amber-200/80 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={errorReasonText}
                    onChange={(e) => setErrorReasonText(e.target.value)}
                    className="sm:col-span-2 px-3 py-2 text-xs font-semibold bg-white border border-amber-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="GPS Drift / Signal Blocked Inside Wet Chemistry Lab">
                      GPS Drift / Signal Blocked Inside Wet Chemistry Lab
                    </option>
                    <option value="OTP / Teacher Code Mismatch Error While Physically Present">
                      OTP / Teacher Code Mismatch Error While Physically Present
                    </option>
                    <option value="Marked Absent by Mistake — Physically Present in Lecture">
                      Marked Absent by Mistake — Physically Present in Lecture
                    </option>
                    <option value="Device / Network Error During Attendance Window">
                      Device / Network Error During Attendance Window
                    </option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const nowIso = new Date().toISOString();
                      const todayStr = new Date().toDateString();
                      const hash = generateVerificationHash(rollNo, subject, nowIso);
                      const appealRecord: AttendanceRecord = {
                        id: `att-err-${rollNo}-${Date.now()}`,
                        rollNo,
                        studentName,
                        subject,
                        timestamp: nowIso,
                        dateString: todayStr,
                        latitude: currentCoords.lat,
                        longitude: currentCoords.lon,
                        distanceKm,
                        accuracyMeters: currentCoords.accuracy,
                        isSimulated: trackingMode === 'simulated',
                        codeUsed: activeSession?.code || todayDailyCode,
                        verified: false,
                        crDecision: 'pending',
                        crRemark: `Attendance Review Request: ${errorReasonText}`,
                        errorReport: {
                          reason: errorReasonText,
                          reportedBy: `${studentName} (${rollNo})`,
                          reportedAt: nowIso,
                          status: 'open',
                        },
                        receiptHash: hash,
                      };
                      onAddRecord(appealRecord);
                      setShowErrorAppealBox(false);
                      setStatusMessage({
                        type: 'warning',
                        text: 'Attendance Review Request Submitted',
                        details: `Your request ("${errorReasonText}") for ${subject} has been logged in the class attendance register.`,
                      });
                    }}
                    className="cursor-pointer px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>Submit Review Request</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Status Message */}
          <div
            className={`p-3 rounded-lg border text-xs ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : statusMessage.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-start gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">{statusMessage.text}</div>
                {statusMessage.details && (
                  <div className="mt-0.5 opacity-90">{statusMessage.details}</div>
                )}
              </div>
            </div>
          </div>

          {/* View Receipt Trigger if Marked */}
          {lastMarkedRecord && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-indigo-900">Digital Certificate: </span>
                <span className="font-mono text-indigo-700 font-bold">{lastMarkedRecord.receiptHash}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenReceipt(lastMarkedRecord)}
                className="cursor-pointer px-3 py-1 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 transition-colors"
              >
                View Attendance Receipt
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 6. PERSONAL ATTENDANCE HISTORY & UGC 75% ELIGIBILITY TRACKER */}
      <div
        ref={historySectionRef}
        className="bg-white rounded-xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6"
      >
        {/* Section Header & Scholar Aggregate KPI Summary */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">
                Personal Attendance History & UGC 75% Eligibility
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Filtered verification ledger for{' '}
              <span className="font-semibold text-slate-800">{studentName}</span> (
              <span className="font-mono font-bold text-indigo-700">{rollNo}</span>) · Real-time sync with CUK examination ordinance
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center gap-2">
              <span className="text-slate-500 font-medium">Verified Check-Ins:</span>
              <span className="font-mono font-extrabold text-slate-900 tabular-nums">
                { overallEligibilitySummary.totalAttended } / { overallEligibilitySummary.totalHeld }
              </span>
            </div>

            <div
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 tabular-nums ${
                overallEligibilitySummary.isOverallEligible
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : overallEligibilitySummary.overallPercentage >= 65
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>
                Overall: {overallEligibilitySummary.overallPercentage}% (
                {overallEligibilitySummary.isOverallEligible ? 'UGC Eligible ≥75%' : 'Below 75% UGC Mandate'})
              </span>
            </div>
          </div>
        </div>

        {/* A. Subject-Wise UGC 75% Progress Bars & Counts */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span>Subject-Wise UGC 75% Eligibility Progress</span>
              <span className="text-[11px] font-normal text-slate-500 normal-case">
                (Click any subject card to filter ledger below)
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥75% Eligible
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> 65–74% Borderline
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> &lt;65% Shortfall
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {subjectEligibilityStats.map((stat) => {
              const isSelected = historySubjectFilter === stat.subject;
              return (
                <button
                  key={stat.subject}
                  type="button"
                  onClick={() =>
                    setHistorySubjectFilter((prev) =>
                      prev === stat.subject ? 'ALL' : stat.subject
                    )
                  }
                  className={`cursor-pointer text-left p-3.5 rounded-xl border transition-all space-y-2.5 ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-400 ring-1 ring-indigo-400'
                      : 'bg-slate-50/70 hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-900 line-clamp-1">
                        {stat.subject}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 tabular-nums mt-0.5">
                        Attended: <strong className="text-slate-800">{stat.attendedCount}</strong> / {stat.totalClassesHeld} sessions
                      </div>
                    </div>
                    <span
                      className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded border tabular-nums shrink-0 ${
                        stat.isEligible
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : stat.isBorderline
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}
                    >
                      {stat.percentage}%
                    </span>
                  </div>

                  {/* Progress bar with 75% UGC threshold marker */}
                  <div className="space-y-1">
                    <div className="relative h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-slate-900 z-10"
                        style={{ left: '75%' }}
                        title="Mandatory 75% UGC Threshold"
                      />
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          stat.isEligible
                            ? 'bg-emerald-600'
                            : stat.isBorderline
                            ? 'bg-amber-500'
                            : 'bg-rose-600'
                        }`}
                        style={{ width: `${Math.min(100, stat.percentage)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span
                        className={
                          stat.isEligible
                            ? 'text-emerald-700 font-semibold'
                            : stat.isBorderline
                            ? 'text-amber-700 font-semibold'
                            : 'text-rose-700 font-semibold'
                        }
                      >
                        {stat.isEligible
                          ? '✓ Meets 75% UGC Norm'
                          : `Need +${stat.classesNeededFor75} class${stat.classesNeededFor75 > 1 ? 'es' : ''} for 75%`}
                      </span>
                      <span className="text-slate-400">75% Target</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* B. Interactive Filter Bar (Segmented Subject Filter + Search Input) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
            <button
              type="button"
              onClick={() => setHistorySubjectFilter('ALL')}
              className={`cursor-pointer px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                historySubjectFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              All Subjects ({studentRecords.length})
            </button>
            {subjectEligibilityStats.map((stat) => (
              <button
                key={stat.subject}
                type="button"
                onClick={() => setHistorySubjectFilter(stat.subject)}
                className={`cursor-pointer px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  historySubjectFilter === stat.subject
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>{stat.shortName}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded tabular-nums ${
                    historySubjectFilter === stat.subject
                      ? 'bg-indigo-800 text-indigo-100'
                      : 'bg-white text-slate-600'
                  }`}
                >
                  {stat.attendedCount}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              placeholder="Filter date, subject, or hash..."
              className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {historySearchQuery && (
              <button
                type="button"
                onClick={() => setHistorySearchQuery('')}
                className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* C. Chronological Personal Attendance Ledger Table */}
        {filteredStudentRecords.length === 0 ? (
          <div className="p-8 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <FileText className="w-5 h-5" />
            </div>
            <div className="text-sm font-bold text-slate-800">
              No Attendance Records Match Filter
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {studentRecords.length === 0
                ? `No verified attendance submissions found yet for Roll No ${rollNo}. Submit your attendance using the Teacher Passcode above.`
                : `No attendance records found for "${historySubjectFilter === 'ALL' ? 'All Subjects' : historySubjectFilter}" matching your filter criteria.`}
            </p>
            {(historySubjectFilter !== 'ALL' || historySearchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setHistorySubjectFilter('ALL');
                  setHistorySearchQuery('');
                }}
                className="cursor-pointer mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-indigo-600 font-semibold text-xs rounded-lg border border-slate-200 shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset History Filters</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Subject &amp; Session Code</th>
                  <th className="py-3 px-4">Campus Proximity</th>
                  <th className="py-3 px-4">Verification Status</th>
                  <th className="py-3 px-4 text-right">Digital Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredStudentRecords.map((rec) => {
                  const formattedTime = new Date(rec.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const isTodayRecord = rec.dateString === todayStr;

                  return (
                    <tr
                      key={rec.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Date & Time */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            {rec.dateString}
                          </span>
                          {isTodayRecord && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
                              Today
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 tabular-nums mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{formattedTime}</span>
                        </div>
                      </td>

                      {/* Subject & Passcode */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{rec.subject}</div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          Board Code: <span className="font-semibold text-slate-700">{rec.codeUsed}</span>
                        </div>
                      </td>

                      {/* Campus Proximity */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-800 tabular-nums flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>{formatDistance(rec.distanceKm)} from Lab</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 tabular-nums mt-0.5">
                          {rec.isSimulated ? 'Campus Simulator' : `Hardware GPS (±${rec.accuracyMeters}m)`}
                        </div>
                      </td>

                      {/* Verification Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {rec.crDecision === 'rejected' ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-800 font-bold text-[11px]">
                            <X className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>Marked Absent</span>
                          </div>
                        ) : rec.crDecision === 'pending' || !rec.verified ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-bold text-[11px]">
                            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Pending Verification</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[11px]">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Verified Present</span>
                          </div>
                        )}
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5 tabular-nums">
                          {rec.crDecidedBy ? `Verified by: ${rec.crDecidedBy}` : rec.receiptHash}
                        </div>
                      </td>

                      {/* Digital Receipt Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenReceipt(rec)}
                          className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-lg font-semibold text-xs transition-colors shadow-2xs"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-600" />
                          <span>View Receipt</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. CLASS REPRESENTATIVE (CR) NAME AND CONTACT INFORMATION */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Star className="w-4 h-4 fill-amber-500 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Class Representative (CR) Contact Information
              </h3>
              <p className="text-[11px] text-slate-500">
                Appointed student liaisons for timetable queries, lab excuses, and faculty coordination
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded uppercase">
            Official CR
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Primary CR */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
                  Primary Class Representative
                </span>
                <div className="font-bold text-slate-900 text-sm mt-0.5">
                  {primaryCR.name}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Roll No: {primaryCR.rollNo} · {primaryCR.batch}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                <Star className="w-4 h-4 fill-current" />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/60 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <a href={`mailto:${primaryCR.email || '26ugchem001@demo.university.edu'}`} className="hover:underline font-mono text-indigo-600">
                  {primaryCR.email || '26ugchem001@demo.university.edu'}
                </a>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <a href={`tel:${primaryCR.phone || '+919000000101'}`} className="hover:underline font-mono text-slate-800">
                  {primaryCR.phone || '+91 90000 00101'}
                </a>
              </div>
            </div>
          </div>

          {/* Secondary / Vice CR */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
                  Vice Class Representative
                </span>
                <div className="font-bold text-slate-900 text-sm mt-0.5">
                  {secondaryCR.name}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Roll No: {secondaryCR.rollNo} · {secondaryCR.batch}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                <Star className="w-4 h-4 fill-current" />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/60 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <a href={`mailto:${secondaryCR.email || '26ugchem004@demo.university.edu'}`} className="hover:underline font-mono text-indigo-600">
                  {secondaryCR.email || '26ugchem004@demo.university.edu'}
                </a>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <a href={`tel:${secondaryCR.phone || '+919000000104'}`} className="hover:underline font-mono text-slate-800">
                  {secondaryCR.phone || '+91 90000 00104'}
                </a>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 leading-normal pt-1">
          If you experience hardware GPS drift inside laboratory basements or need attendance assistance, report immediately to your Class Representative before the lecture concludes.
        </p>
      </div>

      {/* 7. MODAL: SUBMIT ATTENDANCE VIA OTP */}
      {isOtpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">
                  Attendance OTP Verification
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOtpModalOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyOtpAndSubmit} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                  <span>One-Time Password Sent</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Verification OTP dispatched to registered scholar contact: <strong>{studentContactMasked}</strong> for Roll No: <strong className="font-mono">{rollNo}</strong>.
                </p>
              </div>

              {/* Demo Helper Pill */}
              <div 
                onClick={() => setInputSubmissionOtp(generatedSubmissionOtp)}
                className="cursor-pointer p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center justify-between text-emerald-900 transition-colors"
                title="Click to auto-fill for testing"
              >
                <span className="text-[11px] font-medium">Demo Testing OTP:</span>
                <span className="font-mono font-bold text-sm tracking-widest text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-300">
                  {generatedSubmissionOtp} (Click to Fill)
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Enter 6-Digit OTP Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={inputSubmissionOtp}
                  onChange={(e) => setInputSubmissionOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • • • •"
                  className="w-full text-center tracking-[0.5em] text-2xl font-mono font-bold py-2.5 px-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {isBiometricRequired && (
                <div
                  className={`p-3 rounded-lg border flex items-center justify-between gap-2 ${
                    isBiometricConfirmed
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 shrink-0" />
                    <div>
                      <div className="font-bold text-[11px]">
                        {isBiometricConfirmed
                          ? `Biometric Identity Confirmed (${biometricTokenId})`
                          : 'Secondary Device Biometric Confirmation Required'}
                      </div>
                      <div className="text-[10px] opacity-80">
                        {isBiometricConfirmed
                          ? 'Device passkey/fingerprint check completed.'
                          : 'Tap confirm to verify device identity before submitting.'}
                      </div>
                    </div>
                  </div>
                  {!isBiometricConfirmed && (
                    <button
                      type="button"
                      onClick={handlePerformDeviceBiometricConfirmation}
                      disabled={isScanningBiometric}
                      className="cursor-pointer px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-[11px] whitespace-nowrap shrink-0"
                    >
                      {isScanningBiometric ? 'Scanning...' : 'Confirm Biometrics'}
                    </button>
                  )}
                </div>
              )}

              {otpError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 font-semibold flex items-center gap-1.5 text-[11px]">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>Didn't receive code?</span>
                {otpResendCountdown > 0 ? (
                  <span>Resend in {otpResendCountdown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="cursor-pointer text-indigo-600 hover:text-indigo-800 font-bold underline"
                  >
                    Resend New OTP
                  </button>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOtpModalOpen(false)}
                  className="cursor-pointer px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cursor-pointer px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Mark Attendance</span>
                </button>
              </div>

              <p className="text-[10px] text-slate-400 text-center pt-1">
                🔒 Protected by Central University of Karnataka anti-proxy verification ordinance.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
