import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { logAction, LogActions } from '../utils/logger';
import { getAuthUser, JWT_SECRET } from '../middleware/auth';

// ============================================================
// Аутентификация: register / login / logout / profile + блок 1:
// updateProfile / changePassword.
// - Пароль: bcryptjs, 10 раундов (OWASP baseline).
// - JWT: payload { id }, срок жизни из JWT_EXPIRES_IN (7d по умолчанию).
// - Валидация: ручная (без zod/react-hook-form на бэке — решение блока 0).
// - register автоматически логинит (возвращает token).
// ============================================================

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';
const BCRYPT_ROUNDS = 10;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ограничение
const MAX_EMAIL_LENGTH = 254;
const MAX_FULL_NAME_LENGTH = 100;

interface PublicUser {
  id: number;
  email: string;
  username: string | null;
  fullName: string;
  role: 'USER' | 'MODERATOR' | 'OWNER';
  createdAt: Date;
  lastLogin: Date | null;
}

function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
  };
}

// NonNullable убирает `undefined` из типа свойства.
// `as unknown as` — потому что `StringValue` из пакета `ms` — это
// template literal type (`\`${number}${'d'|'h'|'m'|'s'|...}\``),
// и TS не пропускает прямой каст `string → StringValue` без обхода через unknown.
type JwtExpiresIn = NonNullable<jwt.SignOptions['expiresIn']>;

function signToken(userId: number): string {
  const options: jwt.SignOptions = {};
  if (JWT_EXPIRES_IN.length > 0) {
    options.expiresIn = JWT_EXPIRES_IN as unknown as JwtExpiresIn;
  }
  return jwt.sign({ id: userId }, JWT_SECRET, options);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

// ============================================================
// POST /api/auth/register
// Body: { email, password, fullName, username? }
// ============================================================
export const register = async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const email = asString(body['email'])?.trim().toLowerCase() ?? null;
  const password = asString(body['password']) ?? null;
  const fullName = asString(body['fullName'])?.trim() ?? null;
  const rawUsername = asString(body['username'])?.trim() ?? null;
  const username = rawUsername && rawUsername.length > 0 ? rawUsername : null;

  // ---- Валидация ----
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }
  if (!password) {
    res.status(400).json({ error: 'Password is required' });
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` });
    return;
  }
  if (!fullName) {
    res.status(400).json({ error: 'Full name is required' });
    return;
  }
  if (fullName.length > MAX_FULL_NAME_LENGTH) {
    res.status(400).json({ error: `Full name must be at most ${MAX_FULL_NAME_LENGTH} characters` });
    return;
  }
  if (username !== null && !USERNAME_REGEX.test(username)) {
    res.status(400).json({
      error: 'Username must be 3-30 characters: letters, digits, underscore',
    });
    return;
  }

  // ---- Pre-check уникальности (для дружелюбных сообщений) ----
  const existingByEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingByEmail) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }
  if (username !== null) {
    const existingByUsername = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (existingByUsername) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }
  }

  // ---- Создание ----
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let user: PublicUser;
  try {
    user = await prisma.user.create({
      data: { email, passwordHash, fullName, username },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        createdAt: true,
        lastLogin: true,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      // Race condition: другой запрос успел занять email/username между pre-check и create.
      res.status(409).json({ error: 'Email or username already taken' });
      return;
    }
    console.error('[authController.register] DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  await logAction({
    action: LogActions.REGISTER,
    userId: user.id,
    details: `email=${email}`,
    req,
  });

  const token = signToken(user.id);
  res.status(201).json({ user: toPublicUser(user), token });
};

// ============================================================
// POST /api/auth/login
// Body: { email, password }
// Возвращает одинаковое сообщение при неверном email/пароле (anti-enumeration).
// ============================================================
export const login = async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const email = asString(body['email'])?.trim().toLowerCase() ?? null;
  const password = asString(body['password']) ?? null;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await logAction({
      action: LogActions.LOGIN_FAILED,
      userId: null,
      details: `email=${email} reason=not_found`,
      req,
    });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    await logAction({
      action: LogActions.LOGIN_FAILED,
      userId: user.id,
      details: `email=${email} reason=bad_password`,
      req,
    });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const lastLogin = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin },
  });

  await logAction({ action: LogActions.LOGIN, userId: user.id, req });

  const token = signToken(user.id);
  res.json({
    user: toPublicUser({ ...user, lastLogin }),
    token,
  });
};

// ============================================================
// POST /api/auth/logout
// JWT stateless — сервер только логирует. Клиент удаляет токен сам.
// ============================================================
export const logout = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthUser(req);
  await logAction({ action: LogActions.LOGOUT, userId: auth.id, req });
  res.json({ ok: true });
};

// ============================================================
// GET /api/auth/profile
// authenticate уже подгрузил базовые поля; догружаем username/createdAt/lastLogin.
// ============================================================
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthUser(req);

  const user = await prisma.user.findUnique({
    where: { id: auth.id },
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      role: true,
      createdAt: true,
      lastLogin: true,
    },
  });

  if (!user) {
    // Между authenticate и этим запросом пользователь мог быть удалён.
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
};

// ============================================================
// PATCH /api/auth/profile
// Body: { fullName?, username? }  (username: string | null; null — очистить)
// - email НЕ меняется (верификация по почте — блок 8+).
// - Требуется хотя бы одно поле.
// ============================================================
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthUser(req);
  const body = (req.body ?? {}) as Record<string, unknown>;

  // fullName: опционально; если присутствует — непустая строка ≤100
  let newFullName: string | undefined;
  if (body['fullName'] !== undefined) {
    const raw = body['fullName'];
    if (typeof raw !== 'string') {
      res.status(400).json({ error: 'fullName must be a string' });
      return;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      res.status(400).json({ error: 'fullName cannot be empty' });
      return;
    }
    if (trimmed.length > MAX_FULL_NAME_LENGTH) {
      res.status(400).json({ error: `fullName must be at most ${MAX_FULL_NAME_LENGTH} characters` });
      return;
    }
    newFullName = trimmed;
  }

  // username: опционально; null или пустая строка → очистить; строка → валидировать
  let newUsername: string | null | undefined;
  if (body['username'] !== undefined) {
    const raw = body['username'];
    if (raw === null) {
      newUsername = null;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        newUsername = null;
      } else {
        if (!USERNAME_REGEX.test(trimmed)) {
          res.status(400).json({
            error: 'Username must be 3-30 characters: letters, digits, underscore',
          });
          return;
        }
        newUsername = trimmed;
      }
    } else {
      res.status(400).json({ error: 'username must be a string or null' });
      return;
    }
  }

  if (newFullName === undefined && newUsername === undefined) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }

  // Pre-check уникальности username (если меняется на не-null и не совпадает с текущим)
  if (newUsername !== undefined && newUsername !== null) {
    const existing = await prisma.user.findUnique({
      where: { username: newUsername },
      select: { id: true },
    });
    if (existing && existing.id !== auth.id) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }
  }

  // exactOptionalPropertyTypes: собираем data только из заданных полей,
  // чтобы не передавать `undefined` явно.
  const data: { fullName?: string; username?: string | null } = {};
  if (newFullName !== undefined) data.fullName = newFullName;
  if (newUsername !== undefined) data.username = newUsername;

  let updated: PublicUser;
  try {
    updated = await prisma.user.update({
      where: { id: auth.id },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        createdAt: true,
        lastLogin: true,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      // Race condition: другой запрос занял username между pre-check и update.
      res.status(409).json({ error: 'Username already taken' });
      return;
    }
    console.error('[authController.updateProfile] DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const changed: string[] = [];
  if (newFullName !== undefined) changed.push('fullName');
  if (newUsername !== undefined) changed.push('username');

  await logAction({
    action: LogActions.PROFILE_UPDATE,
    userId: auth.id,
    details: `changed=${changed.join(',')}`,
    req,
  });

  res.json(toPublicUser(updated));
};

// ============================================================
// POST /api/auth/change-password
// Body: { currentPassword, newPassword }
// - Текущий пароль обязателен (защита от CSRF/угнанной сессии).
// - Новый пароль не может совпадать с текущим.
// - После смены текущий JWT остаётся валидным (SPA-норма; token versioning — не в блоке 1).
// ============================================================
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthUser(req);
  const body = (req.body ?? {}) as Record<string, unknown>;

  const currentPassword = asString(body['currentPassword']);
  const newPassword = asString(body['newPassword']);

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword are required' });
    return;
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.id },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    await logAction({
      action: LogActions.PASSWORD_CHANGE_FAILED,
      userId: auth.id,
      details: 'reason=bad_current',
      req,
    });
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  if (currentPassword === newPassword) {
    res.status(400).json({ error: 'New password must be different from current' });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: auth.id },
    data: { passwordHash },
  });

  await logAction({
    action: LogActions.PASSWORD_CHANGE,
    userId: auth.id,
    req,
  });

  res.json({ ok: true });
};