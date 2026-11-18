import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import memeRoutes from './routes/memeRoutes';
import { auditLog } from './middleware/auditLog';

const app = express();
const port = Number(process.env.PORT) || 5000;

// ===== Базовые middleware =====
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ===== Аудит: все мутации, кроме /api/auth/* =====
app.use(auditLog);

// ===== Статика uploads (мемы: /uploads/memes/YYYY/MM/<file>) =====
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// ===== Маршруты =====
app.use('/api/auth', authRoutes);
app.use('/api/memes', memeRoutes);
app.use('/api/admin', adminRoutes);

// ===== Health =====
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'star-beaver-lab-backend',
    version: '0.1.0',
    time: new Date().toISOString(),
  });
});

// ===== 404 для API (не отдаём HTML на несуществующие эндпоинты) =====
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ===== Глобальный error-handler =====
// Уважаем statusCode из ошибки (body-parser → 400, UploadError → 413/400),
// иначе 500. Внутренние сообщения (>=500) наружу не светим.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;

    const status =
      typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      typeof (err as { statusCode: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;

    if (status >= 500) {
      console.error('[unhandled]', err);
    }

    const message =
      typeof err === 'object' &&
      err !== null &&
      'message' in err &&
      typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : 'Internal server error';

    res.status(status).json({
      error: status >= 500 ? 'Internal server error' : message,
    });
  }
);

app.listen(port, () => {
  console.log(`[backend] listening on http://0.0.0.0:${port}`);
});