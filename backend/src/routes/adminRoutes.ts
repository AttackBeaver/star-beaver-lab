import { Router } from 'express';
import { listLogs } from '../controllers/adminController';
import { authenticate } from '../middleware/auth';
import { allowRoles } from '../middleware/roleCheck';

// ============================================================
// Роуты /api/admin/*
// Блок 1: только аудит-логи.
// Пользователи / мемы / новости / баги / задания — блок 7.
//
// Все роуты здесь — только OWNER.
// MODERATOR-доступ (мемы/новости) появится в блоке 7 отдельным роутером.
// ============================================================

const router = Router();

router.get('/logs', authenticate, allowRoles('OWNER'), listLogs);

export default router;