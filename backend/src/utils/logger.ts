import { Request } from 'express';
import { prisma } from './prisma';

// ============================================================
// Аудит-логи. Правила:
// 1. logAction НИКОГДА не бросает исключений — аудит не должен ломать
//    основной запрос (если БД недоступна, логин всё равно вернёт 200/401).
// 2. details обрезается до 1000 символов — защита от огромных объектов.
// 3. IP берётся из X-Real-IP → X-Forwarded-For → req.ip (прод за Nginx).
// ============================================================

export const MAX_DETAILS_LENGTH = 1000;

// Типизированные имена действий. Список растёт по блокам:
// блок 0 — auth, блок 1 — profile, блок 2 — memes, и т.д.
// middleware/auditLog.ts пишет действия вида "POST /api/news" — их
// в константы не заводим, они динамические.
export const LogActions = {
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  REGISTER: 'REGISTER',
  PROFILE_UPDATE: 'PROFILE_UPDATE',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_CHANGE_FAILED: 'PASSWORD_CHANGE_FAILED',
  MEME_UPLOAD: 'MEME_UPLOAD',
  MEME_DELETE: 'MEME_DELETE',
  MEME_RESTORE: 'MEME_RESTORE',
  MEME_EXPORT_ZIP: 'MEME_EXPORT_ZIP',
} as const;

export type LogActionName = (typeof LogActions)[keyof typeof LogActions];

interface LogInput {
  action: string;
  userId?: number | null;
  details?: string | null;
  ip?: string | null;
  req?: Request;
}

export function extractIp(req: Request): string | null {
  const xRealIp = req.headers['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.length > 0) {
    return xRealIp;
  }

  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first && first.length > 0) {
      return first;
    }
  }

  return req.ip ?? null;
}

export async function logAction(input: LogInput): Promise<void> {
  try {
    const ip = input.ip ?? (input.req ? extractIp(input.req) : null);

    const rawDetails = input.details ?? null;
    const details =
      rawDetails && rawDetails.length > MAX_DETAILS_LENGTH
        ? rawDetails.slice(0, MAX_DETAILS_LENGTH)
        : rawDetails;

    await prisma.log.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        details,
        ip,
      },
    });
  } catch (err) {
    // Swallow: логирование не должно ломать бизнес-логику.
    console.error('[logAction] failed to write audit log:', err);
  }
}