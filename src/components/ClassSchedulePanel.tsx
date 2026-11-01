import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Play, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  Sparkles, 
  FlaskConical, 
  BookOpen, 
  Lock,
  ArrowRight,
  ShieldCheck,
  Star
} from 'lucide-react';
import { ClassScheduleSlot, ChemistrySubject, UserRole, ActiveSession, StudentProfile } from '../types/attendance';
import { SUBJECTS } from '../data/mockData';

interface ClassSchedulePanelProps {
  schedule: ClassScheduleSlot[];
  activeSession: ActiveSession;
  currentUserRole: UserRole;
  currentStudentRoll?: string;
  onUpdateSchedule: (newSchedule: ClassScheduleSlot[]) => void;
  onRenewSlotAttendance: (slot: ClassScheduleSlot) => void;
  onSelectSlotForCheckIn?: (slot: ClassScheduleSlot) => void;
}

export const ClassSchedulePanel: React.FC<ClassSchedulePanelProps> = ({
  schedule,
  activeSession,
  currentUserRole,
  currentStudentRoll,
  onUpdateSchedule,
  onRenewSlotAttendance,
  onSelectSlotForCheckIn,
}) => {
  const canManage = currentUserRole === 'faculty' || currentUserRole === 'cr';

  const [currentTimeStr, setCurrentTimeStr] = useState<string>(() => {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  // Ticking clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeStr(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Modal states for creating / editing schedule
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingSlot, setEditingSlot] = useState<ClassScheduleSlot | null>(null);

  // Form states
  const [periodNumber, setPeriodNumber] = useState<number>(1);
  const [periodName, setPeriodName] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('10:00');
  const [subject, setSubject] = useState<ChemistrySubject>('Organic Chemistry');
  const [facultyName, setFacultyName] = useState<string>('Dr. V. Ramanathan');
  const [room, setRoom] = useState<string>('Lecture Hall CH-101');
  const [isLab, setIsLab] = useState<boolean>(false);

  const handleOpenAdd = () => {
    setEditingSlot(null);
    setPeriodNumber(schedule.length + 1);
    setPeriodName(`Period ${schedule.length + 1}`);
    setStartTime('10:00');
    setEndTime('11:00');
    setSubject('Physical Chemistry');
    setFacultyName(currentUserRole === 'cr' ? 'Aarav Sharma (CR)' : 'Dr. V. Ramanathan');
    setRoom('Lecture Hall CH-101');
    setIsLab(false);
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (slot: ClassScheduleSlot) => {
    setEditingSlot(slot);
    setPeriodNumber(slot.periodNumber);
    setPeriodName(slot.periodName);
    setStartTime(slot.startTime);
    setEndTime(slot.endTime);
    setSubject(slot.subject);
    setFacultyName(slot.facultyName);
    setRoom(slot.room);
    setIsLab(!!slot.isLab);
    setIsEditModalOpen(true);
  };

  const handleSaveSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodName.trim()) return;

    if (editingSlot) {
      const updated = schedule.map((s) =>
        s.id === editingSlot.id
          ? {
              ...s,
              periodNumber,
              periodName: periodName.trim(),
              startTime,
              endTime,
              subject,
              facultyName: facultyName.trim(),
              room: room.trim(),
              isLab,
            }
          : s
      );
      onUpdateSchedule(updated);
    } else {
      const newSlot: ClassScheduleSlot = {
        id: `sched-${Date.now()}`,
        periodNumber,
        periodName: periodName.trim(),
        startTime,
        endTime,
        subject,
        facultyName: facultyName.trim(),
        room: room.trim(),
        day: 'Daily',
        isLab,
        isOpenForAttendance: false,
        attendanceRenewedAt: new Date().toISOString(),
      };
      onUpdateSchedule([...schedule, newSlot]);
    }

    setIsEditModalOpen(false);
  };

  const handleDeleteSlot = (id: string) => {
    if (confirm('Are you sure you want to delete this schedule period?')) {
      onUpdateSchedule(schedule.filter((s) => s.id !== id));
    }
  };

  // Find currently active slot in schedule based on time or active session
  const currentSlot = schedule.find((s) => s.isOpenForAttendance) || schedule[0];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                Department of Chemistry · Academic Timetable
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Clock className="w-3 h-3" /> Live: {currentTimeStr}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
              Class Schedule & Attendance Periods
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Attendance windows are renewed automatically with each scheduled lecture hour. Hourly submission limits are reset per timetable period.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canManage && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="cursor-pointer px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Add Schedule Period
              </button>
            )}
          </div>
        </div>

        {/* Informational Policy Box */}
        <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-start gap-3">
            <div className="w-7 h-7 rounded-md bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-indigo-900">1-Hour Attendance Rule</div>
              <div className="text-slate-600 text-[11px] mt-0.5">
                Students can only submit attendance once per 60 minutes for each active lecture hour.
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-100 flex items-start gap-3">
            <div className="w-7 h-7 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-emerald-900">Scheduled Renewal</div>
              <div className="text-slate-600 text-[11px] mt-0.5">
                When the next class period begins, attendance eligibility is instantly renewed for that course.
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-100 flex items-start gap-3">
            <div className="w-7 h-7 rounded-md bg-amber-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-amber-900">OTP Submission Guard</div>
              <div className="text-slate-600 text-[11px] mt-0.5">
                Every attendance submission requires OTP confirmation so no proxy marking is possible.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Table / List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <h2 className="font-bold text-sm text-slate-800">
              Department Daily Lecture & Practical Rotation
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {schedule.length} Periods Scheduled Today
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {schedule.map((slot, index) => {
            const isActive = slot.isOpenForAttendance || slot.subject === activeSession.subject;
            const renewedDate = slot.attendanceRenewedAt ? new Date(slot.attendanceRenewedAt) : null;
            const renewedFormatted = renewedDate
              ? renewedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
              : 'Initial';

            return (
              <div
                key={slot.id}
                className={`p-5 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isActive ? 'bg-indigo-50/40 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50/60'
                }`}
              >
                {/* Left: Timing & Period Details */}
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-slate-100 text-slate-700 font-bold shrink-0 border border-slate-200">
                    <span className="text-xs uppercase text-slate-500">Slot</span>
                    <span className="text-lg text-indigo-600 leading-none mt-0.5">{slot.periodNumber}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {slot.startTime} - {slot.endTime}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          ACTIVE NOW · ATTENDANCE OPEN
                        </span>
                      )}
                      {slot.isLab && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          <FlaskConical className="w-3 h-3" /> Practical Lab
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {slot.subject}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Faculty: <strong className="text-slate-800">{slot.facultyName}</strong></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{slot.room}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-500">
                        <RefreshCw className="w-3 h-3 text-indigo-500" />
                        <span>Renewed: {renewedFormatted}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0">
                  {/* Student View: Quick Check-in Button */}
                  {currentUserRole === 'student' && (
                    <button
                      type="button"
                      onClick={() => onSelectSlotForCheckIn && onSelectSlotForCheckIn(slot)}
                      className={`cursor-pointer px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                        isActive
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                      }`}
                    >
                      <span>Check-In for this Class</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Faculty & CR View: Renew attendance for this slot */}
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => onRenewSlotAttendance(slot)}
                        className={`cursor-pointer px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs ${
                          isActive
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                        }`}
                        title="Renew attendance period now: resets 1-hour eligibility for this class"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{isActive ? 'Renew Attendance Now' : 'Activate & Open Attendance'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEdit(slot)}
                        className="cursor-pointer p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                        title="Edit slot"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(slot.id)}
                        className="cursor-pointer p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
                        title="Delete slot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit / Add Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  {editingSlot ? 'Edit Scheduled Period' : 'Add New Class Slot'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSlot} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Period Number
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={periodNumber}
                    onChange={(e) => setPeriodNumber(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Period Label
                  </label>
                  <input
                    type="text"
                    value={periodName}
                    onChange={(e) => setPeriodName(e.target.value)}
                    placeholder="e.g. Period 2 (10:00 - 11:00 AM)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chemistry Subject
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value as ChemistrySubject)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  {SUBJECTS.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Faculty / CR In-Charge
                </label>
                <input
                  type="text"
                  value={facultyName}
                  onChange={(e) => setFacultyName(e.target.value)}
                  placeholder="e.g. Dr. V. Ramanathan / Aarav Sharma (CR)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lecture Hall / Laboratory Room
                </label>
                <input
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="e.g. Lecture Hall CH-101 / Central Chemistry Lab"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isLabCheck"
                  checked={isLab}
                  onChange={(e) => setIsLab(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                />
                <label htmlFor="isLabCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Practical Laboratory Session (Geotagged inside CIF Lab)
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="cursor-pointer px-4 py-2 border border-slate-300 text-slate-700 font-semibold text-xs rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cursor-pointer px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors shadow-xs"
                >
                  Save Schedule Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
