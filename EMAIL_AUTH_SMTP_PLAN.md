# План: Email-Подтверждение И SMTP Для Авторизации

## Цель

Сделать email обязательным каналом подтверждения для критичных сценариев:

1. Регистрация: аккаунт создается только после ввода кода из письма.
2. Смена пароля в кабинете: пароль меняется только после кода из письма.
3. Восстановление пароля: новый пароль задается только после кода из письма.
4. Письма отправляются через SMTP на том же сервере `bonyssrv`.

## Статус На 2026-05-06

- Backend SMTP через локальный Postfix настроен.
- Sender установлен: `info@bonus-avantaje.ru`.
- Регистрация, восстановление пароля и смена пароля используют email-коды с отдельным `purpose`.
- Миграция `006_add_auth_code_purpose.sql` применена на сервере.
- Docker stack пересобран и запущен на `bonyssrv`.
- nginx route `/auth/register/request-code` добавлен.
- Проверен полный endpoint отправки регистрационного кода на локальный alias `admin+loyaltytest@bonus-avantaje.ru`.
- DKIM-подпись на письме подтверждена локальной доставкой.
- Осталось добавить DNS-записи и PTR/reverse DNS у хостера для нормальной внешней доставляемости.

## Текущая База

- Сервер: `bonyssrv`
- IP: `45.87.247.204`
- Домен: `bonus-avantaje.ru`
- Проект на сервере: `/home/admin/loyalty_system`
- Локальный проект: `/Users/kirill/Documents/workspace/project/bonyssistemvkr`
- Backend уже хранит OTP в таблице `auth_codes`.
- Смена и восстановление пароля уже используют email-код, но отправка сейчас завязана на UniSender.
- Регистрация сейчас создает пользователя сразу, без email-подтверждения.

## Решения

- Основной sender: `info@bonus-avantaje.ru`.
- SMTP hostname: `mail.bonus-avantaje.ru`.
- Backend отправляет письма через `nodemailer`.
- Для Docker backend подключается к SMTP на host-машине через `host.docker.internal`.
- В `auth_codes` добавить поле `purpose`, чтобы коды разных сценариев не смешивались.

## Этап 1. SMTP На Сервере

1. Установить и настроить Postfix на `bonyssrv`.
2. Ограничить relay только локальной машиной и Docker-сетью.
3. Настроить отправителя `info@bonus-avantaje.ru`.
4. Добавить DNS-записи:
   - `A mail.bonus-avantaje.ru -> 45.87.247.204`
   - `MX bonus-avantaje.ru -> mail.bonus-avantaje.ru`
   - `SPF` для `45.87.247.204`
   - `DKIM`
   - `DMARC`
5. Проверить reverse DNS/PTR у хостера: желательно `45.87.247.204 -> mail.bonus-avantaje.ru`.
6. Проверить, что outbound port `25` не заблокирован.

## Этап 2. Backend SMTP

1. Добавить зависимость `nodemailer`.
2. Заменить UniSender-отправку на SMTP-отправку.
3. Добавить переменные окружения:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_SECURE`
   - `SMTP_IGNORE_TLS`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `MAIL_FROM`
4. Оставить понятные ошибки при недоступности SMTP.
5. Обновить `docker-compose.yml`, `.env.example`, README.

## Этап 3. OTP Purpose

1. Добавить миграцию `006_add_auth_code_purpose.sql`.
2. Добавить поле `purpose` в `auth_codes`.
3. Использовать значения:
   - `registration`
   - `password_reset`
   - `password_change`
   - `login` для обратной совместимости.
4. Все выборки OTP делать по `target + channel + purpose`.

## Этап 4. Регистрация Через Email

1. Добавить endpoint `POST /auth/register/request-code`.
2. Endpoint проверяет email, телефон и отправляет код с `purpose=registration`.
3. Изменить `POST /auth/register`: он принимает `code` и создает пользователя только после валидного кода.
4. После успешной регистрации помечать OTP использованным.
5. Сохранить текущую логику:
   - создание loyalty account;
   - создание referral code;
   - начисление бонусов по промокоду;
   - выдача access/refresh token.

## Этап 5. Смена Пароля

1. `/auth/change-password/request` создает код с `purpose=password_change`.
2. `/auth/change-password/confirm` проверяет только код `purpose=password_change`.
3. Письмо: "Код подтверждения смены пароля".

## Этап 6. Восстановление Пароля

1. `/auth/request-password-reset` создает код с `purpose=password_reset`.
2. `/auth/reset-password` проверяет только код `purpose=password_reset`.
3. Письмо: "Код восстановления пароля".

## Этап 7. Frontend

1. Экран регистрации сделать двухшаговым:
   - шаг 1: данные пользователя и отправка кода;
   - шаг 2: ввод кода и создание аккаунта.
2. Экран восстановления пароля оставить двухшаговым, но уточнить сообщения.
3. Экран смены пароля оставить двухшаговым, но убедиться, что ошибки кода отображаются понятно.

## Этап 8. Проверка

1. Backend:
   - install/build/start;
   - миграции;
   - ручные API-проверки OTP.
2. Frontend:
   - build;
   - регистрация;
   - восстановление;
   - смена пароля.
3. Server:
   - `docker compose up --build -d`;
   - `docker compose logs backend`;
   - `/var/log/mail.log`;
   - тест доставки на Gmail/Yandex/Mail.ru.

## Нужные Уточнения

Не блокирует старт работ, но перед production SMTP нужно подтвердить:

1. Есть ли доступ к DNS домена `bonus-avantaje.ru`.
2. Можно ли поменять PTR/reverse DNS у хостера.
3. Sender подтвержден: `info@bonus-avantaje.ru`.
