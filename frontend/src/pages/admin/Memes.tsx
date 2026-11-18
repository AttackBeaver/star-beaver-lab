import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  FaceSmileIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import {
  fetchTrash,
  restoreMeme,
  downloadExportZip,
  extractApiError,
  formatBytes,
  LIMIT_OPTIONS,
  DEFAULT_LIMIT,
  type LimitOption,
  type TrashMeme,
  type Pagination,
} from '../../services/memesApi';

// ============================================================
// /admin/memes — корзина мемов (MODERATOR/OWNER, guard в App.tsx).
// - Пагинация через URL (page, limit) — как в Logs.tsx.
// - Loading — derived during render, без setState в effect.
// - refreshToken — триггер рефетча после restore.
// - ZIP-экспорт — все живые мемы, blob → <a download>.
// ============================================================

const DEFAULT_PAGE = 1;
const SUCCESS_CLEAR_MS = 3500;

type View =
  | { key: string; status: 'loading' }
  | { key: string; status: 'error'; message: string }
  | { key: string; status: 'success'; memes: TrashMeme[]; pagination: Pagination };

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

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

const SELECT_CLASSES =
  'px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 ' +
  'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';

const MemesAdmin = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE);
  const limit = parseLimit(searchParams.get('limit'));
  const requestKey = `${page}|${limit}`;

  const [view, setView] = useState<View>({ key: requestKey, status: 'loading' });
  const [refreshToken, setRefreshToken] = useState(0);

  const currentView: View =
    view.key === requestKey ? view : { key: requestKey, status: 'loading' };

  // ===== Feedback =====
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ===== Restore pending (per-id) =====
  const [restorePending, setRestorePending] = useState<ReadonlySet<number>>(new Set());

  // ===== ZIP export =====
  const [zipping, setZipping] = useState(false);

  const showSuccess = (msg: string): void => {
    setActionSuccess(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setActionSuccess(null), SUCCESS_CLEAR_MS);
  };

  // ===== Fetch =====
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetchTrash(page, limit, controller.signal);
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

  // ===== Handlers =====
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

  const handleRestore = async (meme: TrashMeme): Promise<void> => {
    if (restorePending.has(meme.id)) return;
    setRestorePending((prev) => new Set(prev).add(meme.id));
    setActionError(null);
    try {
      await restoreMeme(meme.id);
      showSuccess(`Мем #${meme.id} восстановлен`);
      setRefreshToken((t) => t + 1);
    } catch (err) {
      setActionError(extractApiError(err));
    } finally {
      setRestorePending((prev) => {
        const next = new Set(prev);
        next.delete(meme.id);
        return next;
      });
    }
  };

  const handleExport = async (): Promise<void> => {
    setZipping(true);
    setActionError(null);
    try {
      const blob = await downloadExportZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memes-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showSuccess('ZIP-архив скачан');
    } catch (err) {
      setActionError(extractApiError(err));
    } finally {
      setZipping(false);
    }
  };

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
          <div className="p-2 rounded-xl bg-gradient-to-r from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30">
            <TrashIcon className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Корзина мемов</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Удалённые мемы. Восстановить можно любой — файлы на диске не удаляются при soft-delete.
        </p>
      </div>

      {/* ===== Тулбар ===== */}
      <section className="mb-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Link
            to="/memes"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
          >
            <FaceSmileIcon className="w-4 h-4" />
            К ленте
          </Link>
        </div>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={zipping}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          {zipping ? 'Готовим архив…' : 'Скачать ZIP (все живые)'}
        </button>
      </section>

      {/* ===== Сообщения ===== */}
      {actionError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
        >
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300"
        >
          <CheckCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* ===== Таблица ===== */}
      <section className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        {currentView.status === 'loading' && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <div className="inline-block w-8 h-8 border-4 border-blue-200 dark:border-blue-900/40 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mb-3" />
            <p>Загрузка…</p>
          </div>
        )}

        {currentView.status === 'error' && (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-3">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-red-700 dark:text-red-300 font-medium mb-1">Ошибка загрузки</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{currentView.message}</p>
          </div>
        )}

        {currentView.status === 'success' && currentView.memes.length === 0 && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <TrashIcon className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Корзина пуста</p>
          </div>
        )}

        {currentView.status === 'success' && currentView.memes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  <th className="px-3 py-3 w-16">ID</th>
                  <th className="px-3 py-3 w-24">Превью</th>
                  <th className="px-3 py-3">Заголовок</th>
                  <th className="px-3 py-3 whitespace-nowrap">Автор</th>
                  <th className="px-3 py-3 whitespace-nowrap">Удалил</th>
                  <th className="px-3 py-3 whitespace-nowrap">Когда</th>
                  <th className="px-3 py-3 w-28">Размер</th>
                  <th className="px-3 py-3 w-20 text-right">—</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {currentView.memes.map((meme) => (
                  <tr
                    key={meme.id}
                    className="hover:bg-gray-50/70 dark:hover:bg-gray-900/30 transition-colors"
                  >
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {meme.id}
                    </td>
                    <td className="px-3 py-2">
                      <div className="w-16 h-12 rounded-md overflow-hidden bg-black/10 dark:bg-black/40 flex items-center justify-center">
                        {meme.mediaType === 'IMAGE' ? (
                          <img
                            src={meme.fileUrl}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : meme.posterUrl ? (
                          <div className="relative w-full h-full">
                            <img
                              src={meme.posterUrl}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <PlayIcon className="w-4 h-4 text-white" />
                            </span>
                          </div>
                        ) : (
                          <PlayIcon className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-gray-800 dark:text-gray-200 truncate max-w-[260px]">
                        {meme.title ?? <span className="text-gray-400 dark:text-gray-600 italic">без названия</span>}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500 font-mono truncate max-w-[260px]">
                        {meme.originalName}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      <div className="text-gray-800 dark:text-gray-200">{meme.author.fullName}</div>
                      <div className="text-gray-500 dark:text-gray-500 font-mono">
                        #{meme.author.id}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {meme.deletedBy ? (
                        <>
                          <div className="text-gray-800 dark:text-gray-200">{meme.deletedBy.fullName}</div>
                          <div className="text-gray-500 dark:text-gray-500 font-mono">
                            #{meme.deletedBy.id}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatDateTime(meme.deletedAt)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatBytes(meme.sizeBytes)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void handleRestore(meme)}
                        disabled={restorePending.has(meme.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Восстановить"
                      >
                        <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                        Восстановить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== Пагинация ===== */}
        {currentView.status === 'success' && currentView.pagination.totalPages > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-900/30">
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
                  className={`${SELECT_CLASSES} text-sm py-1`}
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
      </section>
    </div>
  );
};

export default MemesAdmin;