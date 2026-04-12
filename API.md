API документация (backend)

Базовая информация
- Base URL: `http://localhost:3000`
- Формат: JSON
- Авторизация: Bearer JWT в заголовке `Authorization`

Health
- `GET /health`
  - Response: `{ ok: true }`

Auth
- `POST /auth/register`
  - Назначение: прямая регистрация без OTP
  - Body: `{ target, full_name, phone, password, promo_code? }`
  - Response: `{ access_token, refresh_token, is_new_user }`
- `POST /auth/login`
  - Назначение: прямой вход по email/телефону и паролю
  - Body: `{ target, password }`
  - Response: `{ access_token, refresh_token, is_new_user }`
- `POST /auth/request-password-reset`
  - Назначение: отправка OTP для восстановления пароля
  - Body: `{ target, channel }`
  - Response: `{ ok, cooldown_seconds }`
  - Для `channel=email` OTP отправляется через UniSender
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
  - Response: `{ items: [ { crm_deal_id, client_contact, status, amount_paid, paid_at, created_at } ] }`
  - Примечание: в текущей логике основным событием является регистрация по промокоду; `client_contact` используется как основной идентификатор приглашённого пользователя

Admin (RBAC)
- `GET /admin/users`
  - Roles: `admin`
  - Query: `q` (поиск по `email`)
  - Response: `{ items: [ { id, full_name, email, phone, role, status, balance, currency } ] }`
- `GET /admin/referral-codes`
  - Roles: `admin`
  - Query: `q` (поиск по `code`, `email`, `full_name`)
  - Response: `{ items: [ { id, user_id, code, status, bonus_new_user, bonus_referrer, max_uses, uses_count, created_at, full_name, email, phone } ] }`
- `PATCH /admin/referral-codes/:id`
  - Roles: `admin`
  - Body: `{ code?, status?, bonus_new_user?, bonus_referrer?, max_uses? }`
  - Response: `{ id, user_id, code, status, bonus_new_user, bonus_referrer, max_uses, uses_count, created_at }`
- `POST /admin/loyalty/adjustments`
  - Roles: `admin`
  - Body: `{ user_id, amount, reason }`
  - Response: `{ id }`

Legacy CRM
- CRM webhook больше не участвует в активной продуктовой логике начисления бонусов.
- Начисление бонусов по промокоду происходит напрямую при регистрации пользователя через `POST /auth/register`.
