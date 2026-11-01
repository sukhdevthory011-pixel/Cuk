import { AttendanceRecord, ChemistrySubject, StudentProfile } from '../types/attendance';
import { SUBJECTS, CONDUCTED_LECTURES_PER_SUBJECT } from '../data/mockData';

export const UGC_ELIGIBILITY_THRESHOLD_PERCENT = 75;

export interface SubjectAttendanceSummary {
  subject: ChemistrySubject;
  shortName: string;
  attended: number;
  conducted: number;
  percentage: number;
  isEligible: boolean;
  classesNeededFor75: number;
}

export interface StudentComplianceSummary {
  rollNo: string;
  name: string;
  semester: string;
  batch: string;
  organic: number;
  inorganic: number;
  physical: number;
  analytical: number;
  spectroscopy: number;
  advancedLab: number;
  totalAttended: number;
  totalConducted: number;
  overallRate: number;
  liveCheckIns: number;
  isDefaulter: boolean;
  subjectBreakdown: Record<ChemistrySubject, SubjectAttendanceSummary>;
}

/**
 * Compute how many distinct sessions have been conducted for a given subject
 * based on distinct dates in the records or the baseline minimum conducted count.
 */
export function getConductedCountForSubject(
  subject: ChemistrySubject,
  allRecords: AttendanceRecord[]
): number {
  const distinctDates = new Set(
    allRecords.filter((r) => r.subject === subject).map((r) => r.dateString)
  );
  const baseline = CONDUCTED_LECTURES_PER_SUBJECT[subject] || 4;
  return Math.max(baseline, distinctDates.size);
}

/**
 * Compute a single student's authoritative attendance summary across all subjects.
 */
export function computeStudentAttendanceSummary(
  student: StudentProfile,
  allRecords: AttendanceRecord[],
  conductedCountsOverride?: Partial<Record<ChemistrySubject, number>>
): StudentComplianceSummary {
  const normRoll = student.rollNo.trim().toLowerCase();
  const studentPresentRecords = allRecords.filter(
    (r) =>
      r.rollNo.trim().toLowerCase() === normRoll &&
      r.status !== 'absent' &&
      r.verified
  );

  let totalAttended = 0;
  let totalConducted = 0;

  const subjectBreakdown = {} as Record<ChemistrySubject, SubjectAttendanceSummary>;

  for (const sub of SUBJECTS) {
    const conducted =
      conductedCountsOverride?.[sub] ?? getConductedCountForSubject(sub, allRecords);

    // Count distinct session dates attended by this student for this subject
    const attendedDates = new Set(
      studentPresentRecords
        .filter((r) => r.subject === sub)
        .map((r) => r.dateString)
    );
    const attended = Math.min(conducted, attendedDates.size);
    const percentage = conducted > 0 ? Math.round((attended / conducted) * 100) : 100;
    const isEligible = percentage >= UGC_ELIGIBILITY_THRESHOLD_PERCENT;

    // Calculate how many consecutive future classes must be attended to reach >= 75%:
    // (attended + x) / (conducted + x) >= 0.75  =>  x >= 3*conducted - 4*attended
    const classesNeededFor75 = isEligible
      ? 0
      : Math.max(1, 3 * conducted - 4 * attended);

    totalAttended += attended;
    totalConducted += conducted;

    subjectBreakdown[sub] = {
      subject: sub,
      shortName: sub.replace(' Chemistry', '').replace(' & Chromatography', ''),
      attended,
      conducted,
      percentage,
      isEligible,
      classesNeededFor75,
    };
  }

  const overallRate =
    totalConducted > 0 ? Math.round((totalAttended / totalConducted) * 100) : 100;

  return {
    rollNo: student.rollNo,
    name: student.name,
    semester: student.semester,
    batch: student.batch,
    organic: subjectBreakdown['Organic Chemistry'].percentage,
    inorganic: subjectBreakdown['Inorganic Chemistry'].percentage,
    physical: subjectBreakdown['Physical Chemistry'].percentage,
    analytical: subjectBreakdown['Analytical Chemistry'].percentage,
    spectroscopy: subjectBreakdown['Spectroscopy & Chromatography'].percentage,
    advancedLab: subjectBreakdown['Advanced Chemistry Lab'].percentage,
    totalAttended,
    totalConducted,
    overallRate,
    liveCheckIns: studentPresentRecords.length,
    isDefaulter: overallRate < UGC_ELIGIBILITY_THRESHOLD_PERCENT,
    subjectBreakdown,
  };
}

/**
 * Compute aggregate class-wide compliance by subject from authoritative records.
 */
export function computeClassSubjectCompliance(
  students: StudentProfile[],
  allRecords: AttendanceRecord[]
) {
  const totalEnrolled = Math.max(1, students.length);

  return SUBJECTS.map((sub) => {
    const conducted = getConductedCountForSubject(sub, allRecords);
    const totalPossibleAttendances = conducted * totalEnrolled;

    let totalStudentAttendances = 0;
    for (const st of students) {
      const normRoll = st.rollNo.trim().toLowerCase();
      const attendedDates = new Set(
        allRecords
          .filter(
            (r) =>
              r.rollNo.trim().toLowerCase() === normRoll &&
              r.subject === sub &&
              r.status !== 'absent' &&
              r.verified
          )
          .map((r) => r.dateString)
      );
      totalStudentAttendances += Math.min(conducted, attendedDates.size);
    }

    const complianceRate =
      totalPossibleAttendances > 0
        ? Math.round((totalStudentAttendances / totalPossibleAttendances) * 100)
        : 0;

    return {
      subject: sub,
      shortName: sub.replace(' Chemistry', '').replace(' & Chromatography', ''),
      complianceRate,
      attendedCount: totalStudentAttendances,
      totalClasses: conducted,
      totalPossibleAttendances,
      status:
        complianceRate >= UGC_ELIGIBILITY_THRESHOLD_PERCENT
          ? 'Eligible'
          : 'Defaulter Alert',
    };
  });
}
