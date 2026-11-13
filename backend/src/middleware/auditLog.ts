import { Request, Response, NextFunction } from 'express';
import { logAction } from '../utils/logger';

// ============================================================
// Авто-логирование всех мутаций (POST/PUT/PATCH/DELETE), кроме /api/auth/*.
// Логика:
// - Лог пишется ПОСЛЕ отправки ответа (res.on('finish')), не блокирует запрос.
// - К этому моменту req.user уже установлен (authenticate сработал в роуте).
// - Пишем статус ответа: 401/403/500 тоже важны для аудита.
// - Тело запроса санитизируется: пароли/токены не попадают в БД.
// - /api/auth/* исключён: там явное логирование LOGIN/LOGOUT/REGISTER
//   в контроллере (иначе двойные записи).
// ============================================================

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUTH_PREFIX = '/api/auth/';

// Поля, которые никогда не пишем в details. Список растёт по мере появления
// новых форм: блок 1 — password, блок 6 — apiKey и т.д.
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'oldPassword',
  'confirmPassword',
  'token',
  'refreshToken',
  'authorization',
]);

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key) ? '[REDACTED]' : value;
  }
  return result;
}

function buildDetails(req: Request, res: Response): string {
  // multipart/form-data (загрузка файлов, блоки 2–3) — не сериализуем body:
  // там File-объекты с внутренними полями, JSON.stringify даст мусор.
  if (req.is('multipart/form-data')) {
    return JSON.stringify({ status: res.statusCode, body: '[multipart omitted]' });
  }
  return JSON.stringify({
    status: res.statusCode,
    body: sanitizeBody(req.body),
  });
}

export const auditLog = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!MUTATION_METHODS.has(req.method) || req.path.startsWith(AUTH_PREFIX)) {
    next();
    return;
  }

  res.on('finish', () => {
    const user = (req as unknown as { user?: { id?: number } }).user;
    const userId = typeof user?.id === 'number' ? user.id : null;

    // fire-and-forget: logAction внутри сам ловит ошибки и не бросает,
    // поэтому `void` безопасен. Ждать промис в middleware нельзя —
    // это добавит 5–20 мс к каждому мутирующему запросу.
    void logAction({
      action: `${req.method} ${req.baseUrl}${req.path}`,
      userId,
      details: buildDetails(req, res),
      req,
    });
  });

  next();
};