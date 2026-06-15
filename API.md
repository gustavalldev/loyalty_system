API документация (backend)

Базовая информация
- Base URL: `http://localhost:3000`
- Формат: JSON
- Авторизация: Bearer JWT в заголовке `Authorization`

Health
- `GET /health`
  - Response: `{ ok: true }`

Auth
- `POST /auth/register/request-code`
  - Назначение: отправка email-кода для регистрации
  - Body: `{ target, phone }`
  - Response: `{ ok, cooldown_seconds }`
- `POST /auth/register`
  - Назначение: регистрация после подтверждения email-кода
  - Body: `{ target, full_name, phone, password, code, promo_code? }`
  - Response: `{ access_token, refresh_token, is_new_user }`
  - Примечание: при регистрации по промокоду приветственный бонус начисляется только новому пользователю; бонус владельцу промокода начисляется после подтверждения покупки в админке
- `POST /auth/login`
  - Назначение: прямой вход по email/телефону и паролю
  - Body: `{ target, password }`
  - Response: `{ access_token, refresh_token, is_new_user }`
- `POST /auth/request-password-reset`
  - Назначение: отправка email-кода для восстановления пароля
  - Body: `{ target }`
  - Response: `{ ok, cooldown_seconds }`
  - OTP отправляется через SMTP
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
- `GET /admin/referral-attributions`
  - Roles: `admin`
  - Query: `status` (`registered`, `paid`, `cancelled`, `lead_created`, `deal_created`)
  - Response: `{ items: [ { id, client_contact, status, amount_paid, paid_at, created_at, code, bonus_referrer, referrer_user_id, referrer_full_name, referrer_email, referrer_phone } ] }`
- `POST /admin/referral-attributions/:id/confirm-purchase`
  - Roles: `admin`
  - Назначение: подтверждает покупку реферала и начисляет бонус владельцу промокода
  - Response: `{ ok, transaction_id, amount }`
- `POST /admin/loyalty/adjustments`
  - Roles: `admin`
  - Body: `{ user_id, amount, reason }`
  - Response: `{ id }`

Legacy CRM
- CRM webhook больше не участвует в активной продуктовой логике начисления бонусов.
- Начисление бонуса новому пользователю происходит при регистрации по промокоду; бонус владельцу промокода начисляется только после подтверждения покупки через админку.
