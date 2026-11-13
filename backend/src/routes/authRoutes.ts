import { Router } from 'express';
import {
  register,
  login,
  logout,
  getProfile,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

// POST /api/auth/register — публичный
router.post('/register', register);

// POST /api/auth/login — публичный
router.post('/login', login);

// POST /api/auth/logout — требует токен
router.post('/logout', authenticate, logout);

// GET /api/auth/profile — требует токен
router.get('/profile', authenticate, getProfile);

export default router;