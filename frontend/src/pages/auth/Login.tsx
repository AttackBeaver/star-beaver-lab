import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import {
  UserIcon,
  LockClosedIcon,
  ArrowRightOnRectangleIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      // Редирект делает App.tsx: <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />.
      // После login user в контексте обновится → App перерендерится → Navigate.
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const serverMessage = err.response?.data?.error;
        if (typeof serverMessage === 'string') {
          setError(serverMessage);
        } else if (!err.response) {
          setError('Сервер недоступен. Проверьте соединение.');
        } else {
          setError('Ошибка входа');
        }
      } else {
        setError('Ошибка входа');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 transition-colors duration-300">
      <div className="relative w-full max-w-md">
        {/* Декоративные блобы */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-400/30 dark:bg-blue-500/20 rounded-full blur-2xl -z-10" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-indigo-400/30 dark:bg-indigo-500/20 rounded-full blur-2xl -z-10" />

        {/* Карточка */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl hover:shadow-2xl p-8 border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300">
          {/* Иконка */}
          <div className="flex justify-center mb-6">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <KeyIcon className="w-10 h-10 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-gray-200 mb-1">
            Добро пожаловать!
          </h2>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">
            Войдите в Star Beaver Lab
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  className="w-full pl-10 pr-3 py-2.5 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none transition"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Пароль */}
            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Пароль
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-3 py-2.5 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none transition"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  required
                />
              </div>
            </div>

            {/* Ошибка */}
            {error && (
              <div
                role="alert"
                className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-3 rounded-lg text-sm text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            {/* Кнопка */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-2.5 rounded-lg transition shadow-lg hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed"
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
                  Вход...
                </>
              ) : (
                <>
                  <ArrowRightOnRectangleIcon className="w-5 h-5" />
                  Войти
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
            Нет аккаунта?{' '}
            <Link
              to="/register"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium hover:underline transition"
            >
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;