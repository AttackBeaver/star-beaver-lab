import { Router } from 'express';
import {
  listMemes,
  uploadMeme,
  toggleLike,
  softDeleteMeme,
  topAuthors,
} from '../controllers/memeController';
import { authenticate } from '../middleware/auth';

// ============================================================
// Роуты /api/memes/*
// - GET  /              — публичная лента (живые, DESC по createdAt).
// - GET  /top-authors   — публичный топ-3 авторов (по живым мемам).
// - POST /              — загрузка (auth). Multer вызывается ВНУТРИ
//                          контроллера (runMemeUpload), не на уровне
//                          роута — нужно ловить UploadError и отдавать
//                          4xx, а не 500 из глобального error-handler.
// - POST /:id/like      — toggle лайка (auth).
// - DELETE /:id         — soft-delete (auth; автор ИЛИ MODERATOR/OWNER,
//                          проверка роли внутри контроллера, т.к. правило
//                          «автор своего мема» allowRoles не выражает).
//
// Trash/restore/export — /api/admin/memes/* (adminRoutes.ts), только
// MODERATOR/OWNER, там allowRoles на уровне роута.
//
// ВАЖНО: /top-authors объявлен ДО /:id/* — Express матчит по порядку,
// иначе "top-authors" уйдёт в :id и вернёт 400 от parseIdParam.
// ============================================================

const router = Router();

router.get('/', listMemes);
router.get('/top-authors', topAuthors);

router.post('/', authenticate, uploadMeme);
router.post('/:id/like', authenticate, toggleLike);
router.delete('/:id', authenticate, softDeleteMeme);

export default router;