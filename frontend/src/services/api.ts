import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

// ============================================================
// Единый axios-инстанс на весь фронт.
// - baseURL: '/api' — относительный путь. В dev Vite проксирует
//   на :5000 (см. vite.config.ts), в prod Nginx — на 127.0.0.1:5000.
// - Request interceptor: подставляет Authorization: Bearer <token>.
// - Response interceptor: на 401 чистит localStorage и пробрасывает
//   ошибку дальше — компонент сам решает, редиректить или показать сообщение.
// ============================================================

const TOKEN_KEY = 'token';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // 401 = токен протух/удалён/невалидный.
    // - Если это /auth/login — НЕ чистим токен (его и нет, пользователь
    //   только пытается войти, а старый токен мог остаться от прошлой сессии).
    //   Пусть Login.tsx покажет "Invalid credentials".
    // - Для остальных — токен бесполезен, удаляем. Компонент либо уже
    //   на /login (ничего не произойдёт), либо его выкинет роутер
    //   при следующем рендере через useAuth.
    const isLoginRequest = error.config?.url === '/auth/login';
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem(TOKEN_KEY);
    }
    return Promise.reject(error);
  }
);

export default api;