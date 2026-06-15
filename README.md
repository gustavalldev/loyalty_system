# Loyalty System (SPA + API)

Личный кабинет системы лояльности для туристического агентства:
- frontend: React + Vite
- backend: Node.js + Express
- БД: PostgreSQL

Функции текущей версии:
- регистрация и вход по email/телефону и паролю;
- профиль пользователя;
- бонусный счет и история операций;
- реферальный код и регистрации по промокоду;
- админ-страница пользователей + ручные корректировки баланса;
- админ-управление промокодами.

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
  - `SMTP_HOST=localhost`
  - `SMTP_PORT=25`
  - `MAIL_FROM=Avantaje Bonus <info@bonus-avantaje.ru>`
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
- Для email-OTP используется SMTP. В локальной разработке без SMTP можно включить `OTP_ECHO=true`.

## 7) Промокоды и бонусы

- у каждого пользователя есть собственный промокод;
- новый пользователь может ввести промокод при регистрации;
- при успешной регистрации приветственный бонус начисляется новому пользователю;
- бонус владельцу кода начисляется после подтверждения покупки реферала в админке;
- параметры промокода редактируются в админке.

## 8) Скрипты

Backend:
- `npm run dev` — запуск API в watch-режиме
- `npm start` — запуск API
- `npm run release-hold` — обработка истекших hold-транзакций

Frontend:
- `npm run dev` — dev server
- `npm run build` — production build
- `npm run preview` — предпросмотр сборки

## Docker

Проект можно поднять целиком через Docker Compose:

```bash
docker compose up --build
```

Что поднимется:
- `db` — PostgreSQL 16 на `localhost:5432`
- `backend` — API на `http://localhost:3000`
- `frontend` — SPA на `http://localhost:8080`

Особенности:
- backend на старте сам прогоняет SQL-миграции;
- frontend собирается с `VITE_API_URL=http://localhost:3000` по умолчанию;
- данные Postgres сохраняются в volume `postgres_data`.

Для сервера лучше создать корневой `.env` рядом с `docker-compose.yml`, например:

```bash
POSTGRES_DB=loyalty_system
POSTGRES_USER=loyalty
POSTGRES_PASSWORD=change_me_db
DB_PORT=5432
BACKEND_PORT=3000
FRONTEND_PORT=80
JWT_SECRET=change_me_jwt
OTP_SECRET=change_me_otp
OTP_LOG=false
SMTP_HOST=host.docker.internal
SMTP_PORT=25
SMTP_SECURE=false
SMTP_IGNORE_TLS=true
MAIL_FROM=Avantaje Bonus <info@bonus-avantaje.ru>
CORS_ORIGINS=http://bonus-avantaje.ru
FRONTEND_VITE_API_URL=http://bonus-avantaje.ru:3000
```

После этого:

```bash
docker compose up --build -d
```

Email-коды отправляются через SMTP. На сервере `bonyssrv` ожидается локальный SMTP/Postfix,
доступный backend-контейнеру как `host.docker.internal:25`.

Для production-доставки писем нужны DNS-записи для `bonus-avantaje.ru`:

- `A mail.bonus-avantaje.ru -> 45.87.247.204`
- `MX bonus-avantaje.ru -> mail.bonus-avantaje.ru`
- `SPF`, `DKIM`, `DMARC`
- reverse DNS/PTR на `mail.bonus-avantaje.ru`

Тест запуска:

```bash
docker compose up --build -d
docker compose logs -f backend
```
