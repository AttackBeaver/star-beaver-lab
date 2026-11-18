import React, { useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme, type Theme } from '../hooks/useTheme';
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  HomeIcon,
  ArrowRightOnRectangleIcon,
  UserPlusIcon,
  UserCircleIcon,
  ClipboardDocumentListIcon,
  FaceSmileIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

// ============================================================
// Layout.
// Навигация:
//   - Главная — все.
//   - Мемы — все (лента публичная, блок 2).
//   - Профиль — залогиненные.
//   - Корзина мемов — MODERATOR/OWNER.
//   - Журнал — OWNER (блок 1).
//   - Полигон / Криптолаба / Новости — блоки 3–6.
// Guard на уровне роутов в App.tsx; здесь только видимость ссылок.
// ============================================================

interface LayoutProps {
  children: React.ReactNode;
}

// ===== Скролл-детектор через useSyncExternalStore =====
const subscribeToScroll = (cb: () => void): (() => void) => {
  window.addEventListener('scroll', cb, { passive: true });
  return () => window.removeEventListener('scroll', cb);
};
const getScrolledSnapshot = (): boolean => window.scrollY > 20;
const getScrolledServerSnapshot = (): boolean => false;

const Layout = ({ children }: LayoutProps) => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();

  const scrolled = useSyncExternalStore(
    subscribeToScroll,
    getScrolledSnapshot,
    getScrolledServerSnapshot
  );

  const isActive = (path: string): boolean => location.pathname === path;
  const isModOrOwner = user?.role === 'MODERATOR' || user?.role === 'OWNER';
  const isOwner = user?.role === 'OWNER';

  const desktopLinkClass = (path: string): string =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      isActive(path)
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/70 dark:hover:bg-gray-800/70 hover:text-blue-600 dark:hover:text-blue-400'
    }`;

  const mobileLinkClass = (path: string): string =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
      isActive(path)
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/70 dark:hover:bg-gray-800/70'
    }`;

  const getThemeIcon = (): React.ReactElement => {
    switch (theme) {
      case 'light':
        return <SunIcon className="w-5 h-5" />;
      case 'dark':
        return <MoonIcon className="w-5 h-5" />;
      case 'system':
        return <ComputerDesktopIcon className="w-5 h-5" />;
    }
  };

  const getThemeLabel = (): string => {
    switch (theme) {
      case 'light':
        return 'Светлая';
      case 'dark':
        return 'Тёмная';
      case 'system':
        return 'Системная';
    }
  };

  const cycleTheme = (): void => {
    const order: Theme[] = ['light', 'dark', 'system'];
    const idx = order.indexOf(theme);
    const next = order[(idx + 1) % order.length] ?? 'system';
    setTheme(next);
  };

  const handleLogout = (): void => {
    void logout();
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
      {/* ===== Header ===== */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-lg'
            : 'bg-white/60 dark:bg-gray-900/60 backdrop-blur-md shadow-sm'
        } border-b border-gray-200/50 dark:border-gray-700/50`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Логотип */}
            <Link to="/" className="flex items-center space-x-2 group shrink-0">
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent transition-transform group-hover:scale-105">
                Star Beaver Lab
              </span>
            </Link>

            {/* Десктопная навигация */}
            <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
              <Link to="/" className={desktopLinkClass('/')}>
                <span className="flex items-center gap-1.5">
                  <HomeIcon className="w-4 h-4" />
                  Главная
                </span>
              </Link>

              <Link to="/memes" className={desktopLinkClass('/memes')}>
                <span className="flex items-center gap-1.5">
                  <FaceSmileIcon className="w-4 h-4" />
                  Мемы
                </span>
              </Link>

              {user && (
                <Link
                  to="/profile"
                  className={desktopLinkClass('/profile')}
                  title={user.fullName}
                >
                  <span className="flex items-center gap-1.5">
                    <UserCircleIcon className="w-4 h-4" />
                    Профиль
                  </span>
                </Link>
              )}

              {isModOrOwner && (
                <Link
                  to="/admin/memes"
                  className={desktopLinkClass('/admin/memes')}
                  title="Корзина мемов"
                >
                  <span className="flex items-center gap-1.5">
                    <TrashIcon className="w-4 h-4" />
                    Корзина
                  </span>
                </Link>
              )}

              {isOwner && (
                <Link to="/admin/logs" className={desktopLinkClass('/admin/logs')}>
                  <span className="flex items-center gap-1.5">
                    <ClipboardDocumentListIcon className="w-4 h-4" />
                    Журнал
                  </span>
                </Link>
              )}
            </nav>

            {/* Правая часть */}
            <div className="flex items-center gap-2">
              {/* Переключатель темы */}
              <button
                type="button"
                onClick={cycleTheme}
                className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition-colors relative group"
                title={`Тема: ${getThemeLabel()}`}
                aria-label={`Тема: ${getThemeLabel()}. Нажмите, чтобы переключить.`}
              >
                {getThemeIcon()}
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  {getThemeLabel()}
                </span>
              </button>

              {/* Десктопные кнопки auth */}
              <div className="hidden md:flex items-center space-x-2">
                {user ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                  >
                    <span className="flex items-center gap-1.5">
                      <ArrowRightOnRectangleIcon className="w-4 h-4" />
                      Выйти
                    </span>
                  </button>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="px-3 py-2 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all"
                    >
                      <span className="flex items-center gap-1.5">
                        <ArrowRightOnRectangleIcon className="w-4 h-4" />
                        Вход
                      </span>
                    </Link>
                    <Link
                      to="/register"
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
                    >
                      <span className="flex items-center gap-1.5">
                        <UserPlusIcon className="w-4 h-4" />
                        Регистрация
                      </span>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Мобильная панель (всегда видна на <md) */}
        <div className="md:hidden border-t border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <Link to="/" className={mobileLinkClass('/')}>
                <HomeIcon className="w-4 h-4" />
                Главная
              </Link>
              <Link to="/memes" className={mobileLinkClass('/memes')}>
                <FaceSmileIcon className="w-4 h-4" />
                Мемы
              </Link>
              {user && (
                <Link to="/profile" className={mobileLinkClass('/profile')}>
                  <UserCircleIcon className="w-4 h-4" />
                  Профиль
                </Link>
              )}
              {isModOrOwner && (
                <Link to="/admin/memes" className={mobileLinkClass('/admin/memes')}>
                  <TrashIcon className="w-4 h-4" />
                  Корзина
                </Link>
              )}
              {isOwner && (
                <Link to="/admin/logs" className={mobileLinkClass('/admin/logs')}>
                  <ClipboardDocumentListIcon className="w-4 h-4" />
                  Журнал
                </Link>
              )}
            </div>

            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                Выйти
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3 py-2 rounded-lg text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all"
                >
                  Вход
                </Link>
                <Link
                  to="/register"
                  className="px-3 py-2 rounded-lg text-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all"
                >
                  Регистрация
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== Основной контент ===== */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        {children}
      </main>

      {/* ===== Footer ===== */}
      <footer className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/50 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
              © {new Date().getFullYear()} Star Beaver Lab. Все права защищены.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <a
                href="https://github.com/AttackBeaver/star-beaver-lab"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;