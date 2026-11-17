import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Profile from './pages/Profile';
import Logs from './pages/admin/Logs';

// ============================================================
// Роутинг SPA.
// - loading (первичная загрузка профиля) блокирует всё: спиннер,
//   никаких миганий «гость → залогинен».
// - /login, /register — вне Layout (полноэкранные карточки).
//   Если user уже есть — Navigate на /.
// - Остальное — в Layout.
// - /profile — только для залогиненных.
// - /admin/logs — только для OWNER. USER/MODERATOR → /, гость → /login.
// - 404 — inline в Layout (свой роут path="*").
//
// Guard'ы здесь — UX, не безопасность. Реальная защита — на бэке
// (authenticate + allowRoles). Если гость введёт /admin/logs руками —
// Navigate сработает раньше, чем что-либо отрендерится.
// ============================================================

const App = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-blue-200 dark:border-blue-900/40 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Загрузка…</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* ===== Auth-страницы: вне Layout ===== */}
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/" replace /> : <Register />}
        />

        {/* ===== Главная ===== */}
        <Route
          path="/"
          element={
            <Layout>
              <Home />
            </Layout>
          }
        />

        {/* ===== Профиль (только для залогиненных) ===== */}
        <Route
          path="/profile"
          element={
            user ? (
              <Layout>
                <Profile />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* ===== Журнал (только OWNER) ===== */}
        <Route
          path="/admin/logs"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : user.role !== 'OWNER' ? (
              <Navigate to="/" replace />
            ) : (
              <Layout>
                <Logs />
              </Layout>
            )
          }
        />

        {/* ===== 404 ===== */}
        <Route
          path="*"
          element={
            <Layout>
              <div className="py-16 text-center">
                <p className="text-6xl sm:text-7xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent mb-4">
                  404
                </p>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                  Страница не найдена
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Возможно, ссылка устарела или в адресе опечатка.
                </p>
                <Link
                  to="/"
                  className="inline-block px-5 py-2 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition"
                >
                  На главную
                </Link>
              </div>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;