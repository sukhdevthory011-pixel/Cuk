import React, { createContext, useContext, useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = 'xenora_theme_preference';

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (theme === 'system') return getSystemTheme();
    return theme;
  });

  useEffect(() => {
    const applyTheme = (mode: ThemeMode) => {
      const nextResolved: ResolvedTheme = mode === 'system' ? getSystemTheme() : mode;
      setResolvedTheme(nextResolved);

      const root = document.documentElement;
      if (nextResolved === 'dark') {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
        root.style.colorScheme = 'light';
      }
    };

    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);

    if (theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

interface ThemeSwitcherProps {
  compact?: boolean;
  variant?: 'default' | 'darkHeader';
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  compact = false,
  variant = 'default',
}) => {
  const { theme, setTheme } = useTheme();

  const options: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'system', label: 'System', icon: <Monitor className="w-3.5 h-3.5 shrink-0" /> },
  ];

  const containerClass =
    variant === 'darkHeader'
      ? 'inline-flex items-center p-0.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-300'
      : 'inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300';

  return (
    <div
      role="group"
      aria-label="Theme preference"
      className={containerClass}
    >
      {options.map((opt) => {
        const isActive = theme === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setTheme(opt.id)}
            title={`Switch to ${opt.label} theme`}
            aria-pressed={isActive}
            className={`cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 ${
              isActive
                ? variant === 'darkHeader'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs border border-slate-200/60 dark:border-slate-700'
                : variant === 'darkHeader'
                ? 'text-slate-300 hover:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {opt.icon}
            {!compact && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
};
