import { Router } from 'express';
import { listLogs } from '../controllers/adminController';
import { listTrash, restoreMeme, exportZip } from '../controllers/memeController';
import { authenticate } from '../middleware/auth';
import { allowRoles } from '../middleware/roleCheck';

// ============================================================
// Роуты /api/admin/*
// Блок 1: аудит-логи (только OWNER).
// Блок 2: корзина мемов, restore, export.zip (MODERATOR/OWNER).
//
// ВАЖНО: /memes/export.zip объявлен ДО /memes/:id/restore —
// Express матчит по порядку, иначе "export.zip" уйдёт в :id.
// (На самом деле :id/restore — POST, а export.zip — GET,
//  метод разный, но порядок всё равно держим читаемым.)
// ============================================================

const router = Router();

// ===== Блок 1: логи (OWNER) =====
router.get('/logs', authenticate, allowRoles('OWNER'), listLogs);

// ===== Блок 2: мемы (MODERATOR/OWNER) =====
router.get('/memes/trash', authenticate, allowRoles('MODERATOR', 'OWNER'), listTrash);
router.post('/memes/:id/restore', authenticate, allowRoles('MODERATOR', 'OWNER'), restoreMeme);
router.get('/memes/export.zip', authenticate, allowRoles('MODERATOR', 'OWNER'), exportZip);

export default router;