import { Router } from 'express';
import {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';

// ============================================================
// Роуты /api/auth/*
// Блок 0: register / login / logout / profile.
// Блок 1: + PATCH profile / POST change-password.
//
// ВАЖНО: /api/auth/* исключён из middleware auditLog
// (см. middleware/auditLog.ts) — аудит здесь пишется вручную
// через logAction в контроллерах, чтобы не дублировать события.
// ============================================================

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate, logout);

router.get('/profile', authenticate, getProfile);
router.patch('/profile', authenticate, updateProfile);

router.post('/change-password', authenticate, changePassword);

export default router;