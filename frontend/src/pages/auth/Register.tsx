import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import {
  AtSymbolIcon,
  UserIcon,
  LockClosedIcon,
  UserPlusIcon,
  ArrowRightOnRectangleIcon,
  XCircleIcon,
  KeyIcon,
  IdentificationIcon,
} from '@heroicons/react/24/outline';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

const Register = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    // Клиентская валидация — те же правила, что в authController.register.
    // Дублируется осознанно: клиент даёт мгновенную обратную связь без round-trip,
    // сервер остаётся единственным источником истины.
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedFullName = fullName.trim();
    const trimmedUsername = username.trim();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`);
      return;
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      setError(`Пароль должен быть не длиннее ${MAX_PASSWORD_LENGTH} символов`);
      return;
    }
    if (trimmedUsername.length > 0 && !USERNAME_REGEX.test(trimmedUsername)) {
      setError('Username: 3–30 символов, только латиница, цифры и _');
      return;
    }

    setIsLoading(true);
    try {
      await register({
        email: trimmedEmail,
        password,
        fullName: trimmedFullName,
        ...(trimmedUsername.length > 0 ? { username: trimmedUsername } : {}),
      });
      // Редирект — через App.tsx гарды. После register user в контексте
      // обновится → <Navigate to="/" /> с /register сработает автоматически.
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const serverMessage = err.response?.data?.error;
        if (typeof serverMessage === 'string') {
          setError(serverMessage);
        } else if (!err.response) {
          setError('Сервер недоступен. Проверьте соединение.');
        } else {
          setError('Ошибка регистрации');
        }
      } else {
        setError('Ошибка регистрации');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 transition-colors duration-300">
      <div className="relative w-full max-w-md">
        {/* Декоративные блобы */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-green-400/30 dark:bg-green-500/20 rounded-full blur-2xl -z-10" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-400/30 dark:bg-blue-500/20 rounded-full blur-2xl -z-10" />

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl hover:shadow-2xl p-8 border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300">
          {/* Иконка */}
          <div className="flex justify-center mb-6">
            <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
              <KeyIcon className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-gray-200 mb-1">
            Регистрация
          </h2>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">
            Создайте аккаунт Star Beaver Lab
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="reg-email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <AtSymbolIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  className="w-full pl-10 pr-3 py-2.5 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Full name */}
            <div>
              <label
                htmlFor="reg-fullname"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Полное имя <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  id="reg-fullname"
                  type="text"
                  autoComplete="name"
                  className="w-full pl-10 pr-3 py-2.5 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Иванов Иван"
                  maxLength={100}
                  required
                />
              </div>
            </div>

            {/* Username (опционально) */}
            <div>
              <label
                htmlFor="reg-username"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Username{' '}
                <span className="text-gray-400 dark:text-gray-500 text-xs">
                  (необязательно)
                </span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <IdentificationIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  id="reg-username"
                  type="text"
                  autoComplete="username"
                  className="w-full pl-10 pr-3 py-2.5 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="beaver_42"
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_]{3,30}"
                  title="3–30 символов: латиница, цифры, _"
                />
              </div>
            </div>

            {/* Пароль */}
            <div>
              <label
                htmlFor="reg-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Пароль <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  className="w-full pl-10 pr-3 py-2.5 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-green-500 outline-none transition"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Не менее ${MIN_PASSWORD_LENGTH} символов`}
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={MAX_PASSWORD_LENGTH}
                  required
                />
              </div>
            </div>

            {/* Ошибка */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg"
              >
                <XCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Кнопка */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium py-2.5 rounded-lg transition shadow-lg hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Регистрация...
                </>
              ) : (
                <>
                  <UserPlusIcon className="w-5 h-5" />
                  Зарегистрироваться
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
            Уже есть аккаунт?{' '}
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 font-medium hover:underline transition"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;