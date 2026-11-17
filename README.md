# Star Beaver Lab

Открытая независимая IT лаборатория.

**Версия:** 0.1.0 (в разработке) · **Разработчик:** Стариков А.В. ([@AttackBeaver](https://github.com/AttackBeaver))

> ⚠️ Проект в активной разработке. API и схема БД могут меняться без обратной совместимости до релиза v1.0.0.

## Что уже есть

- **Аутентификация:** регистрация по email + пароль, вход по email + пароль, JWT (7 дней).
- **Роли:** `USER` (по умолчанию), `MODERATOR`, `OWNER`. Повышение — через seed-скрипт или вручную.
- **Аудит-логи:** middleware `auditLog` пишет все мутации (`POST/PUT/PATCH/DELETE`), кроме `/api/auth/*`. Явное логирование `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `REGISTER`. Логи удалённых пользователей сохраняются (`userId → null`).
- **Frontend:** адаптивный Layout, темы `light`/`dark`/`system` (без вспышки при загрузке), страницы `Home`, `Login`, `Register`, `404`.
- **Backend:** Express 5 + Prisma 6 + PostgreSQL 16, health-эндпоинт, глобальный error-handler.
- **Docker:** dev-стек через `docker-compose.yml` (backend в контейнере, БД в контейнере, frontend через Vite на хосте).

## Технологический стек

**Frontend**

- React 19, TypeScript, Vite 6
- Tailwind CSS 3, React Router 7
- Axios, Heroicons, Headless UI

**Backend**

- Node.js 22, Express 5, TypeScript
- Prisma 6
- JWT, bcryptjs
- Multer, Dockerode, Archiver 7.x, better-sqlite3, pg

**База данных**

- PostgreSQL 16

**Инфраструктура (dev)**

- Docker + Docker Compose
- Windows 11 (WSL2) / Linux Mint

## Структура проекта

```txt
star-beaver-lab/
├── backend/
│   ├── src/
│   │   ├── controllers/      # бизнес-логика
│   │   ├── middleware/       # authenticate, allowRoles, auditLog
│   │   ├── routes/           # маршруты API
│   │   ├── utils/            # prisma (синглтон), logger (аудит)
│   │   └── index.ts          # точка входа
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed-owner.ts     # не в git (см. .gitignore)
│   ├── uploads/              # не в git
│   ├── Dockerfile.dev        # только для dev
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # Layout
│   │   ├── hooks/            # useAuth, useTheme
│   │   ├── pages/            # Home, Login, Register
│   │   ├── services/         # api.ts (axios)
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── index.html            # + anti-flash скрипт темы
│   ├── tailwind.config.js
│   ├── vite.config.ts        # proxy /api → :5000
│   └── package.json
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Безопасность

- **JWT:** payload `{ id }`, роль/email/fullName подтягиваются из БД на каждом запросе. Удаление пользователя или смена роли применяются **мгновенно**, а не через 7 дней (срок жизни токена).
- **Пароли:** `bcryptjs`, 10 раундов.
- **Anti-enumeration:** при логине возвращается `Invalid credentials` и при неверном email, и при неверном пароле.
- **CORS:** `cors()` без ограничений origin — допустимо в dev (Vite proxy), в проде будет ограничено конкретным доменом (блок 9).
- **JWT_SECRET:** fail-fast при старте, если не задан. Сервер не запустится с пустым секретом.

## Разработка и контрибьютинг

Проект разрабатывается одним разработчиком в свободное время. Issues и pull requests приветствуются после релиза v1.0.0.

## Лицензия

[MIT](LICENSE)

## Контакты

- GitHub: [@AttackBeaver](https://github.com/AttackBeaver)
- Проект: [github.com/AttackBeaver/star-beaver-lab](https://github.com/AttackBeaver/star-beaver-lab)

© 2026 Star Beaver Lab · Разработчик: Стариков А.В.
