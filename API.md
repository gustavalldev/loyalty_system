API документация (backend)

Базовая информация
- Base URL: `http://localhost:3000`
- Формат: JSON (для webhook поддерживается также `application/x-www-form-urlencoded`)
- Авторизация: Bearer JWT в заголовке `Authorization`

Health
- `GET /health`
  - Response: `{ ok: true }`

Auth
- `POST /auth/register`
  - Назначение: отправка OTP для регистрации
  - Body: `{ target, channel, full_name, phone }`
  - Response: `{ ok, cooldown_seconds }`
- `POST /auth/login`
  - Назначение: отправка OTP для входа
  - Body: `{ target, password, channel? }`
  - Response: `{ ok, cooldown_seconds }`
- `POST /auth/verify-otp`
  - Назначение: проверка OTP и выдача токенов
  - Body: `{ target, code, purpose, password, full_name?, phone? }`
  - `purpose`: `register | login`
  - При `purpose=register` обязательны: `full_name`, `phone`, `password`
  - Response: `{ access_token, refresh_token, is_new_user }`
- `POST /auth/request-password-reset`
  - Назначение: отправка OTP для восстановления пароля
  - Body: `{ target, channel }`
  - Response: `{ ok, cooldown_seconds }`
- `POST /auth/reset-password`
  - Назначение: сброс пароля по OTP
  - Body: `{ target, code, new_password }`
  - Response: `{ ok }`
- `POST /auth/change-password/request`
  - Назначение: запрос OTP для смены пароля (авторизованный)
  - Body: `{ current_password }`
  - Response: `{ ok, cooldown_seconds }`
- `POST /auth/change-password/confirm`
  - Назначение: подтверждение смены пароля по OTP (авторизованный)
  - Body: `{ code, new_password, current_password }`
  - Response: `{ ok }`
- `POST /auth/refresh`
  - Назначение: обновление пары токенов
  - Body: `{ refresh_token }`
  - Response: `{ access_token, refresh_token }`

Profile
- `GET /me`
  - Auth: требуется
  - Response: `{ id, full_name, phone, email, role, status, last_login_at }`
- `PATCH /me`
  - Auth: требуется
  - Body: `{ full_name }`
  - Response: профиль
- `POST /me/complete-profile`
  - Auth: требуется
  - Body: `{ full_name }`
  - Response: профиль

Loyalty
- `GET /loyalty/account`
  - Auth: требуется
  - Response: `{ balance, currency, status }`
- `GET /loyalty/transactions`
  - Auth: требуется
  - Query: `period=from:to`, `type`, `status`
  - Response: `{ items: [ { amount, type, status, reason, external_ref, created_at } ] }`

Referrals
- `GET /referrals/code`
  - Auth: требуется
  - Response: `{ code, status }`
- `GET /referrals/attributions`
  - Auth: требуется
  - Query: `period=from:to`, `status`
  - Response: `{ items: [ { crm_deal_id, status, amount_paid, paid_at, created_at } ] }`

Admin (RBAC)
- `GET /admin/users`
  - Roles: `admin`
  - Query: `q` (поиск по `email`)
  - Response: `{ items: [ { id, full_name, email, phone, role, status, balance, currency } ] }`
- `POST /admin/loyalty/adjustments`
  - Roles: `admin`
  - Body: `{ user_id, amount, reason }`
  - Response: `{ id }`

Webhook
- `POST /webhooks/crm/deal-status`
  - Назначение: обработка оплаты сделки CRM и начисление бонусов
  - Поддерживаемый payload (собственный формат):  
    `{ deal_id, lead_id?, status, amount?, currency?, phone?, email?, source?, paid_at?, promo_code?, idempotency_key? }`
  - Также сейчас логируется входящий payload (в т.ч. формат Bitrix `ONCRMDEALUPDATE`)
  - Response:
    - `{ ok: true }` если событие обработано
    - `{ ok: true, ignored: true }` если статус не входит в активное правило `crm_paid_statuses`
    - `{ ok: true, duplicate: true }` если событие уже было обработано по `idempotency_key`
