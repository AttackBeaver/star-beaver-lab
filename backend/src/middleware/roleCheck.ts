import { Request, Response, NextFunction } from 'express';
import { getAuthUser, type AuthPayload } from './auth';

// ============================================================
// Проверка ролей. Использование:
//   router.post('/', authenticate, allowRoles('OWNER'), handler)
//   router.put('/:id', authenticate, allowRoles('MODERATOR', 'OWNER'), handler)
//
// ВАЖНО: allowRoles ВСЕГДА идёт после authenticate. Если authenticate
// не был применён — 500 (ошибка программиста), не 403.
// ============================================================

type Role = AuthPayload['role'];

export const allowRoles =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    let user: AuthPayload;
    try {
      user = getAuthUser(req);
    } catch {
      // authenticate не подключён к этому роуту — это баг в коде, не в клиенте.
      console.error(
        `[allowRoles] ${req.method} ${req.originalUrl} reached allowRoles without authenticate`
      );
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };