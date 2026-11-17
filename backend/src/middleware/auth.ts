import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';

// ============================================================
// JWT-аутентификация.
// - Токен: Authorization: Bearer <jwt>
// - Payload: { id } — минимум. Роль/email/fullName достаём из БД
//   на каждом запросе, чтобы удаление пользователя и смена роли
//   применялись мгновенно (цена — один indexed SELECT по PK).
// - При успехе req.user = { id, role, email, fullName }.
// ============================================================

export interface AuthPayload {
  id: number;
  role: 'USER' | 'MODERATOR' | 'OWNER';
  email: string;
  fullName: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

const secretFromEnv = process.env.JWT_SECRET;
if (!secretFromEnv) {
  throw new Error(
    'JWT_SECRET is not set. Generate one: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"'
  );
}
// Экспортируем явно как string: TypeScript сужает через throw,
// но при импорте в другой модуль нужен явный тип.
export const JWT_SECRET: string = secretFromEnv;

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let decoded: unknown;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    Array.isArray(decoded) ||
    typeof (decoded as Record<string, unknown>)['id'] !== 'number'
  ) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  const tokenUserId = (decoded as Record<string, unknown>)['id'] as number;

  let user:
    | {
        id: number;
        email: string;
        fullName: string;
        role: 'USER' | 'MODERATOR' | 'OWNER';
      }
    | null;
  try {
    user = await prisma.user.findUnique({
      where: { id: tokenUserId },
      select: { id: true, email: true, fullName: true, role: true },
    });
  } catch (err) {
    console.error('[authenticate] DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  if (!user) {
    // Пользователь удалён, а токен ещё живой (до истечения срока).
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  (req as AuthenticatedRequest).user = {
    id: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
  };

  next();
};

// Хелпер для контроллеров: возвращает auth-контекст или бросает,
// если authenticate не был применён (ошибка программиста, не пользователя).
// Позволяет писать `const user = getAuthUser(req)` без `as any`.
export function getAuthUser(req: Request): AuthPayload {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    throw new Error(
      'getAuthUser() called on a route without authenticate middleware'
    );
  }
  return user;
}