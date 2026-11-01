import React, { useState } from 'react';
import { 
  Bell, 
  Pin, 
  Plus, 
  Search, 
  Calendar, 
  User, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  X,
  BookOpen,
  FlaskConical,
  GraduationCap,
  Star,
  Mail,
  Phone,
  Lock,
  Clock,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { DepartmentNotice, UserRole, StudentProfile, ClassScheduleSlot } from '../types/attendance';

interface InformationPanelProps {
  notices: DepartmentNotice[];
  currentUserRole: UserRole;
  currentUserName: string;
  currentStudentRoll?: string;
  students?: StudentProfile[];
  schedule?: ClassScheduleSlot[];
  onAddNotice: (notice: DepartmentNotice) => void;
  onEditNotice: (notice: DepartmentNotice) => void;
  onDeleteNotice: (id: string) => void;
  onTogglePin: (id: string) => void;
  onNavigateSchedule?: () => void;
  onNavigateAttendance?: () => void;
}

export const InformationPanel: React.FC<InformationPanelProps> = ({
  notices,
  currentUserRole,
  currentUserName,
  currentStudentRoll = '26ugchem001',
  students = [],
  schedule = [],
  onAddNotice,
  onEditNotice,
  onDeleteNotice,
  onTogglePin,
  onNavigateSchedule,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [editingNotice, setEditingNotice] = useState<DepartmentNotice | null>(null);
  const [readingNotice, setReadingNotice] = useState<DepartmentNotice | null>(null);

  // Form state
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [category, setCategory] = useState<DepartmentNotice['category']>('Academic');
  const [isPinned, setIsPinned] = useState<boolean>(false);

  // Permission check: Only Faculty and CR can add/edit notices
  const canEdit = currentUserRole === 'faculty' || currentUserRole === 'cr';
  const isStudent = currentUserRole === 'student';

  const filteredNotices = notices.filter((n) => {
    const matchSearch =
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = selectedCategory === 'All' || n.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  // Sort pinned notices first
  const sortedNotices = [...filteredNotices].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  const handleOpenCreate = () => {
    setTitle('');
    setContent('');
    setCategory('Academic');
    setIsPinned(false);
    setEditingNotice(null);
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (n: DepartmentNotice) => {
    setTitle(n.title);
    setContent(n.content);
    setCategory(n.category);
    setIsPinned(!!n.isPinned);
    setEditingNotice(n);
    setIsCreateModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    if (editingNotice) {
      onEditNotice({
        ...editingNotice,
        title: title.trim(),
        content: content.trim(),
        category,
        isPinned,
      });
    } else {
      const newNotice: DepartmentNotice = {
        id: `not-${Date.now()}`,
        title: title.trim(),
        content: content.trim(),
        category,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        author: currentUserName,
        authorRole: currentUserRole === 'faculty' ? 'Faculty' : 'CR',
        isPinned,
      };
      onAddNotice(newNotice);
    }

    setIsCreateModalOpen(false);
  };

  // Find CRs from students
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

  // Find active schedule slot
  const activeSlot = schedule.find((s) => s.isOpenForAttendance) || schedule[0];

  return (
    <div className="space-y-6">
      {/* 1. STUDENT SUMMARY & CR CONTACT SECTION (Especially prominent for students) */}
      {isStudent && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Student Profile Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-3">
            <div>
              <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                Student Verified Profile
              </div>
              <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                {currentUserName}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono font-bold text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {currentStudentRoll}
                </span>
                <span className="text-[11px] text-slate-500">M.Sc. Chemistry</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                Verified via OTP
              </span>
              <span className="text-slate-500 font-medium">75% UGC Rule Compliant</span>
            </div>
          </div>

          {/* Primary CR Contact Card */}
          <div className="bg-white rounded-xl border border-amber-200/80 p-5 shadow-xs flex flex-col justify-between space-y-3 bg-amber-50/20">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                  Primary Class Representative (CR)
                </span>
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Star className="w-3 h-3 fill-current" />
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                {primaryCR.name}
              </h3>
              <div className="text-[11px] font-mono text-slate-500">
                Roll No: {primaryCR.rollNo}
              </div>
            </div>

            <div className="pt-2 border-t border-amber-100 space-y-1 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600">
                <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <a href={`tel:${primaryCR.phone || '+919000000101'}`} className="hover:underline font-mono text-slate-800 font-semibold">
                  {primaryCR.phone || '+91 90000 00101'}
                </a>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <a href={`mailto:${primaryCR.email || '26ugchem001@demo.university.edu'}`} className="hover:underline font-mono text-indigo-600 text-[11px]">
                  {primaryCR.email || '26ugchem001@demo.university.edu'}
                </a>
              </div>
            </div>
          </div>

          {/* Secondary CR & Class Schedule Link */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Vice Class Representative (CR)
                </span>
                <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                {secondaryCR.name}
              </h3>
              <div className="text-[11px] font-mono text-slate-500">
                Roll: {secondaryCR.rollNo} · <a href={`tel:${secondaryCR.phone || '+919000000104'}`} className="text-emerald-700 font-semibold underline">{secondaryCR.phone || '+91 90000 00104'}</a>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              {onNavigateSchedule && (
                <button
                  type="button"
                  onClick={onNavigateSchedule}
                  className="cursor-pointer w-full py-1.5 px-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold flex items-center justify-between transition-colors border border-indigo-200"
                >
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>View Class Schedule (Renewals)</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. TOP BANNER & SEARCH */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Department of Chemistry · Central University of Karnataka
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Information & Notice Bulletin
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Official circulars, exam notifications, laboratory schedules, and lecture coordination for faculty and scholars.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canEdit ? (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Post Announcement ({currentUserRole.toUpperCase()})
              </button>
            ) : (
              <div className="text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5 font-medium">
                <Bell className="w-3.5 h-3.5 text-indigo-600" />
                <span>Student Official Bulletin</span>
              </div>
            )}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="pt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search circulars, exams, labs..."
              className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
            {['All', 'Academic', 'Exam', 'Lab Safety', 'Seminar', 'General'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`cursor-pointer px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {sortedNotices.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-slate-500 text-xs bg-white rounded-xl border border-slate-200">
            No notices found matching your criteria.
          </div>
        ) : (
          sortedNotices.map((notice) => (
            <div
              key={notice.id}
              className={`bg-white rounded-xl border p-6 shadow-xs space-y-3 transition-all ${
                notice.isPinned ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      notice.category === 'Exam' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                      notice.category === 'Lab Safety' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      notice.category === 'Seminar' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                      'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}>
                      {notice.category}
                    </span>

                    {notice.isPinned && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        <Pin className="w-3 h-3 fill-amber-500" />
                        Pinned Notice
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm leading-snug pt-1">
                    {notice.title}
                  </h3>
                </div>

                {/* Edit & Delete Controls for Faculty & CR */}
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onTogglePin(notice.id)}
                      className={`cursor-pointer p-1.5 rounded transition-colors ${
                        notice.isPinned ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:text-slate-600'
                      }`}
                      title={notice.isPinned ? 'Unpin' : 'Pin to top'}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(notice)}
                      className="cursor-pointer p-1.5 text-slate-400 hover:text-indigo-600 rounded"
                      title="Edit Notice"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteNotice(notice.id)}
                      className="cursor-pointer p-1.5 text-slate-400 hover:text-rose-600 rounded"
                      title="Delete Notice"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line line-clamp-4">
                {notice.content}
              </p>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-medium text-slate-700">{notice.author}</span>
                  <span className="text-[10px] opacity-75">({notice.authorRole})</span>
                </span>
                
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 font-mono text-slate-400">
                    <Calendar className="w-3 h-3" />
                    {notice.date}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReadingNotice(notice)}
                    className="cursor-pointer font-bold text-indigo-600 hover:text-indigo-800 text-[11px] underline"
                  >
                    Read Full
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Read Full Notice */}
      {readingNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-400" />
                <span className="font-bold text-sm uppercase tracking-wider text-indigo-300">
                  {readingNotice.category} Circular
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReadingNotice(null)}
                className="cursor-pointer text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <h2 className="text-lg font-bold text-slate-900 leading-snug">
                {readingNotice.title}
              </h2>

              <div className="flex items-center justify-between text-slate-500 text-[11px] pb-3 border-b border-slate-100">
                <span>Issued by: <strong>{readingNotice.author}</strong> ({readingNotice.authorRole})</span>
                <span>Date: {readingNotice.date}</span>
              </div>

              <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-line bg-slate-50 p-4 rounded-xl border border-slate-200">
                {readingNotice.content}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setReadingNotice(null)}
                  className="cursor-pointer px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg text-xs"
                >
                  Close Notice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Notice */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">
                  {editingNotice ? 'Edit Department Circular' : 'Publish New Department Circular'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Announcement Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. End-Semester Laboratory Viva Schedule"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as DepartmentNotice['category'])}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Academic">Academic</option>
                    <option value="Exam">Exam</option>
                    <option value="Lab Safety">Lab Safety</option>
                    <option value="Seminar">Seminar</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPinned}
                      onChange={(e) => setIsPinned(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 rounded"
                    />
                    <span className="font-semibold text-slate-700">Pin to top of bulletin</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Circular Content *
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder="Write notice details, timings, guidelines, and instructions..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full p-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="cursor-pointer px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs"
                >
                  {editingNotice ? 'Update Notice' : 'Post Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
