import axios, { type AxiosProgressEvent } from 'axios';
import api from './api';

// ============================================================
// API-клиент для мемов (блок 2).
// Чистые async-функции, без React-хуков — состояние живёт в страницах
// (Memes.tsx, admin/Memes.tsx), как в Logs.tsx блока 1.
// ============================================================

// ===== Типы (зеркалят memeController.ts) =====
export interface MemeAuthor {
  id: number;
  fullName: string;
  username: string | null;
}

export type MediaType = 'IMAGE' | 'VIDEO';

export interface Meme {
  id: number;
  title: string | null;
  description: string | null;
  fileUrl: string;
  posterUrl: string | null;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  createdAt: string;
  author: MemeAuthor;
  likeCount: number;
  likedByMe: boolean;
}

export interface TrashMeme extends Meme {
  deletedAt: string;
  deletedBy: { id: number; fullName: string } | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MemesListResponse {
  memes: Meme[];
  pagination: Pagination;
}

export interface TrashListResponse {
  memes: TrashMeme[];
  pagination: Pagination;
}

export interface TopAuthorEntry {
  user: MemeAuthor;
  count: number;
}

export interface TopAuthorsResponse {
  authors: TopAuthorEntry[];
}

export interface LikeToggleResponse {
  liked: boolean;
  likeCount: number;
}

export interface UploadMemeInput {
  file: File;
  title?: string;
  description?: string;
}

// ===== Лимиты (зеркалят backend/src/utils/upload.ts) =====
// Дублируются для клиентской превентивной валидации (dropzone maxSize,
// accept). Сервер всегда перепроверяет — это UX-подсказка, не защита.
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
export const MAX_UPLOAD_SIZE = MAX_VIDEO_SIZE;

export const ACCEPTED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
] as const;

export const ACCEPT_STRING =
  'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm';

export const LIMIT_OPTIONS = [10, 25, 50] as const;
export type LimitOption = (typeof LIMIT_OPTIONS)[number];
export const DEFAULT_LIMIT: LimitOption = 25;

// ===== Утилиты =====

// Текст ошибки из axios. Приоритет — { error: string } из тела ответа
// (наш бэкенд), иначе err.message, иначе generic.
export function extractApiError(err: unknown): string {
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

// Человекочитаемый размер: "637 B", "12.3 KB", "5.1 MB".
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ===== API =====

export async function fetchMemes(
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<MemesListResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const res = await api.get<MemesListResponse>(`/memes?${params.toString()}`, { signal });
  return res.data;
}

export async function fetchTopAuthors(
  signal?: AbortSignal
): Promise<TopAuthorsResponse> {
  const res = await api.get<TopAuthorsResponse>('/memes/top-authors', { signal });
  return res.data;
}

export async function uploadMeme(
  input: UploadMemeInput,
  onUploadProgress?: (pct: number) => void
): Promise<Meme> {
  const form = new FormData();
  form.append('file', input.file);
  if (input.title && input.title.trim().length > 0) {
    form.append('title', input.title.trim());
  }
  if (input.description && input.description.trim().length > 0) {
    form.append('description', input.description.trim());
  }

  // Content-Type НЕ ставим вручную — axios с FormData сам подставит
  // multipart/form-data с boundary.
  const res = await api.post<Meme>('/memes', form, {
    onUploadProgress: (e: AxiosProgressEvent) => {
      if (!onUploadProgress) return;
      if (typeof e.total === 'number' && e.total > 0) {
        onUploadProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    },
  });
  return res.data;
}

export async function toggleLike(id: number): Promise<LikeToggleResponse> {
  const res = await api.post<LikeToggleResponse>(`/memes/${id}/like`);
  return res.data;
}

export async function deleteMeme(id: number): Promise<void> {
  await api.delete(`/memes/${id}`);
}

export async function fetchTrash(
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<TrashListResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const res = await api.get<TrashListResponse>(
    `/admin/memes/trash?${params.toString()}`,
    { signal }
  );
  return res.data;
}

export async function restoreMeme(id: number): Promise<void> {
  await api.post(`/admin/memes/${id}/restore`);
}

export async function downloadExportZip(): Promise<Blob> {
  const res = await api.get<Blob>('/admin/memes/export.zip', {
    responseType: 'blob',
  });
  return res.data;
}