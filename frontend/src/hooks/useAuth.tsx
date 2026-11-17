import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import api from '../services/api';

// ============================================================
// Аутентификация: AuthProvider + useAuth.
// - Один /auth/profile при монтировании провайдера (не на каждый useAuth).
// - login/register/logout — через api-инстанс; interceptor сам подставит
//   Bearer и обработает 401.
// - Ошибки (400/401/409) пробрасываются наружу — компоненты решают,
//   что показать.
// - Блок 1: + updateProfile / changePassword / refreshUser.
// - Синхронизация между вкладками (storage-event):
//     * ключ 'token' — login/logout в другой вкладке;
//     * ключ 'profile-updated' — PATCH профиля в другой вкладке.
//   Реакция — refreshUser() (silent, не трогает loading).
// ============================================================

export interface User {
  id: number;
  email: string;
  username: string | null;
  fullName: string;
  role: 'USER' | 'MODERATOR' | 'OWNER';
  createdAt: string;
  lastLogin: string | null;
}

interface LoginResponse {
  user: User;
  token: string;
}

interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  username?: string;
}

export interface UpdateProfileInput {
  fullName?: string;
  username?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const TOKEN_KEY = 'token';
const PROFILE_UPDATED_KEY = 'profile-updated';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Автозагрузка профиля при монтировании.
  // setState здесь — ответ на async-запрос, а не синхронизация с пропсами:
  // правило react-hooks@7 set-state-in-effect не нарушено.
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const res = await api.get<User>('/auth/profile');
        if (!cancelled) setUser(res.data);
      } catch {
        // 401 уже обработан interceptor'ом (токен удалён).
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Silent-обновление: используется при cross-tab sync.
  // Не трогает loading — UI не мигает спиннером.
  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await api.get<User>('/auth/profile');
      setUser(res.data);
    } catch {
      setUser(null);
    }
  }, []);

  // Cross-tab sync. setUser происходит ПОСЛЕ await внутри refreshUser —
  // правило set-state-in-effect не нарушено (это ответ на async-запрос).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // e.key === null — это localStorage.clear() в другой вкладке.
      if (e.key === null || e.key === TOKEN_KEY || e.key === PROFILE_UPDATED_KEY) {
        void refreshUser();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<LoginResponse>('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, res.data.token);
    setUser(res.data.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const res = await api.post<LoginResponse>('/auth/register', input);
    localStorage.setItem(TOKEN_KEY, res.data.token);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // Не блокируем выход из-за упавшего аудита на бэке:
      // локальное состояние важнее серверной записи.
      console.warn('[useAuth] logout API failed:', err);
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    const res = await api.patch<User>('/auth/profile', input);
    setUser(res.data);
    // Нотификация других вкладок через storage-event.
    try {
      localStorage.setItem(PROFILE_UPDATED_KEY, String(Date.now()));
    } catch {
      // localStorage недоступен — синхронизация просто не сработает
    }
    return res.data;
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api.post('/auth/change-password', { currentPassword, newPassword });
    },
    []
  );

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      updateProfile,
      changePassword,
      refreshUser,
    }),
    [user, loading, login, register, logout, updateProfile, changePassword, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};