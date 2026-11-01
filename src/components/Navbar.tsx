import React from 'react';
import { ShieldCheck, Star, User, Lock, Bell, Calendar, MapPin, FileSpreadsheet, Globe } from 'lucide-react';
import { AuthUser, UserRole } from '../types/attendance';
import { ThemeSwitcher } from '../context/ThemeContext';

export type AppTab = 
  | 'student' 
  | 'schedule' 
  | 'map'
  | 'workspace'
  | 'info' 
  | 'cr' 
  | 'faculty' 
  | 'roster' 
  | 'analytics' 
  | 'projector' 
  | 'radar';

interface NavbarProps {
  currentTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  todayCode: string;
  currentUser: AuthUser | null;
  onOpenAuth: () => void;
  onOpenChat: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  currentTab, 
  onSelectTab, 
  todayCode, 
  currentUser,
  onOpenAuth,
  onOpenChat,
}) => {
  const role = currentUser?.role || 'student';
  const isCR = role === 'cr' || Boolean(currentUser?.isCRIdentity);
  const isFacultyOnly = role === 'faculty' && !isCR;
  const isFullAccess = isCR || isFacultyOnly;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Title */}
        <div 
          onClick={() => onSelectTab(isFacultyOnly ? 'faculty' : 'student')}
          className="flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-slate-900 leading-tight">
              CUK Chemistry
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              Central University of Karnataka
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-3.5 text-sm font-medium text-slate-600">
          {!isFullAccess ? (
            /* 1. STUDENT NAVIGATION (Only Student Tabs — No CR Desk or Faculty) */
            <>
              <button
                type="button"
                onClick={() => onSelectTab('student')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 ${
                  currentTab === 'student'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                Attendance Desk
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('schedule')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 ${
                  currentTab === 'schedule'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>Class Schedule</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('map')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 ${
                  currentTab === 'map'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                <span>Campus Map</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('info')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 ${
                  currentTab === 'info'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <Bell className="w-3.5 h-3.5 text-indigo-500" />
                <span>Information Panel</span>
              </button>
            </>
          ) : (
            /* 2. CR (FULL APP ACCESS) & 3. FACULTY (NO CR DESK ACCESS) */
            <>
              <button
                type="button"
                onClick={() => onSelectTab('student')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 ${
                  currentTab === 'student'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                Attendance
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('schedule')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 ${
                  currentTab === 'schedule'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>Schedule</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('map')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 ${
                  currentTab === 'map'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                <span>Campus Map</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('workspace')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 ${
                  currentTab === 'workspace'
                    ? 'text-emerald-600 border-b-2 border-emerald-600 font-bold'
                    : 'hover:text-emerald-700 text-emerald-800'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Google Workspace</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('info')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 ${
                  currentTab === 'info'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <Bell className="w-3.5 h-3.5 text-indigo-500" />
                <span>Notices</span>
              </button>

              {/* CR DESK TAB: ONLY VISIBLE & ACCESSIBLE TO CR — FACULTY CANNOT ACCESS CR DESK */}
              {isCR && (
                <button
                  type="button"
                  onClick={() => onSelectTab('cr')}
                  className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1 ${
                    currentTab === 'cr'
                      ? 'text-amber-600 border-b-2 border-amber-600 font-bold'
                      : 'hover:text-amber-600 text-amber-700 font-bold'
                  }`}
                >
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  <span>CR Desk</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onSelectTab('faculty')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 ${
                  currentTab === 'faculty'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                Faculty
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('roster')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 ${
                  currentTab === 'roster'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                Roster
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('analytics')}
                className={`cursor-pointer whitespace-nowrap shrink-0 transition-colors py-1 ${
                  currentTab === 'analytics'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                Analytics
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: Theme Switcher, Role Switcher & Chat Action */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Light / Dark / System Theme Switcher */}
          <div className="hidden sm:block">
            <ThemeSwitcher />
          </div>

          {/* Active User Role Badge & 3-Option Portal Switcher */}
          <button
            type="button"
            onClick={onOpenAuth}
            className={`cursor-pointer px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
              isCR
                ? 'bg-amber-50 border-amber-300 text-amber-950 hover:bg-amber-100'
                : isFacultyOnly
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                : 'bg-indigo-50 border-indigo-300 text-indigo-900 hover:bg-indigo-100'
            }`}
            title="Click to open 3-Option Portal Login (1. Student · 2. CR · 3. Faculty via OTP)"
          >
            {isCR ? (
              <>
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
                <span className="hidden sm:inline font-bold">CR:</span>
                <span className="font-bold font-mono truncate max-w-[110px]">
                  {currentUser?.crId || currentUser?.rollNo || '26ugchem001'}
                </span>
              </>
            ) : isFacultyOnly ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline font-bold">Faculty:</span>
                <span className="font-bold font-mono truncate max-w-[110px]">
                  {currentUser?.facultyId || 'facche001'}
                </span>
              </>
            ) : (
              <>
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline font-bold">Student:</span>
                <span className="font-bold font-mono">{currentUser?.rollNo || 'Login OTP'}</span>
              </>
            )}
          </button>

          {/* Today Code Badge */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-md border border-slate-200 text-xs font-medium text-slate-700">
            <span className="text-slate-500">Board Code:</span>
            <span className="font-mono font-bold text-indigo-700">{todayCode}</span>
          </div>

          <button
            type="button"
            onClick={onOpenChat}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-200" />
            <span>Academic Doubt AI</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Strip */}
      <div className="lg:hidden flex items-center border-t border-slate-100 bg-slate-50 px-2 py-2 text-xs overflow-x-auto gap-1">
        <button
          type="button"
          onClick={() => onSelectTab('student')}
          className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${currentTab === 'student' ? 'text-indigo-600 font-bold bg-indigo-50' : 'text-slate-600'}`}
        >
          Attendance
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('schedule')}
          className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${currentTab === 'schedule' ? 'text-indigo-600 font-bold bg-indigo-50' : 'text-slate-600'}`}
        >
          Schedule
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('map')}
          className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${currentTab === 'map' ? 'text-indigo-600 font-bold bg-indigo-50' : 'text-slate-600'}`}
        >
          Campus Map
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('info')}
          className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${currentTab === 'info' ? 'text-indigo-600 font-bold bg-indigo-50' : 'text-slate-600'}`}
        >
          Notices
        </button>

        {/* CR Desk ONLY for CR */}
        {isCR && (
          <button
            type="button"
            onClick={() => onSelectTab('cr')}
            className={`px-2 py-1 rounded font-bold whitespace-nowrap ${currentTab === 'cr' ? 'text-amber-700 font-bold bg-amber-100' : 'text-amber-700'}`}
          >
            ★ CR Desk
          </button>
        )}

        {isFullAccess && (
          <>
            <button
              type="button"
              onClick={() => onSelectTab('workspace')}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${currentTab === 'workspace' ? 'text-emerald-700 font-bold bg-emerald-50' : 'text-emerald-700'}`}
            >
              Workspace
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('faculty')}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${currentTab === 'faculty' ? 'text-indigo-600 font-bold bg-indigo-50' : 'text-slate-600'}`}
            >
              Faculty
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('roster')}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${currentTab === 'roster' ? 'text-indigo-600 font-bold bg-indigo-50' : 'text-slate-600'}`}
            >
              Roster
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('analytics')}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${currentTab === 'analytics' ? 'text-indigo-600 font-bold bg-indigo-50' : 'text-slate-600'}`}
            >
              Analytics
            </button>
          </>
        )}

        {/* Mobile Theme Switcher */}
        <div className="ml-auto pl-2 sm:hidden shrink-0">
          <ThemeSwitcher compact />
        </div>
      </div>
    </header>
  );
};


