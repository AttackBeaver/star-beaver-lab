import multer from 'multer';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import path from 'path';
import { mkdirSync } from 'fs';
import fs from 'fs/promises';

// ============================================================
// Загрузка мемов (блок 2).
// - multer.diskStorage → uploads/memes/_tmp/<uuid> (без расширения).
// - После multer: magic bytes → реальный MIME; сверка с declared;
//   проверка размера по типу; переезд в uploads/memes/YYYY/MM/<uuid>.<ext>.
// - Лимиты: IMAGE 10 MB, VIDEO 100 MB. multer.limits.fileSize = 100 MB
//   (глобальный потолок), точная проверка — в finalizeMemeFile().
// - SVG не разрешён (XSS через <script> внутри SVG).
// ============================================================

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;   // 10 MB
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024;  // 100 MB
export const MAX_UPLOAD_SIZE = MAX_VIDEO_SIZE;

const MEMES_ROOT = path.posix.join('uploads', 'memes');
const TMP_DIR_REL = path.posix.join(MEMES_ROOT, '_tmp');
const TMP_DIR_ABS = path.join(process.cwd(), TMP_DIR_REL);

// Создаём TMP_DIR при старте модуля (один раз), чтобы destination был синхронным.
try {
  mkdirSync(TMP_DIR_ABS, { recursive: true });
} catch (err) {
  console.error('[upload] failed to create TMP_DIR:', err);
}

// ===== Типы =====
export type MediaKind = 'IMAGE' | 'VIDEO';

export type AllowedMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  | 'video/mp4'
  | 'video/webm';

export interface FinalizedFile {
  filePath: string;      // "uploads/memes/2026/11/<uuid>.mp4" (относительно backend/)
  fileName: string;      // "<uuid>.mp4"
  originalName: string;  // sanitized
  mimeType: AllowedMime;
  sizeBytes: number;
  mediaType: MediaKind;
}

export class UploadError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'UploadError';
    this.statusCode = statusCode;
  }
}

// ===== Magic bytes =====
// Сравниваем по hex-строке первых 16 байт — без индексирования Buffer,
// noUncheckedIndexedAccess не мешает.
function detectByMagic(buf: Buffer): { mimeType: AllowedMime; ext: string; mediaType: MediaKind } | null {
  if (buf.length < 16) return null;
  const hex = buf.toString('hex');

  // JPEG: FF D8 FF
  if (hex.startsWith('ffd8ff')) {
    return { mimeType: 'image/jpeg', ext: '.jpg', mediaType: 'IMAGE' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (hex.startsWith('89504e470d0a1a0a')) {
    return { mimeType: 'image/png', ext: '.png', mediaType: 'IMAGE' };
  }
  // GIF: "GIF8" (47 49 46 38), покрывает GIF87a и GIF89a
  if (hex.startsWith('47494638')) {
    return { mimeType: 'image/gif', ext: '.gif', mediaType: 'IMAGE' };
  }
  // WEBP: RIFF (0..3) + .... + WEBP (8..11)
  if (hex.startsWith('52494646') && hex.substring(16, 24) === '57454250') {
    return { mimeType: 'image/webp', ext: '.webp', mediaType: 'IMAGE' };
  }
  // MP4: "ftyp" на байтах 4..7
  if (hex.substring(8, 16) === '66747970') {
    return { mimeType: 'video/mp4', ext: '.mp4', mediaType: 'VIDEO' };
  }
  // WEBM / Matroska: EBML 1A 45 DF A3
  if (hex.startsWith('1a45dfa3')) {
    return { mimeType: 'video/webm', ext: '.webm', mediaType: 'VIDEO' };
  }

  return null;
}

// ===== Очистка =====
export async function safeUnlink(absPath: string): Promise<void> {
  try {
    await fs.unlink(absPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn('[upload.safeUnlink] failed:', err);
    }
  }
}

// Удаляет уже сохранённый файл мема (если запись в БД не создалась).
// Принимает относительный путь из БД. Защита от path traversal.
export async function deleteStoredFile(relPath: string): Promise<void> {
  if (!relPath || !relPath.startsWith(MEMES_ROOT + '/')) return;
  await safeUnlink(path.join(process.cwd(), relPath));
}

// ===== Sanitize originalName =====
function sanitizeOriginalName(raw: string, expectedExt: string): string {
  const base = path.basename(raw || 'file');
  // control chars (\x00-\x1F, \x7F) и path separators — вырезаем
  const cleaned = base.replace(/[\u0000-\u001F\u007F/\\]/g, '').trim();
  const noExt = cleaned.replace(/\.[^.]*$/, '');
  const safeBase = noExt.length > 0 ? noExt : 'file';
  return `${safeBase.slice(0, 200)}${expectedExt}`.slice(0, 255);
}

// ===== Multer =====
const ALLOWED_MIMES: ReadonlyArray<string> = [
  'image/jpeg',
  'image/jpg',  // некоторые клиенты шлют алиас
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, TMP_DIR_ABS);
  },
  filename: (_req, _file, cb) => {
    cb(null, randomUUID());
  },
});

const uploader = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      cb(new UploadError(`Unsupported MIME: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
}).single('file');

// Promise-обёртка над multer (callback-style). Приводит MulterError
// к UploadError со statusCode, чтобы global error-handler отдал 4xx.
export async function runMemeUpload(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    uploader(req, res, (err: unknown) => {
      if (!err) {
        resolve();
        return;
      }
      if (err instanceof UploadError) {
        reject(err);
        return;
      }
      if (typeof err === 'object' && err !== null && 'code' in err) {
        const code = (err as { code: unknown }).code;
        if (code === 'LIMIT_FILE_SIZE') {
          reject(new UploadError(`File too large (max ${MAX_UPLOAD_SIZE / 1024 / 1024} MB)`, 413));
          return;
        }
        if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
          reject(new UploadError('Invalid file field or count', 400));
          return;
        }
      }
      reject(new UploadError('Upload failed'));
    });
  });
}

// ===== Finalize =====
// Читает magic bytes, сверяет с declaredMime, проверяет размер по типу,
// переносит файл из _tmp в uploads/memes/YYYY/MM/<uuid>.<ext>.
// При любой ошибке — удаляет temp и бросает UploadError.
export async function finalizeMemeFile(
  tempAbsPath: string,
  originalNameRaw: string,
  declaredMime: string
): Promise<FinalizedFile> {
  let stat;
  try {
    stat = await fs.stat(tempAbsPath);
  } catch {
    throw new UploadError('Uploaded file not found', 500);
  }

  const handle = await fs.open(tempAbsPath, 'r');
  let magicBuf: Buffer;
  try {
    magicBuf = Buffer.alloc(16);
    await handle.read(magicBuf, 0, 16, 0);
  } finally {
    await handle.close();
  }

  const detected = detectByMagic(magicBuf);
  if (!detected) {
    await safeUnlink(tempAbsPath);
    throw new UploadError('Unsupported file format (magic bytes mismatch)');
  }

  // Сверка declared vs detected. Разрешаем jpeg/jpg алиасы.
  const jpegAliases = ['image/jpeg', 'image/jpg'];
  const declaredOk =
    declaredMime === detected.mimeType ||
    (jpegAliases.includes(declaredMime) && jpegAliases.includes(detected.mimeType));
  if (!declaredOk) {
    await safeUnlink(tempAbsPath);
    throw new UploadError(
      `Declared type "${declaredMime}" does not match file content ("${detected.mimeType}")`
    );
  }

  if (detected.mediaType === 'IMAGE' && stat.size > MAX_IMAGE_SIZE) {
    await safeUnlink(tempAbsPath);
    throw new UploadError(`Image too large (max ${MAX_IMAGE_SIZE / 1024 / 1024} MB)`, 413);
  }
  if (detected.mediaType === 'VIDEO' && stat.size > MAX_VIDEO_SIZE) {
    await safeUnlink(tempAbsPath);
    throw new UploadError(`Video too large (max ${MAX_VIDEO_SIZE / 1024 / 1024} MB)`, 413);
  }

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uuid = randomUUID();
  const fileName = `${uuid}${detected.ext}`;
  const relDir = path.posix.join(MEMES_ROOT, year, month);
  const absDir = path.join(process.cwd(), relDir);

  try {
    await fs.mkdir(absDir, { recursive: true });
    await fs.rename(tempAbsPath, path.join(absDir, fileName));
  } catch (err) {
    await safeUnlink(tempAbsPath);
    throw new UploadError('Failed to store uploaded file', 500);
  }

  return {
    filePath: path.posix.join(relDir, fileName),
    fileName,
    originalName: sanitizeOriginalName(originalNameRaw, detected.ext),
    mimeType: detected.mimeType,
    sizeBytes: stat.size,
    mediaType: detected.mediaType,
  };
}