import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import archiver from 'archiver';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { getAuthUser, JWT_SECRET } from '../middleware/auth';
import { logAction, LogActions } from '../utils/logger';
import {
  runMemeUpload,
  finalizeMemeFile,
  deleteStoredFile,
  UploadError,
} from '../utils/upload';
import { generateVideoPoster } from '../utils/videoPoster';

// ============================================================
// Контроллер мемов (блок 2).
// Публичные:  GET /api/memes, GET /api/memes/top-authors
// Auth:       POST /api/memes (upload), POST /api/memes/:id/like
// Автор/мод:  DELETE /api/memes/:id (soft-delete)
// Мод/owner:  POST /api/memes/:id/restore
// Мод/owner:  GET /api/admin/memes/trash
// Мод/owner:  GET /api/admin/memes/export.zip
// ============================================================

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

// ===== Типы ответа =====
interface PublicMemeAuthor {
  id: number;
  fullName: string;
  username: string | null;
}

interface PublicMeme {
  id: number;
  title: string | null;
  description: string | null;
  fileUrl: string;        // "/uploads/memes/2026/11/<uuid>.mp4"
  posterUrl: string | null;
  mediaType: 'IMAGE' | 'VIDEO';
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  createdAt: Date;
  author: PublicMemeAuthor;
  likeCount: number;
  likedByMe: boolean;
}

interface TrashMeme extends PublicMeme {
  deletedAt: Date;
  deletedBy: { id: number; fullName: string } | null;
}

type MemeRow = {
  id: number;
  title: string | null;
  description: string | null;
  filePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  mediaType: 'IMAGE' | 'VIDEO';
  posterPath: string | null;
  createdAt: Date;
  author: PublicMemeAuthor;
  _count: { likes: number };
  likes: { id: number }[];
};

// ===== Хелперы =====

// JWT без запроса в БД — для публичных эндпоинтов, где авторизация опциональна.
// Невалидный/истёкший токен → null (гость). Никогда не бросает.
function extractAuthUserId(req: Request): number | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)) {
      const id = (decoded as Record<string, unknown>)['id'];
      if (typeof id === 'number') return id;
    }
  } catch {
    // гость
  }
  return null;
}

function parseIdParam(req: Request): number | null {
  const raw = req.params['id'];
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePagination(req: Request): { page: number; limit: number } | null {
  const rawPage = typeof req.query['page'] === 'string' ? req.query['page'] : '';
  const rawLimit = typeof req.query['limit'] === 'string' ? req.query['limit'] : '';

  const page = rawPage === '' ? 1 : /^\d+$/.test(rawPage) ? Number.parseInt(rawPage, 10) : NaN;
  const limit = rawLimit === '' ? DEFAULT_LIMIT : /^\d+$/.test(rawLimit) ? Number.parseInt(rawLimit, 10) : NaN;

  if (!Number.isFinite(page) || page < 1) return null;
  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) return null;
  return { page, limit };
}

type ParseStringResult = { ok: true; value: string | null } | { ok: false };

function parseOptionalString(value: unknown, maxLen: number): ParseStringResult {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > maxLen) return { ok: false };
  return { ok: true, value: trimmed };
}

// Select для ленты/upload — вложенный likes фильтрован по текущему юзеру
// (guest → -1, никогда не совпадёт).
function buildMemeSelect(currentUserId: number): Prisma.MemeSelect {
  return {
    id: true,
    title: true,
    description: true,
    filePath: true,
    originalName: true,
    mimeType: true,
    sizeBytes: true,
    mediaType: true,
    posterPath: true,
    createdAt: true,
    author: { select: { id: true, fullName: true, username: true } },
    _count: { select: { likes: true } },
    likes: {
      where: { userId: currentUserId },
      select: { id: true },
      take: 1,
    },
  };
}

function toPublicMeme(m: MemeRow): PublicMeme {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    fileUrl: '/' + m.filePath,
    posterUrl: m.posterPath ? '/' + m.posterPath : null,
    mediaType: m.mediaType,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    originalName: m.originalName,
    createdAt: m.createdAt,
    author: m.author,
    likeCount: m._count.likes,
    likedByMe: m.likes.length > 0,
  };
}

// ============================================================
// GET /api/memes?page=1&limit=25 — публичная лента (живые мемы).
// ============================================================
export const listMemes = async (req: Request, res: Response): Promise<void> => {
  const pagination = parsePagination(req);
  if (!pagination) {
    res.status(400).json({ error: `Invalid page/limit (limit 1..${MAX_LIMIT})` });
    return;
  }
  const { page, limit } = pagination;

  const currentUserId = extractAuthUserId(req);
  const select = buildMemeSelect(currentUserId ?? -1);

  let total: number;
  let memes: MemeRow[];
  try {
    [total, memes] = await Promise.all([
      prisma.meme.count({ where: { deletedAt: null } }),
      prisma.meme.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select,
      }),
    ]);
  } catch (err) {
    console.error('[memeController.listMemes] DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  res.json({
    memes: memes.map(toPublicMeme),
    pagination: { page, limit, total, totalPages },
  });
};

// ============================================================
// POST /api/memes — загрузка (multipart: file, title?, description?).
// Шаги: multer → temp, finalize (magic + move), validate title/desc,
//       ffmpeg poster (если VIDEO), DB create. На любом сбое после
//       move — удаляем уже сохранённые файлы.
// ============================================================
export const uploadMeme = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthUser(req);

  // 1. multer — temp file
  try {
    await runMemeUpload(req, res);
  } catch (err) {
    if (err instanceof UploadError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[memeController.uploadMeme] multer error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded (field "file" required)' });
    return;
  }

  // 2. finalize — magic bytes, move to YYYY/MM/<uuid>.<ext>
  let finalized;
  try {
    finalized = await finalizeMemeFile(
      req.file.path,
      req.file.originalname,
      req.file.mimetype
    );
  } catch (err) {
    if (err instanceof UploadError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('[memeController.uploadMeme] finalize error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  // 3. Валидация title/description
  const body = (req.body ?? {}) as Record<string, unknown>;
  const titleRes = parseOptionalString(body['title'], MAX_TITLE_LENGTH);
  if (!titleRes.ok) {
    await deleteStoredFile(finalized.filePath);
    res.status(400).json({ error: `title must be at most ${MAX_TITLE_LENGTH} characters` });
    return;
  }
  const descRes = parseOptionalString(body['description'], MAX_DESCRIPTION_LENGTH);
  if (!descRes.ok) {
    await deleteStoredFile(finalized.filePath);
    res.status(400).json({ error: `description must be at most ${MAX_DESCRIPTION_LENGTH} characters` });
    return;
  }

  // 4. Poster (VIDEO) — best effort, не блокирует сохранение
  let posterPath: string | null = null;
  if (finalized.mediaType === 'VIDEO') {
    const videoAbsPath = path.join(process.cwd(), finalized.filePath);
    const poster = await generateVideoPoster(
      videoAbsPath,
      finalized.filePath,
      finalized.fileName
    );
    if (poster) posterPath = poster.posterPath;
  }

  // 5. DB create
  let created: MemeRow;
  try {
    created = await prisma.meme.create({
      data: {
        title: titleRes.value,
        description: descRes.value,
        filePath: finalized.filePath,
        fileName: finalized.fileName,
        originalName: finalized.originalName,
        mimeType: finalized.mimeType,
        sizeBytes: finalized.sizeBytes,
        mediaType: finalized.mediaType,
        posterPath,
        authorId: auth.id,
      },
      select: buildMemeSelect(auth.id),
    });
  } catch (err) {
    await deleteStoredFile(finalized.filePath);
    if (posterPath) await deleteStoredFile(posterPath);
    console.error('[memeController.uploadMeme] DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  await logAction({
    action: LogActions.MEME_UPLOAD,
    userId: auth.id,
    details: `memeId=${created.id} media=${finalized.mediaType} size=${finalized.sizeBytes}`,
    req,
  });

  res.status(201).json(toPublicMeme(created));
};

// ============================================================
// POST /api/memes/:id/like — toggle (auth).
// Возвращает { liked, likeCount }.
// ============================================================
export const toggleLike = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthUser(req);
  const id = parseIdParam(req);
  if (id === null) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const meme = await prisma.meme.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });
  if (!meme || meme.deletedAt) {
    res.status(404).json({ error: 'Meme not found' });
    return;
  }

  let liked: boolean;
  try {
    const existing = await prisma.memeLike.findUnique({
      where: { memeId_userId: { memeId: id, userId: auth.id } },
      select: { id: true },
    });
    if (existing) {
      await prisma.memeLike.delete({ where: { id: existing.id } });
      liked = false;
    } else {
      await prisma.memeLike.create({ data: { memeId: id, userId: auth.id } });
      liked = true;
    }
  } catch (err) {
    // P2002 (race: два параллельных like) → считаем как уже лайкнут
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    ) {
      liked = true;
    } else {
      console.error('[memeController.toggleLike] DB error:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  }

  const likeCount = await prisma.memeLike.count({ where: { memeId: id } });
  res.json({ liked, likeCount });
};

// ============================================================
// DELETE /api/memes/:id — soft-delete (автор или MODERATOR/OWNER).
// ============================================================
export const softDeleteMeme = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthUser(req);
  const id = parseIdParam(req);
  if (id === null) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const meme = await prisma.meme.findUnique({
    where: { id },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!meme) {
    res.status(404).json({ error: 'Meme not found' });
    return;
  }
  if (meme.deletedAt) {
    res.status(409).json({ error: 'Already deleted' });
    return;
  }

  const isAuthor = meme.authorId === auth.id;
  const isMod = auth.role === 'MODERATOR' || auth.role === 'OWNER';
  if (!isAuthor && !isMod) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  try {
    await prisma.meme.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: auth.id },
    });
  } catch (err) {
    console.error('[memeController.softDeleteMeme] DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  await logAction({
    action: LogActions.MEME_DELETE,
    userId: auth.id,
    details: `memeId=${id} byAuthor=${isAuthor}`,
    req,
  });

  res.json({ ok: true });
};

// ============================================================
// POST /api/memes/:id/restore — восстановление (MODERATOR/OWNER).
// ============================================================
export const restoreMeme = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthUser(req);
  const id = parseIdParam(req);
  if (id === null) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const meme = await prisma.meme.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });
  if (!meme) {
    res.status(404).json({ error: 'Meme not found' });
    return;
  }
  if (!meme.deletedAt) {
    res.status(409).json({ error: 'Not deleted' });
    return;
  }

  try {
    await prisma.meme.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
  } catch (err) {
    console.error('[memeController.restoreMeme] DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  await logAction({
    action: LogActions.MEME_RESTORE,
    userId: auth.id,
    details: `memeId=${id}`,
    req,
  });

  res.json({ ok: true });
};

// ============================================================
// GET /api/admin/memes/trash — корзина (MODERATOR/OWNER).
// ============================================================
export const listTrash = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthUser(req);
  const pagination = parsePagination(req);
  if (!pagination) {
    res.status(400).json({ error: `Invalid page/limit (limit 1..${MAX_LIMIT})` });
    return;
  }
  const { page, limit } = pagination;

  const baseSelect = buildMemeSelect(auth.id);
  const trashSelect: Prisma.MemeSelect = {
    ...baseSelect,
    deletedAt: true,
    deletedBy: { select: { id: true, fullName: true } },
  };

  let total: number;
  let memes: (MemeRow & {
    deletedAt: Date | null;
    deletedBy: { id: number; fullName: string } | null;
  })[];
  try {
    [total, memes] = await Promise.all([
      prisma.meme.count({ where: { deletedAt: { not: null } } }),
      prisma.meme.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: trashSelect,
      }),
    ]);
  } catch (err) {
    console.error('[memeController.listTrash] DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const trash: TrashMeme[] = memes
    .filter((m): m is typeof m & { deletedAt: Date } => m.deletedAt !== null)
    .map((m) => ({
      ...toPublicMeme(m),
      deletedAt: m.deletedAt,
      deletedBy: m.deletedBy,
    }));

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  res.json({
    memes: trash,
    pagination: { page, limit, total, totalPages },
  });
};

// ============================================================
// GET /api/memes/top-authors — топ-3 по числу живых мемов.
// ============================================================
export const topAuthors = async (_req: Request, res: Response): Promise<void> => {
  try {
    const grouped = await prisma.meme.groupBy({
      by: ['authorId'],
      where: { deletedAt: null },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 3,
    });

    if (grouped.length === 0) {
      res.json({ authors: [] });
      return;
    }

    const ids = grouped.map((g) => g.authorId);
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, username: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    const authors = grouped
      .map((g) => {
        const user = byId.get(g.authorId);
        if (!user) return null;
        return { user, count: g._count.id };
      })
      .filter((x): x is { user: PublicMemeAuthor; count: number } => x !== null);

    res.json({ authors });
  } catch (err) {
    console.error('[memeController.topAuthors] DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ============================================================
// GET /api/admin/memes/export.zip — ZIP всех живых мемов (MODERATOR/OWNER).
// Файлы: <id>_<originalName>. Без сжатия (store) — видео/картинки
// жмутся плохо, а скорость важнее.
// ============================================================
export const exportZip = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuthUser(req);

  const memes = await prisma.meme.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, filePath: true, originalName: true },
  });

  if (memes.length === 0) {
    res.status(404).json({ error: 'No memes to export' });
    return;
  }

  const archive = archiver('zip', { store: true });

  archive.on('error', (err) => {
    console.error('[memeController.exportZip] archive error:', err);
    // Headers уже отправлены, статус не поменять — рвём соединение.
    if (!res.headersSent) {
      res.status(500).json({ error: 'Archive error' });
    } else {
      res.destroy();
    }
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="memes-${Date.now()}.zip"`
  );
  archive.pipe(res);

  for (const m of memes) {
    const absPath = path.join(process.cwd(), m.filePath);
    const entryName = `${m.id}_${m.originalName}`;
    archive.file(absPath, { name: entryName });
  }

  await archive.finalize();

  await logAction({
    action: LogActions.MEME_EXPORT_ZIP,
    userId: auth.id,
    details: `count=${memes.length}`,
    req,
  });
};