import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

// ============================================================
// Тема: light / dark / system.
// - theme хранится в localStorage, читается ленивым инициализатором
//   useState (НЕ useEffect + setState — правило react-hooks@7
//   set-state-in-effect).
// - resolvedTheme — производное значение, НЕ состояние:
//     theme === 'system' ? systemTheme : theme
//   systemTheme берётся из useSyncExternalStore (подписка на matchMedia) —
//   это правильный инструмент для внешнего источника, без setState.
// - classList на <html> — side effect, разрешён в useEffect.
// ============================================================

export type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

const STORAGE_KEY = 'theme';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

// Lazy-init: вызывается useState'ом один раз при монтировании.
// localStorage может быть заблокирован (Safari Private Mode, iframe с sandbox) —
// тогда fallback на 'system'.
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // localStorage недоступен — работаем на дефолте
  }
  return 'system';
}

// Подписка для useSyncExternalStore. React вызывает её при монтировании
// и просит вернуть unsubscribe для cleanup.
function subscribeToSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

// Snapshot: вызывается React'ом синхронно при рендере и при каждом событии
// изменения. Должен быть дешёвым и идемпотентным.
function getSystemThemeSnapshot(): ResolvedTheme {
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
}

// На сервере window нет. У нас SPA, но getServerSnapshot обязателен
// по сигнатуре useSyncExternalStore — возвращаем 'light'.
function getSystemThemeServerSnapshot(): ResolvedTheme {
  return 'light';
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
    getSystemThemeServerSnapshot
  );

  // Производное значение. Никакого useState, никакого useEffect+setState —
  // resolvedTheme всегда вычисляется из актуальных theme + systemTheme.
  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? systemTheme : theme;

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // localStorage недоступен — тема применится, но не сохранится
    }
  }, []);

  // Side effect на DOM. Не setState — правило set-state-in-effect не нарушено.
  // toggle с force-флагом идемпотентен: повторный вызов с тем же значением
  // не триггерит mutation observer.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  // Стабилизируем value, чтобы потребители (Layout, useTheme()) не
  // ререндерились при перерендере провайдера с теми же значениями.
  const value = useMemo<ThemeContextType>(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};