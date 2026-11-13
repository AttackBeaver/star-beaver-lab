import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import authRoutes from './routes/authRoutes';
import { auditLog } from './middleware/auditLog';

const app = express();
const port = Number(process.env.PORT) || 5000;

// ===== Базовые middleware =====
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ===== Аудит: все мутации, кроме /api/auth/* =====
app.use(auditLog);

// ===== Статика uploads (используется в блоках 2–3) =====
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// ===== Маршруты =====
app.use('/api/auth', authRoutes);

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
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[unhandled]', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  }
);

app.listen(port, () => {
  console.log(`[backend] listening on http://0.0.0.0:${port}`);
});