import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useDropzone, type FileRejection } from 'react-dropzone';
import {
  ArrowLeftIcon,
  FaceSmileIcon,
  HeartIcon,
  TrashIcon,
  PlayIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import { useAuth } from '../hooks/useAuth';
import {
  fetchMemes,
  fetchTopAuthors,
  uploadMeme,
  toggleLike,
  deleteMeme,
  extractApiError,
  formatBytes,
  MAX_VIDEO_SIZE,
  LIMIT_OPTIONS,
  DEFAULT_LIMIT,
  type LimitOption,
  type Meme,
  type Pagination,
  type TopAuthorEntry,
} from '../services/memesApi';

// ============================================================
// /memes — публичная лента мемов (блок 2).
// - Пагинация через URL (page, limit) — как в /admin/logs.
// - Loading — derived during render, без setState в effect.
// - refreshToken — триггер ручного перефетча (после upload/delete).
// - Лайк — оптимистичное обновление + reconcile с сервером.
// - Upload — только для залогиненных; dropzone + title/description.
// - Top-3 авторов — отдельный fetch, не критичен для рендера ленты.
// ============================================================

const DEFAULT_PAGE = 1;

const DROPZONE_ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
};

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const SUCCESS_CLEAR_MS = 3500;

type View =
  | { key: string; status: 'loading' }
  | { key: string; status: 'error'; message: string }
  | { key: string; status: 'success'; memes: Meme[]; pagination: Pagination };

// ===== Хелперы =====
function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function parseLimit(raw: string | null): LimitOption {
  const n = parsePositiveInt(raw, DEFAULT_LIMIT);
  return (LIMIT_OPTIONS as readonly number[]).includes(n)
    ? (n as LimitOption)
    : DEFAULT_LIMIT;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ============================================================
// Карточка мема. Состояние playing — локальное (не нужно родителю).
// ============================================================
interface MemeCardProps {
  meme: Meme;
  currentUserId: number | null;
  isModerator: boolean;
  likePending: boolean;
  onLike: (meme: Meme) => void;
  onDelete: (meme: Meme) => void;
}

const MemeCard = ({
  meme,
  currentUserId,
  isModerator,
  likePending,
  onLike,
  onDelete,
}: MemeCardProps) => {
  const [playing, setPlaying] = useState(false);
  const canDelete = currentUserId !== null && (currentUserId === meme.author.id || isModerator);

  return (
    <article className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-sm hover:shadow-md border border-gray-200/50 dark:border-gray-700/50 overflow-hidden transition-shadow flex flex-col">
      {/* ===== Медиа ===== */}
      <div className="relative bg-black/5 dark:bg-black/30 aspect-video flex items-center justify-center">
        {meme.mediaType === 'IMAGE' ? (
          <img
            src={meme.fileUrl}
            alt={meme.title ?? meme.originalName}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : playing ? (
          <video
            src={meme.fileUrl}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="relative w-full h-full group"
            aria-label="Воспроизвести видео"
          >
            {meme.posterUrl ? (
              <img
                src={meme.posterUrl}
                alt={meme.title ?? meme.originalName}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <video
                src={meme.fileUrl}
                preload="metadata"
                muted
                playsInline
                className="w-full h-full object-contain pointer-events-none"
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
              <span className="p-3 rounded-full bg-white/90 dark:bg-gray-900/90 shadow-lg">
                <PlayIcon className="w-7 h-7 text-gray-800 dark:text-gray-200 translate-x-0.5" />
              </span>
            </span>
          </button>
        )}
      </div>

      {/* ===== Текст ===== */}
      <div className="p-4 flex-1 flex flex-col">
        {meme.title && (
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-1 line-clamp-2">
            {meme.title}
          </h3>
        )}
        {meme.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-3">
            {meme.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-gray-100 dark:border-gray-700/50">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {meme.author.username ? `@${meme.author.username}` : meme.author.fullName}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-600 shrink-0">·</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              {formatDate(meme.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onLike(meme)}
              disabled={likePending}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
                meme.likedByMe
                  ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-label={meme.likedByMe ? 'Убрать лайк' : 'Лайкнуть'}
            >
              {meme.likedByMe ? (
                <HeartIconSolid className="w-4 h-4" />
              ) : (
                <HeartIcon className="w-4 h-4" />
              )}
              {meme.likeCount}
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(meme)}
                className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition"
                aria-label="Удалить мем"
                title="Удалить"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

// ============================================================
// Главная страница
// ============================================================
const Memes = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // ===== URL params =====
  const page = parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE);
  const limit = parseLimit(searchParams.get('limit'));
  const requestKey = `${page}|${limit}`;

  // ===== Данные ленты =====
  const [view, setView] = useState<View>({ key: requestKey, status: 'loading' });
  const [refreshToken, setRefreshToken] = useState(0);

  const currentView: View =
    view.key === requestKey ? view : { key: requestKey, status: 'loading' };

  // ===== Top-3 авторов =====
  const [topAuthors, setTopAuthors] = useState<TopAuthorEntry[]>([]);

  // ===== Upload state =====
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ===== Like pending (per-meme) =====
  const [likePending, setLikePending] = useState<ReadonlySet<number>>(new Set());

  // ===== Preview URL для выбранного файла =====
  const previewUrl = useMemo(() => {
    if (!uploadFile) return null;
    return URL.createObjectURL(uploadFile);
  }, [uploadFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ===== Fetch ленты =====
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetchMemes(page, limit, controller.signal);
        if (!cancelled) {
          setView({
            key: requestKey,
            status: 'success',
            memes: res.memes,
            pagination: res.pagination,
          });
        }
      } catch (err) {
        if (cancelled || axios.isCancel(err)) return;
        setView({ key: requestKey, status: 'error', message: extractApiError(err) });
      }
    };
    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, refreshToken]);

  // ===== Fetch top-authors =====
  useEffect(() => {
    const controller = new AbortController();
    fetchTopAuthors(controller.signal)
      .then((res) => setTopAuthors(res.authors))
      .catch((err) => {
        if (axios.isCancel(err)) return;
        // silent — не критично для отображения ленты
      });
    return () => controller.abort();
  }, [refreshToken]);

  // ===== Auto-clamp page =====
  const totalPages =
    currentView.status === 'success' ? currentView.pagination.totalPages : 0;
  useEffect(() => {
    if (totalPages === 0) return;
    if (page <= totalPages) return;
    const next = new URLSearchParams(searchParams);
    if (totalPages <= 1) next.delete('page');
    else next.set('page', String(totalPages));
    setSearchParams(next, { replace: true });
  }, [page, totalPages, searchParams, setSearchParams]);

  // ===== Пагинация =====
  const handlePageChange = (newPage: number): void => {
    const next = new URLSearchParams(searchParams);
    if (newPage <= 1) next.delete('page');
    else next.set('page', String(newPage));
    setSearchParams(next);
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newLimit = Number(e.target.value);
    const next = new URLSearchParams(searchParams);
    if (newLimit === DEFAULT_LIMIT) next.delete('limit');
    else next.set('limit', String(newLimit));
    next.delete('page');
    setSearchParams(next);
  };

  // ===== Upload =====
  const showSuccess = (msg: string): void => {
    setUploadSuccess(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setUploadSuccess(null), SUCCESS_CLEAR_MS);
  };

  const onDrop = useCallback((accepted: File[], rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      const first = rejections[0];
      const code = first?.errors[0]?.code;
      if (code === 'file-too-large') {
        setUploadError(`Файл слишком большой (макс. ${formatBytes(MAX_VIDEO_SIZE)})`);
      } else if (code === 'file-invalid-type') {
        setUploadError('Неподдерживаемый формат файла');
      } else if (code === 'too-many-files') {
        setUploadError('Можно загрузить только один файл');
      } else {
        setUploadError(first?.errors[0]?.message ?? 'Ошибка валидации файла');
      }
      return;
    }
    const file = accepted[0];
    if (!file) return;
    setUploadError(null);
    setUploadFile(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop,
    accept: DROPZONE_ACCEPT,
    maxSize: MAX_VIDEO_SIZE,
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  const handleUpload = async (): Promise<void> => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      await uploadMeme(
        { file: uploadFile, title: uploadTitle, description: uploadDesc },
        setUploadProgress
      );
      setUploadFile(null);
      setUploadTitle('');
      setUploadDesc('');
      setUploadProgress(0);
      showSuccess('Мем загружен');
      // Если не на первой странице — вернуться на неё, иначе refetch
      if (page !== 1) {
        const next = new URLSearchParams(searchParams);
        next.delete('page');
        setSearchParams(next, { replace: true });
      } else {
        setRefreshToken((t) => t + 1);
      }
    } catch (err) {
      setUploadError(extractApiError(err));
    } finally {
      setUploading(false);
    }
  };

  // ===== Like =====
  const handleLike = async (meme: Meme): Promise<void> => {
    if (likePending.has(meme.id)) return;
    setLikePending((prev) => new Set(prev).add(meme.id));

    const original = meme;
    setView((prev) =>
      prev.status === 'success'
        ? {
            ...prev,
            memes: prev.memes.map((m) =>
              m.id === meme.id
                ? {
                    ...m,
                    likedByMe: !m.likedByMe,
                    likeCount: m.likeCount + (m.likedByMe ? -1 : 1),
                  }
                : m
            ),
          }
        : prev
    );

    try {
      const res = await toggleLike(meme.id);
      setView((prev) =>
        prev.status === 'success'
          ? {
              ...prev,
              memes: prev.memes.map((m) =>
                m.id === meme.id
                  ? { ...m, likedByMe: res.liked, likeCount: res.likeCount }
                  : m
              ),
            }
          : prev
      );
    } catch {
      // rollback
      setView((prev) =>
        prev.status === 'success'
          ? { ...prev, memes: prev.memes.map((m) => (m.id === meme.id ? original : m)) }
          : prev
      );
    } finally {
      setLikePending((prev) => {
        const next = new Set(prev);
        next.delete(meme.id);
        return next;
      });
    }
  };

  // ===== Delete =====
  const handleDelete = async (meme: Meme): Promise<void> => {
    if (!window.confirm('Удалить этот мем?')) return;
    try {
      await deleteMeme(meme.id);
      showSuccess('Мем удалён');
      setRefreshToken((t) => t + 1);
    } catch (err) {
      setUploadError(extractApiError(err));
    }
  };

  // ===== Derived =====
  const isModerator = user?.role === 'MODERATOR' || user?.role === 'OWNER';
  const currentUserId = user?.id ?? null;
  const isLoggedIn = user !== null;

  return (
    <div className="py-8 sm:py-12">
      {/* ===== Заголовок ===== */}
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          На главную
        </Link>
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30">
            <FaceSmileIcon className="w-7 h-7 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Мемы</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Лента сообщества. Загружайте картинки и видео, ставьте лайки лучшим.
        </p>
      </div>

      {/* ===== Топ-3 авторов ===== */}
      {topAuthors.length > 0 && (
        <section className="mb-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrophyIcon className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Топ-3 автора
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {topAuthors.map((entry, idx) => (
              <div
                key={entry.user.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/50"
              >
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    idx === 0
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : idx === 1
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                  {entry.user.username ? `@${entry.user.username}` : entry.user.fullName}
                </span>
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 shrink-0">
                  {entry.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== Загрузка ===== */}
      {isLoggedIn && (
        <section className="mb-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpTrayIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Загрузить мем
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-3">
            {/* Dropzone + preview */}
            <div>
              {uploadFile ? (
                <div className="relative rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900">
                  {uploadFile.type.startsWith('image/') && previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Превью"
                      className="w-full h-40 object-contain"
                    />
                  ) : previewUrl ? (
                    <video
                      src={previewUrl}
                      controls
                      preload="metadata"
                      className="w-full h-40 object-contain"
                    />
                  ) : null}
                  <div className="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 truncate border-t border-gray-200 dark:border-gray-700">
                    {uploadFile.name} · {formatBytes(uploadFile.size)}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadFile(null);
                      setUploadError(null);
                    }}
                    disabled={uploading}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition disabled:opacity-50"
                    aria-label="Убрать файл"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={`h-40 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition ${
                    isDragActive
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-900/50'
                  }`}
                  onClick={openFilePicker}
                >
                  <input {...getInputProps()} />
                  <ArrowUpTrayIcon className="w-8 h-8 text-gray-400" />
                  <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {isDragActive ? 'Отпустите файл' : 'Перетащите или выберите'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    jpg/png/gif/webp до 10 MB, mp4/webm до 100 MB
                  </p>
                </div>
              )}
            </div>

            {/* Title/description + submit */}
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                maxLength={MAX_TITLE_LENGTH}
                placeholder="Заголовок (необязательно)"
                disabled={uploading}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-60"
              />
              <textarea
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                maxLength={MAX_DESCRIPTION_LENGTH}
                rows={2}
                placeholder="Описание (необязательно)"
                disabled={uploading}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:opacity-60 resize-none"
              />

              {uploading && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}

              {uploadError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
                >
                  <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}
              {uploadSuccess && (
                <div
                  role="status"
                  className="flex items-start gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300"
                >
                  <CheckCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{uploadSuccess}</span>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={!uploadFile || uploading}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {uploading ? `Загрузка ${uploadProgress}%` : 'Загрузить'}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {!isLoggedIn && (
        <div className="mb-6 p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
          <Link to="/login" className="font-medium underline hover:no-underline">
            Войдите
          </Link>{' '}
          или{' '}
          <Link to="/register" className="font-medium underline hover:no-underline">
            зарегистрируйтесь
          </Link>
          , чтобы загружать мемы и ставить лайки.
        </div>
      )}

      {/* ===== Лента ===== */}
      <section>
        {currentView.status === 'loading' && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <div className="inline-block w-8 h-8 border-4 border-blue-200 dark:border-blue-900/40 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mb-3" />
            <p>Загрузка…</p>
          </div>
        )}

        {currentView.status === 'error' && (
          <div className="p-8 text-center bg-white/80 dark:bg-gray-800/80 rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-3">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-red-700 dark:text-red-300 font-medium mb-1">Ошибка загрузки</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{currentView.message}</p>
          </div>
        )}

        {currentView.status === 'success' && currentView.memes.length === 0 && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
            <FaceSmileIcon className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Пока нет мемов. Загрузите первый!</p>
          </div>
        )}

        {currentView.status === 'success' && currentView.memes.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentView.memes.map((meme) => (
                <MemeCard
                  key={meme.id}
                  meme={meme}
                  currentUserId={currentUserId}
                  isModerator={isModerator}
                  likePending={likePending.has(meme.id)}
                  onLike={(m) => void handleLike(m)}
                  onDelete={(m) => void handleDelete(m)}
                />
              ))}
            </div>

            {/* ===== Пагинация ===== */}
            {currentView.pagination.totalPages > 0 && (
              <div className="mt-6 px-4 py-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Всего:{' '}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {currentView.pagination.total}
                  </span>
                </p>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                    На странице:
                    <select
                      value={limit}
                      onChange={handleLimitChange}
                      className="px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {LIMIT_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Предыдущая страница"
                  >
                    <ChevronLeftIcon className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-700 dark:text-gray-300 px-1">
                    {page}{' '}
                    <span className="text-gray-400 dark:text-gray-600">/</span>{' '}
                    {currentView.pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= currentView.pagination.totalPages}
                    className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Следующая страница"
                  >
                    <ChevronRightIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default Memes;