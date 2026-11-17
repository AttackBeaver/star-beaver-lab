import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  UserCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { useAuth, type UpdateProfileInput, type User } from '../hooks/useAuth';

// ============================================================
// Страница /profile (блок 1).
// - Форма 1: основная информация (email read-only, fullName, username).
// - Форма 2: смена пароля (current, new, confirm).
// - Валидация зеркалит серверную (authController).
// - Ошибки/успехи локальны; auto-clear успеха — setTimeout в submit,
//   без useEffect+setState (правило set-state-in-effect).
// ============================================================

const ROLE_LABELS: Record<User['role'], string> = {
  USER: 'Пользователь',
  MODERATOR: 'Модератор',
  OWNER: 'Владелец',
};

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const MAX_FULL_NAME_LENGTH = 100;
const SUCCESS_CLEAR_MS = 3500;

// Извлечение текста ошибки из ответа сервера / axios.
// Backend на 4xx отдаёт { error: string }, на 5xx — тот же формат.
function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: unknown } | undefined;
    if (data && typeof data.error === 'string' && data.error.length > 0) {
      return data.error;
    }
    return err.message || 'Ошибка запроса';
  }
  if (err instanceof Error) return err.message;
  return 'Неизвестная ошибка';
}

// Общие классы для полей ввода — вынесены, чтобы не дублировать.
const INPUT_CLASSES =
  'w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 ' +
  'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 ' +
  'placeholder-gray-400 dark:placeholder-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ' +
  'transition disabled:opacity-60 disabled:cursor-not-allowed';

const LABEL_CLASSES =
  'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';

const Profile = () => {
  const { user, updateProfile, changePassword } = useAuth();

  // ----- Форма 1: профиль -----
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const profileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- Форма 2: пароль -----
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const passwordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Защита от прямого перехода, если guard в App по какой-то причине не сработал.
  if (!user) {
    return (
      <div className="max-w-md mx-auto py-12 text-center text-gray-600 dark:text-gray-400">
        Требуется вход в аккаунт.
      </div>
    );
  }

  // ----- Вычисляем «есть ли изменения» для формы 1 -----
  const trimmedFullName = fullName.trim();
  const trimmedUsername = username.trim();
  const currentUsername = user.username ?? '';
  const fullNameChanged = trimmedFullName !== user.fullName;
  const usernameChanged = trimmedUsername !== currentUsername;
  const profileDirty = fullNameChanged || usernameChanged;

  // ----- Хендлеры формы 1 -----
  const showProfileSuccess = (msg: string): void => {
    setProfileSuccess(msg);
    if (profileTimerRef.current) clearTimeout(profileTimerRef.current);
    profileTimerRef.current = setTimeout(() => setProfileSuccess(null), SUCCESS_CLEAR_MS);
  };

  const handleProfileSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    // Клиентская валидация — зеркало серверной.
    if (fullNameChanged) {
      if (trimmedFullName.length === 0) {
        setProfileError('Имя не может быть пустым');
        return;
      }
      if (trimmedFullName.length > MAX_FULL_NAME_LENGTH) {
        setProfileError(`Имя не длиннее ${MAX_FULL_NAME_LENGTH} символов`);
        return;
      }
    }

    // usernameChanged валиден, если пусто (→ null) или походит на регулярку.
    // Пустая строка — это "очистить username", не ошибка.
    const willClearUsername = usernameChanged && trimmedUsername.length === 0;
    if (usernameChanged && !willClearUsername && !USERNAME_REGEX.test(trimmedUsername)) {
      setProfileError('Username: 3–30 символов, только латиница, цифры и _');
      return;
    }

    // exactOptionalPropertyTypes-стиль: собираем data пошагово, без undefined.
    const payload: UpdateProfileInput = {};
    if (fullNameChanged) payload.fullName = trimmedFullName;
    if (usernameChanged) payload.username = willClearUsername ? null : trimmedUsername;

    setProfileSaving(true);
    try {
      await updateProfile(payload);
      // После успеха user в контексте обновлён — «dirty» пересчитается сам.
      showProfileSuccess('Профиль обновлён');
    } catch (err) {
      setProfileError(extractError(err));
    } finally {
      setProfileSaving(false);
    }
  };

  // ----- Хендлеры формы 2 -----
  const showPasswordSuccess = (msg: string): void => {
    setPasswordSuccess(msg);
    if (passwordTimerRef.current) clearTimeout(passwordTimerRef.current);
    passwordTimerRef.current = setTimeout(() => setPasswordSuccess(null), SUCCESS_CLEAR_MS);
  };

  const handlePasswordSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Новый пароль — минимум ${MIN_PASSWORD_LENGTH} символов`);
      return;
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      setPasswordError(`Новый пароль — максимум ${MAX_PASSWORD_LENGTH} символов`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Пароли не совпадают');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('Новый пароль должен отличаться от текущего');
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showPasswordSuccess('Пароль изменён');
    } catch (err) {
      setPasswordError(extractError(err));
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="py-8 sm:py-12">
      {/* ===== Заголовок ===== */}
      <div className="mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          На главную
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30">
            <UserCircleIcon className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">
            Профиль
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            {ROLE_LABELS[user.role]}
          </span>
          <span>
            Зарегистрирован: {new Date(user.createdAt).toLocaleDateString('ru-RU')}
          </span>
          {user.lastLogin && (
            <span>
              · Последний вход: {new Date(user.lastLogin).toLocaleString('ru-RU')}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===================== Карточка 1: Профиль ===================== */}
        <section className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 p-6">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4">
            Основная информация
          </h2>

          <form onSubmit={(e) => void handleProfileSubmit(e)} className="space-y-4">
            {/* Email — read-only (по решению блока 1: смена email не поддерживается) */}
            <div>
              <label htmlFor="profile-email" className={LABEL_CLASSES}>
                Email
              </label>
              <input
                id="profile-email"
                type="email"
                value={user.email}
                readOnly
                disabled
                className={INPUT_CLASSES}
                aria-describedby="profile-email-hint"
              />
              <p id="profile-email-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Изменение email не поддерживается (нужна верификация по почте — позже)
              </p>
            </div>

            {/* Full name */}
            <div>
              <label htmlFor="profile-fullname" className={LABEL_CLASSES}>
                Имя / ФИО <span className="text-red-500">*</span>
              </label>
              <input
                id="profile-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={MAX_FULL_NAME_LENGTH}
                required
                className={INPUT_CLASSES}
                autoComplete="name"
              />
            </div>

            {/* Username */}
            <div>
              <label htmlFor="profile-username" className={LABEL_CLASSES}>
                Username
              </label>
              <input
                id="profile-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                placeholder="необязательно"
                className={INPUT_CLASSES}
                autoComplete="username"
                aria-describedby="profile-username-hint"
              />
              <p id="profile-username-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                3–30 символов: латиница, цифры, _. Пустое поле — убрать username.
              </p>
            </div>

            {/* Сообщения */}
            {profileError && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
              >
                <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{profileError}</span>
              </div>
            )}
            {profileSuccess && (
              <div
                role="status"
                className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300"
              >
                <CheckCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{profileSuccess}</span>
              </div>
            )}

            {/* Кнопка */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={!profileDirty || profileSaving}
                className="px-5 py-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {profileSaving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </form>
        </section>

        {/* ===================== Карточка 2: Пароль ===================== */}
        <section className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 p-6">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-1">
            Смена пароля
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Текущая сессия останется активной.
          </p>

          <form onSubmit={(e) => void handlePasswordSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="current-password" className={LABEL_CLASSES}>
                Текущий пароль <span className="text-red-500">*</span>
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className={INPUT_CLASSES}
                autoComplete="current-password"
              />
            </div>

            <div>
              <label htmlFor="new-password" className={LABEL_CLASSES}>
                Новый пароль <span className="text-red-500">*</span>
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={MAX_PASSWORD_LENGTH}
                required
                className={INPUT_CLASSES}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {MIN_PASSWORD_LENGTH}–{MAX_PASSWORD_LENGTH} символов
              </p>
            </div>

            <div>
              <label htmlFor="confirm-password" className={LABEL_CLASSES}>
                Подтверждение <span className="text-red-500">*</span>
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={INPUT_CLASSES}
                autoComplete="new-password"
              />
            </div>

            {passwordError && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
              >
                <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{passwordError}</span>
              </div>
            )}
            {passwordSuccess && (
              <div
                role="status"
                className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300"
              >
                <CheckCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={passwordSaving}
                className="px-5 py-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {passwordSaving ? 'Изменение…' : 'Изменить пароль'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Profile;