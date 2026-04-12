-- =========================
-- Extensions
-- =========================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- ENUM types
-- =========================
CREATE TYPE user_role AS ENUM ('client', 'partner', 'admin', 'manager');
CREATE TYPE user_status AS ENUM ('active', 'blocked', 'deleted');
CREATE TYPE auth_channel AS ENUM ('sms', 'email', 'telegram');
CREATE TYPE account_status AS ENUM ('active', 'frozen');
CREATE TYPE tx_type AS ENUM ('accrual', 'redemption', 'adjustment', 'hold', 'release');
CREATE TYPE tx_status AS ENUM ('pending', 'confirmed', 'cancelled');
CREATE TYPE referral_status AS ENUM ('lead_created', 'deal_created', 'paid', 'cancelled', 'registered');
CREATE TYPE content_audience AS ENUM ('all', 'client', 'partner');
CREATE TYPE content_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE rule_status AS ENUM ('active', 'archived');
CREATE TYPE rule_version_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE rule_type AS ENUM ('percent', 'fixed', 'percent_cap', 'list', 'json');

-- =========================
-- USERS
-- =========================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(32) UNIQUE,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255),
    password_hash VARCHAR(255),
    role user_role NOT NULL DEFAULT 'client',
    status user_status NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- AUTH CODES (OTP)
-- =========================
CREATE TABLE auth_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target VARCHAR(255) NOT NULL,
    channel auth_channel NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts_left INTEGER NOT NULL DEFAULT 3,
    consumed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- LOYALTY ACCOUNTS
-- =========================
CREATE TABLE loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency VARCHAR(16) NOT NULL DEFAULT 'BONUS',
    status account_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- LOYALTY TRANSACTIONS
-- =========================
CREATE TABLE loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
    type tx_type NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    status tx_status NOT NULL DEFAULT 'pending',
    reason VARCHAR(64),
    meta JSONB,
    external_ref VARCHAR(255),
    currency VARCHAR(16) NOT NULL DEFAULT 'BONUS',
    hold_until TIMESTAMP,
    rule_version_id UUID,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMP
);

CREATE UNIQUE INDEX uniq_loyalty_external_ref
ON loyalty_transactions (external_ref)
WHERE external_ref IS NOT NULL;

CREATE INDEX idx_loyalty_transactions_hold_until
ON loyalty_transactions (hold_until)
WHERE hold_until IS NOT NULL;

CREATE INDEX idx_loyalty_transactions_account_confirmed
ON loyalty_transactions (account_id, confirmed_at);

-- =========================
-- REFERRAL CODES
-- =========================
CREATE TABLE referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    bonus_new_user NUMERIC(14,2) NOT NULL DEFAULT 100,
    bonus_referrer NUMERIC(14,2) NOT NULL DEFAULT 100,
    max_uses INTEGER,
    uses_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- SOURCES (SITES / CHANNELS) [legacy CRM]
-- =========================
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- REFERRAL ATTRIBUTIONS
-- В активной логике используются для регистраций по промокоду.
-- CRM-поля сохранены как legacy-совместимость для старых данных.
-- =========================
CREATE TABLE referral_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
    source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
    crm_lead_id VARCHAR(64),
    crm_deal_id VARCHAR(64),
    client_contact VARCHAR(255),
    status referral_status NOT NULL DEFAULT 'lead_created',
    amount_paid NUMERIC(14,2),
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- CRM EVENTS (WEBHOOK LOG) [legacy]
-- =========================
CREATE TABLE crm_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL,
    crm_entity_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT now(),
    processed_at TIMESTAMP,
    process_status VARCHAR(16) NOT NULL DEFAULT 'ok',
    idempotency_key VARCHAR(255) UNIQUE
);

-- =========================
-- CONTENT BLOCKS
-- =========================
CREATE TABLE content_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audience content_audience NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    status content_status NOT NULL DEFAULT 'draft',
    sort_order INTEGER NOT NULL DEFAULT 0,
    published_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- CONTENT VIEWS (OPTIONAL)
-- =========================
CREATE TABLE content_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_block_id UUID NOT NULL REFERENCES content_blocks(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (user_id, content_block_id)
);

-- =========================
-- AUDIT LOG (OPTIONAL)
-- =========================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    entity VARCHAR(64),
    entity_id VARCHAR(64),
    details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- RULES (CONFIG)
-- =========================
CREATE TABLE rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    status rule_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE rule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    status rule_version_status NOT NULL DEFAULT 'draft',
    type rule_type NOT NULL,
    params JSONB NOT NULL,
    valid_from TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_rule_version
ON rule_versions (rule_id, version);

CREATE INDEX idx_rule_versions_active
ON rule_versions (rule_id, status);
