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
// - Ошибки (400/401/409) пробрасываются наружу — компоненты (Login/Register)
//   решают, что показать.
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

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const TOKEN_KEY = 'token';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Автозагрузка профиля при монтировании.
  // setState здесь — ответ на async-запрос, а не синхронизация с пропсами:
  // правило react-hooks@7 set-state-in-effect не нарушено.
  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
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
        // Здесь просто остаёмся гостем.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const value = useMemo<AuthContextType>(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
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