import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import api from '../../services/api';
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

// ============================================================
// /admin/logs (блок 1, только OWNER — guard на уровне роута).
// - URL search params = source of truth (page / limit / action / userId).
// - Загрузка — derived during render, не через setState в effect.
// - Авто-clamp page, если page > totalPages.
// ============================================================

const KNOWN_ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'REGISTER',
  'PROFILE_UPDATE',
  'PASSWORD_CHANGE',
  'PASSWORD_CHANGE_FAILED',
] as const;

const LIMIT_OPTIONS = [10, 25, 50] as const;
type LimitOption = (typeof LIMIT_OPTIONS)[number];
const DEFAULT_LIMIT: LimitOption = 25;
const DEFAULT_PAGE = 1;

interface LogUser {
  id: number;
  fullName: string;
  email: string;
}

interface LogItem {
  id: number;
  action: string;
  userId: number | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
  user: LogUser | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface LogsResponse {
  logs: LogItem[];
  pagination: Pagination;
}

// Discriminated union — TS сужает `data` до LogsResponse в ветке success,
// и в ветке error — обязательно есть `message`.
// Это устраняет ошибки 18048 ('view.data' is possibly 'undefined').
type FetchState =
  | { key: string; status: 'loading' }
  | { key: string; status: 'error'; message: string }
  | { key: string; status: 'success'; data: LogsResponse };

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

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: unknown } | undefined;
    if (data && typeof data.error === 'string' && data.error.length > 0) {
      return data.error;
    }
    return err.message || 'Ошибка запроса';
  }
  if (err instanceof Error) return err.message;
  return 'Неизвестная ошибка';
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

const ACTION_STYLES: Record<string, string> = {
  LOGIN: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  LOGIN_FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  LOGOUT: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  REGISTER: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  PROFILE_UPDATE: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  PASSWORD_CHANGE: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  PASSWORD_CHANGE_FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};
const DEFAULT_ACTION_STYLE = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';

const SELECT_CLASSES =
  'px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 ' +
  'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';

const Logs = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE);
  const limit = parseLimit(searchParams.get('limit'));
  const action = searchParams.get('action') ?? '';
  const userId = searchParams.get('userId') ?? '';
  const requestKey = `${page}|${limit}|${action}|${userId}`;

  const [fetchState, setFetchState] = useState<FetchState>({
    key: requestKey,
    status: 'loading',
  });

  // Derived during render. Если fetchState не для текущего requestKey —
  // loading. setState в effect не нужен, правило set-state-in-effect
  // не нарушено. Тип явно FetchState — discriminated union.
  const view: FetchState =
    fetchState.key === requestKey
      ? fetchState
      : { key: requestKey, status: 'loading' };

  const [actionInput, setActionInput] = useState(action);
  const [userIdInput, setUserIdInput] = useState(userId);
  const [filterError, setFilterError] = useState<string | null>(null);

  // Adjust-during-render при внешнем изменении URL (back/forward, Reset).
  // Не useEffect+setState — паттерн React: setState в рендере,
  // если значение действительно изменилось.
  const [prevUrlAction, setPrevUrlAction] = useState(action);
  if (prevUrlAction !== action) {
    setPrevUrlAction(action);
    setActionInput(action);
  }
  const [prevUrlUserId, setPrevUrlUserId] = useState(userId);
  if (prevUrlUserId !== userId) {
    setPrevUrlUserId(userId);
    setUserIdInput(userId);
  }

  // ===== Fetch =====
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (action) params.set('action', action);
    if (userId) params.set('userId', userId);

    const run = async () => {
      try {
        const res = await api.get<LogsResponse>(`/admin/logs?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!cancelled) {
          setFetchState({ key: requestKey, status: 'success', data: res.data });
        }
      } catch (err) {
        if (cancelled || axios.isCancel(err)) return;
        setFetchState({ key: requestKey, status: 'error', message: extractError(err) });
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // requestKey — производная от [page, limit, action, userId].
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, action, userId]);

  // ===== Авто-clamp page при выходе за totalPages =====
  const totalPages = view.status === 'success' ? view.data.pagination.totalPages : 0;
  useEffect(() => {
    if (totalPages === 0) return;
    if (page <= totalPages) return;
    const next = new URLSearchParams(searchParams);
    if (totalPages <= 1) next.delete('page');
    else next.set('page', String(totalPages));
    setSearchParams(next, { replace: true });
  }, [page, totalPages, searchParams, setSearchParams]);

  // ===== Хендлеры =====
  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newLimit = Number(e.target.value);
    const next = new URLSearchParams(searchParams);
    if (newLimit === DEFAULT_LIMIT) next.delete('limit');
    else next.set('limit', String(newLimit));
    next.delete('page');
    setSearchParams(next);
  };

  const handlePageChange = (newPage: number): void => {
    const next = new URLSearchParams(searchParams);
    if (newPage <= 1) next.delete('page');
    else next.set('page', String(newPage));
    setSearchParams(next);
  };

  const handleApplyFilters = (): void => {
    const aTrim = actionInput;
    const uTrim = userIdInput.trim();
    if (uTrim !== '' && !/^\d+$/.test(uTrim)) {
      setFilterError('userId должен быть положительным целым');
      return;
    }
    setFilterError(null);
    const next = new URLSearchParams(searchParams);
    next.delete('page');
    if (aTrim) next.set('action', aTrim);
    else next.delete('action');
    if (uTrim) next.set('userId', uTrim);
    else next.delete('userId');
    setSearchParams(next);
  };

  const handleResetFilters = (): void => {
    setActionInput('');
    setUserIdInput('');
    setFilterError(null);
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    next.delete('userId');
    next.delete('page');
    setSearchParams(next);
  };

  const filtersDirty = actionInput !== action || userIdInput.trim() !== userId;

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
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30">
            <ClipboardDocumentListIcon className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">
            Журнал действий
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Аудит-логи: все мутации и события входа/регистрации (кроме GET и
          <span className="font-mono"> /api/auth/*</span> — они логируются вручную).
        </p>
      </div>

      {/* ===== Фильтры ===== */}
      <section className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <FunnelIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Фильтры
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label htmlFor="filter-action" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Действие
            </label>
            <select
              id="filter-action"
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              className={`${SELECT_CLASSES} w-full`}
            >
              <option value="">Все</option>
              {KNOWN_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-userid" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              User ID
            </label>
            <input
              id="filter-userid"
              type="text"
              inputMode="numeric"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="например, 1"
              className={`${SELECT_CLASSES} w-full`}
            />
          </div>

          <div>
            <label htmlFor="filter-limit" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              На странице
            </label>
            <select
              id="filter-limit"
              value={limit}
              onChange={handleLimitChange}
              className={`${SELECT_CLASSES} w-full`}
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyFilters}
              disabled={!filtersDirty}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Применить
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              disabled={action === '' && userId === ''}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Сброс
            </button>
          </div>
        </div>

        {filterError && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
          >
            <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{filterError}</span>
          </div>
        )}
      </section>

      {/* ===== Таблица ===== */}
      <section className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        {view.status === 'loading' && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <div className="inline-block w-8 h-8 border-4 border-blue-200 dark:border-blue-900/40 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mb-3" />
            <p>Загрузка…</p>
          </div>
        )}

        {view.status === 'error' && (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-3">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-red-700 dark:text-red-300 font-medium mb-1">Ошибка загрузки</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{view.message}</p>
          </div>
        )}

        {view.status === 'success' && view.data.logs.length === 0 && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <ClipboardDocumentListIcon className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Записей не найдено{action || userId ? ' по заданным фильтрам' : ''}</p>
          </div>
        )}

        {view.status === 'success' && view.data.logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  <th className="px-3 py-3 w-16">ID</th>
                  <th className="px-3 py-3 whitespace-nowrap">Когда</th>
                  <th className="px-3 py-3">Действие</th>
                  <th className="px-3 py-3">Пользователь</th>
                  <th className="px-3 py-3 whitespace-nowrap">IP</th>
                  <th className="px-3 py-3">Детали</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {view.data.logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50/70 dark:hover:bg-gray-900/30 transition-colors"
                  >
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {log.id}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                          ACTION_STYLES[log.action] ?? DEFAULT_ACTION_STYLE
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {log.user ? (
                        <div className="flex flex-col">
                          <span className="text-gray-800 dark:text-gray-200">{log.user.fullName}</span>
                          <span className="text-gray-500 dark:text-gray-500 font-mono">
                            #{log.user.id} · {log.user.email}
                          </span>
                        </div>
                      ) : log.userId !== null ? (
                        <span className="text-gray-500 dark:text-gray-400 font-mono">
                          #{log.userId}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {log.ip ?? '—'}
                    </td>
                    <td
                      className="px-3 py-2 text-xs font-mono text-gray-700 dark:text-gray-300 max-w-[320px] truncate"
                      title={log.details ?? ''}
                    >
                      {log.details ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== Пагинация ===== */}
        {view.status === 'success' && view.data.pagination.totalPages > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-900/30">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Всего: <span className="font-medium text-gray-800 dark:text-gray-200">{view.data.pagination.total}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Предыдущая страница"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-700 dark:text-gray-300 px-2">
                {page} <span className="text-gray-400 dark:text-gray-600">/</span> {view.data.pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= view.data.pagination.totalPages}
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

export default Logs;