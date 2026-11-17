import { Link } from 'react-router-dom';
import { useAuth, type User } from '../hooks/useAuth';
import {
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  UserPlusIcon,
  KeyIcon,
  CubeIcon,
  FaceSmileIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

// Локализованные подписи ролей. Record<User['role'], string> гарантирует,
// что при добавлении новой роли в useAuth.tsx TypeScript потребует
// дополнить объект — опечатка/забытая роль не пройдут компиляцию.
const ROLE_LABELS: Record<User['role'], string> = {
  USER: 'Пользователь',
  MODERATOR: 'Модератор',
  OWNER: 'Владелец',
};

interface UpcomingModule {
  icon: typeof KeyIcon;
  title: string;
  description: string;
  accent: 'blue' | 'indigo' | 'green' | 'purple';
}

const UPCOMING_MODULES: UpcomingModule[] = [
  {
    icon: KeyIcon,
    title: 'Криптолаборатория',
    description: '35+ интерактивных визуализаций шифров, хешей и протоколов',
    accent: 'blue',
  },
  {
    icon: CubeIcon,
    title: 'Полигон',
    description: 'Практика SQL-инъекций, XSS и программирования в изоляции',
    accent: 'indigo',
  },
  {
    icon: FaceSmileIcon,
    title: 'Мемы',
    description: 'Сообщество: загрузка, модерация, лайки и топ авторов',
    accent: 'green',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Bug Bounty',
    description: 'Отчёты об ошибках с ответами администрации',
    accent: 'purple',
  },
];

const ACCENT_CLASSES: Record<
  UpcomingModule['accent'],
  { bg: string; icon: string; ring: string }
> = {
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    icon: 'text-blue-600 dark:text-blue-400',
    ring: 'group-hover:ring-blue-300 dark:group-hover:ring-blue-700',
  },
  indigo: {
    bg: 'bg-indigo-100 dark:bg-indigo-900/30',
    icon: 'text-indigo-600 dark:text-indigo-400',
    ring: 'group-hover:ring-indigo-300 dark:group-hover:ring-indigo-700',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    icon: 'text-green-600 dark:text-green-400',
    ring: 'group-hover:ring-green-300 dark:group-hover:ring-green-700',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    icon: 'text-purple-600 dark:text-purple-400',
    ring: 'group-hover:ring-purple-300 dark:group-hover:ring-purple-700',
  },
};

const Home = () => {
  const { user, logout } = useAuth();

  return (
    <div className="py-8 sm:py-12">
      {/* ===== Hero ===== */}
      <section className="relative">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl -z-10" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-indigo-400/20 dark:bg-indigo-500/10 rounded-full blur-3xl -z-10" />

        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              Star Beaver Lab
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-8">
            Открытая лаборатория по кибербезопасности. Практика, визуализации
            и сообщество — без привязки к учебным заведениям.
          </p>

          {user ? (
            // ===== Залогинен: карточка профиля-заглушки =====
            <div className="max-w-md mx-auto">
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-gray-200/50 dark:border-gray-700/50">
                <div className="flex justify-center mb-4">
                  <div className="p-3 rounded-full bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30">
                    <UserCircleIcon className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-center text-gray-800 dark:text-gray-200 mb-1">
                  Привет, {user.fullName}!
                </h2>
                <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">
                  {user.email}
                </p>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    {ROLE_LABELS[user.role]}
                  </span>
                  {user.username && (
                    <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      @{user.username}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => void logout()}
                  className="w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium py-2 rounded-lg transition"
                >
                  <ArrowRightOnRectangleIcon className="w-4 h-4" />
                  Выйти
                </button>
              </div>
            </div>
          ) : (
            // ===== Гость: призыв войти/зарегистрироваться =====
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-gray-700 dark:text-gray-200 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 hover:shadow-md transition font-medium"
              >
                <ArrowRightOnRectangleIcon className="w-5 h-5" />
                Войти
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition font-medium"
              >
                <UserPlusIcon className="w-5 h-5" />
                Регистрация
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ===== Скоро на платформе ===== */}
      <section className="mt-16 sm:mt-20">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200 mb-2">
            Скоро на платформе
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Модули, которые появятся в следующих релизах
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {UPCOMING_MODULES.map((module) => {
            const Icon = module.icon;
            const accent = ACCENT_CLASSES[module.accent];
            return (
              <div
                key={module.title}
                className={`group bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-sm hover:shadow-lg p-6 border border-gray-200/50 dark:border-gray-700/50 ring-2 ring-transparent ${accent.ring} transition-all`}
              >
                <div className={`inline-flex p-3 rounded-xl ${accent.bg} mb-4`}>
                  <Icon className={`w-6 h-6 ${accent.icon}`} />
                </div>
                <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-1">
                  {module.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {module.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Home;