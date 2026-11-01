import React from 'react';
import { 
  X, 
  Printer, 
  ShieldCheck, 
  MapPin, 
  Calendar, 
  Clock, 
  Award,
  CheckCircle2
} from 'lucide-react';
import { AttendanceRecord } from '../types/attendance';
import { formatDistance } from '../utils/geo';

interface AttendanceReceiptModalProps {
  record: AttendanceRecord | null;
  onClose: () => void;
}

export const AttendanceReceiptModal: React.FC<AttendanceReceiptModalProps> = ({
  record,
  onClose,
}) => {
  if (!record) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold">
              <Award className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                Central University of Karnataka
              </div>
              <div className="text-sm font-bold text-white">
                Official Attendance Certificate
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Certificate Body */}
        <div className="p-6 space-y-5 text-xs text-slate-700">
          <div className="text-center py-2 border-b border-slate-100">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
              Cryptographic Receipt ID
            </span>
            <span className="font-mono text-sm font-black text-indigo-700 bg-indigo-50 px-3 py-1 rounded border border-indigo-200">
              {record.receiptHash}
            </span>
          </div>

          {/* Student Info Grid */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Student Roll No</span>
              <span className="font-mono font-bold text-slate-900 text-sm">{record.rollNo}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Student Name</span>
              <span className="font-semibold text-slate-900 text-sm">{record.studentName}</span>
            </div>
            <div className="col-span-2 pt-2 border-t border-slate-200/60">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Subject / Course</span>
              <span className="font-bold text-indigo-900 text-sm">{record.subject}</span>
            </div>
          </div>

          {/* Verification Audit Trail */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-500">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Date
              </span>
              <span className="font-medium text-slate-900">{record.dateString}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-500">
                <Clock className="w-3.5 h-3.5 text-indigo-600" /> Timestamp
              </span>
              <span className="font-mono text-slate-900">
                {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-500">
                <MapPin className="w-3.5 h-3.5 text-indigo-600" /> Distance from Dept
              </span>
              <span className="font-mono font-semibold text-slate-900">
                {formatDistance(record.distanceKm)} (±{record.accuracyMeters}m accuracy)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Fix Coordinates</span>
              <span className="font-mono text-[11px] text-slate-600">
                {record.latitude.toFixed(4)}°N, {record.longitude.toFixed(4)}°E
              </span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
              <span className="text-slate-500 font-semibold">Verification Status</span>
              <span
                className={`font-bold text-[11px] px-2 py-0.5 rounded border ${
                  record.crDecision === 'rejected'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : record.crDecision === 'pending' || !record.verified
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {record.crDecision === 'rejected'
                  ? '✕ Marked Absent'
                  : record.crDecision === 'pending' || !record.verified
                  ? '⏳ Pending Verification'
                  : '✓ Verified Present'}
              </span>
            </div>
            {record.crDecidedBy && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Verified By</span>
                <span className="font-semibold text-[11px] text-indigo-800">{record.crDecidedBy}</span>
              </div>
            )}
          </div>

          {/* Official Stamp Box */}
          {record.crDecision === 'rejected' ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3">
              <X className="w-6 h-6 text-rose-600 shrink-0" />
              <div>
                <div className="font-bold text-rose-900 text-xs">Status: Marked Absent</div>
                <div className="text-[11px] text-rose-700">
                  {record.crRemark || 'Attendance was marked absent in the session verification register.'}
                </div>
              </div>
            </div>
          ) : record.crDecision === 'pending' || !record.verified ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
              <Clock className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <div className="font-bold text-amber-900 text-xs">Pending Session Verification</div>
                <div className="text-[11px] text-amber-700">
                  Submission logged. Attendance verification status will be updated in the class register.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <div className="font-bold text-emerald-900 text-xs">Official Status: Verified Present</div>
                <div className="text-[11px] text-emerald-700">
                  Geofence, classroom OTP, and session verification confirmed for CUK UGC compliance.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium text-xs"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Official Slip
          </button>
        </div>
      </div>
    </div>
  );
};
