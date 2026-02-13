# Loyalty System (SPA + API)

Личный кабинет системы лояльности для туристического агентства:
- frontend: React + Vite
- backend: Node.js + Express
- БД: PostgreSQL

Функции текущей версии:
- регистрация/вход по OTP + пароль;
- профиль пользователя;
- бонусный счет и история операций;
- реферальный код и атрибуции;
- админ-страница пользователей + ручные корректировки баланса;
- webhook для событий CRM (`/webhooks/crm/deal-status`).

## Структура репозитория

- `frontend/` — клиентское SPA
- `backend/` — API и бизнес-логика
- `backend/migrations/` — SQL-миграции
- `API.md` — актуальная документация API
- `db.md` — схема БД

## Требования

- Node.js 20+
- npm 10+
- PostgreSQL 14+

## 1) Клонирование и установка зависимостей

```bash
git clone <your-repo-url>
cd bonyssistemvkr

cd backend && npm install
cd ../frontend && npm install
cd ..
```

## 2) Настройка переменных окружения

Backend:
```bash
cp backend/.env.example backend/.env
```

Frontend:
```bash
cp frontend/.env.example frontend/.env
```

Проверьте значения:
- `backend/.env`
  - `PORT=3000`
  - `DATABASE_URL=postgres://<user>:<password>@localhost:5432/loyalty_system`
  - `JWT_SECRET=<secret>`
  - `OTP_SECRET=<secret>`
- `frontend/.env`
  - `VITE_API_URL=http://localhost:3000`

## 3) Подготовка базы данных

Создайте БД, затем примените миграции:

```bash
createdb loyalty_system
psql -d loyalty_system -f backend/migrations/001_init.sql
psql -d loyalty_system -f backend/migrations/002_add_password.sql
psql -d loyalty_system -f backend/migrations/003_add_content_image.sql
```

## 4) Запуск backend

```bash
cd backend
npm run dev
```

Ожидаемый лог:
```text
API listening on :3000
```

Проверка:
```bash
curl http://localhost:3000/health
```

## 5) Запуск frontend

В новом терминале:

```bash
cd frontend
npm run dev
```

Откройте URL, который покажет Vite (обычно `http://localhost:5173`).

## 6) Полезно для локальной разработки

- Для отладки OTP можно временно включить в `backend/.env`:
  - `OTP_ECHO=true` (код вернется в ответе API)
  - `OTP_LOG=true` (код пишется в консоль backend)
- После изменения `.env` перезапустите соответствующий процесс.

## 7) Webhook из CRM

Локально удобно использовать `ngrok`:

```bash
ngrok http 3000
```

В CRM укажите:
`https://<ngrok-domain>/webhooks/crm/deal-status`

Примечание: в текущем коде endpoint принимает и логирует payload вебхука, а правила начислений работают для формата, описанного в `API.md`.

## 8) Скрипты

Backend:
- `npm run dev` — запуск API в watch-режиме
- `npm start` — запуск API
- `npm run release-hold` — обработка истекших hold-транзакций

Frontend:
- `npm run dev` — dev server
- `npm run build` — production build
- `npm run preview` — предпросмотр сборки

