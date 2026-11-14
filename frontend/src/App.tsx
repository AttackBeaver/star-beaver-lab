import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

// ============================================================
// Роутинг блока 0.
// - /login и /register — вне Layout (полноэкранные формы, свой фон).
// - Остальное — внутри Layout (header + main + footer).
// - Гарды: залогиненный на /login → /; гость на защищённых → /login
//   (защищённых пока нет — появятся в блоке 1).
// ============================================================

const NotFound = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
    <h1 className="text-7xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent mb-4">
      404
    </h1>
    <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
      Такой страницы нет
    </p>
    <Link
      to="/"
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition font-medium"
    >
      На главную
    </Link>
  </div>
);

function App() {
  const { user, loading } = useAuth();

  // Пока useAuth грузит /auth/profile (при наличии токена) —
  // показываем заглушку. Без этого на долю секунды мелькнёт гостевое
  // состояние, даже если пользователь залогинен.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="animate-spin h-8 w-8 text-blue-600 dark:text-blue-400"
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
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Загрузка...
          </span>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Auth-страницы — вне Layout (свой fullscreen-фон) */}
        <Route
          path="/login"
          element={!user ? <Login /> : <Navigate to="/" replace />}
        />
        <Route
          path="/register"
          element={!user ? <Register /> : <Navigate to="/" replace />}
        />

        {/* Всё остальное — внутри Layout */}
        <Route
          path="/"
          element={
            <Layout>
              <Home />
            </Layout>
          }
        />
        <Route
          path="*"
          element={
            <Layout>
              <NotFound />
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;