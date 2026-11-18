import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// ============================================================
// Постер для видео (блок 2).
// - Первый кадр → JPEG, вписанный в 480×480 с сохранением пропорций,
//   без upscale (force_original_aspect_ratio=decrease).
// - ffmpeg через spawn (без shell), таймаут 30 сек → SIGKILL.
// - НИКОГДА не бросает: при любой ошибке → null. Мем сохраняется
//   без постера, фронт отрендерит <video> fallback.
// - Постер кладётся рядом с видео: "<uuid>_poster.jpg".
// ============================================================

const FFMPEG_TIMEOUT_MS = 30_000;
const POSTER_BOX = 480;      // max(w, h) постера
const POSTER_QUALITY = 3;    // ffmpeg -q:v для JPEG: 2 (best) … 31 (worst)
const MIN_POSTER_BYTES = 100; // ffmpeg иногда пишет пустой файл при кодек-фейле

export interface PosterResult {
  posterPath: string;    // "uploads/memes/2026/11/<uuid>_poster.jpg"
  posterAbsPath: string; // абсолютный
}

// videoAbsPath — абсолютный путь к уже сохранённому видео
// videoRelPath — относительный ("uploads/memes/2026/11/<uuid>.mp4")
// videoFileName — имя файла видео ("<uuid>.mp4")
export async function generateVideoPoster(
  videoAbsPath: string,
  videoRelPath: string,
  videoFileName: string
): Promise<PosterResult | null> {
  const posterFileName =
    videoFileName.replace(/\.[^.]+$/, '') + '_poster.jpg';
  const posterAbsPath = path.join(path.dirname(videoAbsPath), posterFileName);
  const posterPath = path.posix.join(
    path.posix.dirname(videoRelPath),
    posterFileName
  );

  const ok = await runFfmpeg(videoAbsPath, posterAbsPath);
  if (!ok) return null;

  // ffmpeg иногда возвращает 0, но пишет пустой файл (битый кодек).
  try {
    const stat = await fs.stat(posterAbsPath);
    if (stat.size < MIN_POSTER_BYTES) {
      await fs.unlink(posterAbsPath).catch(() => {});
      return null;
    }
  } catch {
    return null;
  }

  return { posterPath, posterAbsPath };
}

// Возвращает true только если ffmpeg завершился с кодом 0 за отведённое время.
function runFfmpeg(input: string, output: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;

    const vf = `scale=w=${POSTER_BOX}:h=${POSTER_BOX}:force_original_aspect_ratio=decrease`;
    const args = [
      '-y',                      // перезаписать
      '-i', input,
      '-frames:v', '1',          // ровно один кадр
      '-vf', vf,
      '-q:v', String(POSTER_QUALITY),
      '-f', 'image2',
      output,
    ];

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      console.warn('[videoPoster] spawn failed:', err);
      resolve(false);
      return;
    }

    let stderrTail = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-500);
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      console.warn(
        `[videoPoster] ffmpeg timeout after ${FFMPEG_TIMEOUT_MS}ms; stderr tail: ${stderrTail}`
      );
      resolve(false);
    }, FFMPEG_TIMEOUT_MS);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.warn('[videoPoster] ffmpeg error:', err.message);
      resolve(false);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        console.warn(
          `[videoPoster] ffmpeg exited code=${code}; stderr tail: ${stderrTail}`
        );
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}