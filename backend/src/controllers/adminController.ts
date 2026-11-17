import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

// ============================================================
// Админские чтения для OWNER.
// В блоке 1 — только аудит-логи (GET /api/admin/logs).
// Пользователи / мемы / новости — блок 7 (единый UI).
//
// Контракт:
//   GET /api/admin/logs?page=1&limit=25&action=LOGIN&userId=3
//   → { logs: Log[], pagination: { page, limit, total, totalPages } }
//
// Сортировка всегда id DESC (свежие сверху) — договорённость блока 1.
// ============================================================

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

// Возвращает null при невалидном непустом значении, fallback при отсутствии.
// Используется для page/limit, чтобы явно различать «не задано» и «задано плохо».
function parseBoundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number | null {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

// Публичная форма Log для отдачи наружу. user приходит null, если
// пользователь удалён (в схеме userId → SetNull).
interface LogListItem {
  id: number;
  action: string;
  userId: number | null;
  details: string | null;
  ip: string | null;
  createdAt: Date;
  user: { id: number; fullName: string; email: string } | null;
}

// ============================================================
// GET /api/admin/logs
// Доступ: OWNER (проверка на уровне роута через allowRoles).
// Фильтры блока 1: page, limit, action (точное совпадение), userId.
// Фильтр по датам — блок 7.
// ============================================================
export const listLogs = async (req: Request, res: Response): Promise<void> => {
  const rawPage = typeof req.query['page'] === 'string' ? req.query['page'] : null;
  const rawLimit = typeof req.query['limit'] === 'string' ? req.query['limit'] : null;
  const rawAction = typeof req.query['action'] === 'string' ? req.query['action'].trim() : '';
  const rawUserId = typeof req.query['userId'] === 'string' ? req.query['userId'].trim() : '';

  const page = parseBoundedInt(rawPage, DEFAULT_PAGE, 1, Number.MAX_SAFE_INTEGER);
  if (page === null) {
    res.status(400).json({ error: 'page must be a positive integer' });
    return;
  }

  const limit = parseBoundedInt(rawLimit, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT);
  if (limit === null) {
    res.status(400).json({ error: `limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}` });
    return;
  }

  let userId: number | null = null;
  if (rawUserId.length > 0) {
    if (!/^\d+$/.test(rawUserId)) {
      res.status(400).json({ error: 'userId must be a positive integer' });
      return;
    }
    const parsed = Number.parseInt(rawUserId, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      res.status(400).json({ error: 'userId must be a positive integer' });
      return;
    }
    userId = parsed;
  }

  // exactOptionalPropertyTypes: собираем where пошагово, не кладём undefined.
  const where: Prisma.LogWhereInput = {};
  if (rawAction.length > 0) where.action = rawAction;
  if (userId !== null) where.userId = userId;

  const skip = (page - 1) * limit;

  let total: number;
  let logs: LogListItem[];
  try {
    [total, logs] = await Promise.all([
      prisma.log.count({ where }),
      prisma.log.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          action: true,
          userId: true,
          details: true,
          ip: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
    ]);
  } catch (err) {
    console.error('[adminController.listLogs] DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  res.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  });
};