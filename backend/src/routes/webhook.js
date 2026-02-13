import { Router } from "express";
import pool from "../db.js";
import { getActiveRuleByCode } from "../services/rules.js";
import { getAccountIdByUserId, getOrCreateUserByTarget } from "../services/users.js";

const router = Router();
const PARTNER_CASHBACK_PERCENT = 3;
const FIRST_PURCHASE_REFERRAL_FIXED = 300;

function normalizeMoney(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function calcBonus(type, params, paidAmount) {
  if (type === "fixed") {
    return normalizeMoney(params.fixed_amount);
  }
  if (type === "percent") {
    return Math.round((paidAmount * Number(params.percent || 0)) / 100 * 100) / 100;
  }
  if (type === "percent_cap") {
    const raw = Math.round((paidAmount * Number(params.percent || 0)) / 100 * 100) / 100;
    const cap = normalizeMoney(params.cap_per_order);
    return Math.min(raw, cap);
  }
  return 0;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function buildInvitedIdentity({ clientUserId, phone, email, leadId }) {
  if (clientUserId) {
    return `user:${clientUserId}`;
  }
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    return `email:${normalizedEmail}`;
  }
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    return `phone:${normalizedPhone}`;
  }
  if (leadId) {
    return `lead:${String(leadId)}`;
  }
  return null;
}

function collectFieldPaths(value, prefix = "") {
  if (Array.isArray(value)) {
    if (!value.length) {
      return [prefix];
    }
    return value.flatMap((item, index) => collectFieldPaths(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) {
      return [prefix];
    }
    return entries.flatMap(([key, nested]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      return collectFieldPaths(nested, nextPrefix);
    });
  }
  return [prefix || "(root)"];
}

router.post("/crm/deal-status", async (req, res) => {
  const payload = req.body || {};
  const payloadFieldPaths = collectFieldPaths(payload).filter(Boolean);
  console.log("[WEBHOOK][crm/deal-status] incoming", JSON.stringify({
    headers: {
      "content-type": req.headers["content-type"] || null,
      "user-agent": req.headers["user-agent"] || null,
      "x-forwarded-for": req.headers["x-forwarded-for"] || null
    },
    body: payload,
    body_field_paths: payloadFieldPaths
  }));
  const dealId = payload.deal_id || payload.dealId || payload.ID;
  const leadId = payload.lead_id || payload.leadId || null;
  const status = payload.status || payload.stage || payload.stage_id;
  const amount = normalizeMoney(payload.amount || payload.sum || payload.price);
  const currency = payload.currency || "RUB";
  const phone = payload.phone || null;
  const email = payload.email || null;
  const sourceCode = payload.source || payload.utm_source || null;
  const paidAt = payload.paid_at || payload.date_paid || null;
  const promoCode = payload.promo_code || payload.promoCode || null;
  const idempotencyKey =
    payload.idempotency_key || `b24:deal:${dealId}:${status || "unknown"}`;

  if (!dealId || !status) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const paidRule = await getActiveRuleByCode("crm_paid_statuses");
  const paidStatuses = paidRule?.params?.statuses || [];
  if (!paidStatuses.includes(status)) {
    return res.json({ ok: true, ignored: true });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertEvent = await client.query(
      `INSERT INTO crm_events (event_type, crm_entity_id, payload, idempotency_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      ["deal_status", String(dealId), payload, idempotencyKey]
    );

    if (!insertEvent.rows.length) {
      await client.query("ROLLBACK");
      return res.json({ ok: true, duplicate: true });
    }

    let sourceId = null;
    if (sourceCode) {
      const sourceRes = await client.query(
        `SELECT id FROM sources WHERE code = $1 LIMIT 1`,
        [sourceCode]
      );
      if (sourceRes.rows.length) {
        sourceId = sourceRes.rows[0].id;
      } else {
        const created = await client.query(
          `INSERT INTO sources (code, name) VALUES ($1, $2) RETURNING id`,
          [sourceCode, sourceCode]
        );
        sourceId = created.rows[0].id;
      }
    }

    let clientUserId = null;
    let clientUserRole = null;
    if (phone || email) {
      const user = await getOrCreateUserByTarget(client, { phone, email });
      clientUserId = user?.id || null;
      clientUserRole = user?.role || null;
    }

    if (clientUserId) {
      const accountId = await getAccountIdByUserId(client, clientUserId);
      const bonusRule = await getActiveRuleByCode("bonus_accrual", client);
      if (accountId && bonusRule) {
        const params = bonusRule.params || {};
        const minPaid = normalizeMoney(params.min_paid);
        if (!minPaid || amount >= minPaid) {
          let bonus = calcBonus(bonusRule.type, params, amount);

          if (params.cap_per_month) {
            const capPerMonth = normalizeMoney(params.cap_per_month);
            const { rows: sumRows } = await client.query(
              `SELECT COALESCE(SUM(amount), 0) AS total
               FROM loyalty_transactions
               WHERE account_id = $1
                 AND type = 'accrual'
                 AND status = 'confirmed'
                 AND date_trunc('month', confirmed_at) = date_trunc('month', now())`,
              [accountId]
            );
            const used = Number(sumRows[0].total || 0);
            const remain = Math.max(0, capPerMonth - used);
            bonus = Math.min(bonus, remain);
          }

          if (bonus > 0) {
            const insertTx = await client.query(
              `INSERT INTO loyalty_transactions (account_id, type, amount, status, reason, external_ref, currency, rule_version_id, confirmed_at)
               VALUES ($1, 'accrual', $2, 'confirmed', 'cashback', $3, $4, $5, now())
               ON CONFLICT (external_ref) DO NOTHING
               RETURNING id`,
              [
                accountId,
                bonus,
                `b24:deal:${dealId}:bonus`,
                currency,
                bonusRule.rule_version_id
              ]
            );
            if (insertTx.rows.length) {
              await client.query(
                `UPDATE loyalty_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2`,
                [bonus, accountId]
              );
            }
          }
        }
      }

      if (accountId && clientUserRole === "partner") {
        const partnerCashback = Math.round((amount * PARTNER_CASHBACK_PERCENT) * 100) / 10000;
        if (partnerCashback > 0) {
          const insertPartnerTx = await client.query(
            `INSERT INTO loyalty_transactions (account_id, type, amount, status, reason, external_ref, currency, confirmed_at)
             VALUES ($1, 'accrual', $2, 'confirmed', 'partner_cashback', $3, $4, now())
             ON CONFLICT (external_ref) DO NOTHING
             RETURNING id`,
            [
              accountId,
              partnerCashback,
              `b24:deal:${dealId}:partner_bonus`,
              currency
            ]
          );
          if (insertPartnerTx.rows.length) {
            await client.query(
              `UPDATE loyalty_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2`,
              [partnerCashback, accountId]
            );
          }
        }
      }
    }

    if (promoCode) {
      const { rows: referralRows } = await client.query(
        `SELECT id, user_id FROM referral_codes WHERE code = $1 LIMIT 1`,
        [promoCode]
      );
      if (referralRows.length) {
        const referralCodeId = referralRows[0].id;
        const referrerUserId = referralRows[0].user_id;
        const invitedIdentity = buildInvitedIdentity({ clientUserId, phone, email, leadId });

        const existingAttr = await client.query(
          `SELECT id FROM referral_attributions WHERE crm_deal_id = $1 LIMIT 1`,
          [String(dealId)]
        );
        if (existingAttr.rows.length) {
          await client.query(
            `UPDATE referral_attributions
             SET status = 'paid',
                 amount_paid = $1,
                 paid_at = COALESCE($2, now()),
                 source_id = $3,
                 client_contact = COALESCE($4, client_contact),
                 updated_at = now()
             WHERE id = $5`,
            [amount, paidAt, sourceId, invitedIdentity, existingAttr.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO referral_attributions (referral_code_id, source_id, crm_lead_id, crm_deal_id, client_contact, status, amount_paid, paid_at)
             VALUES ($1, $2, $3, $4, $5, 'paid', $6, COALESCE($7, now()))`,
            [referralCodeId, sourceId, leadId, String(dealId), invitedIdentity, amount, paidAt]
          );
        }

        let isFirstPaidPurchase = false;
        if (invitedIdentity) {
          const previousPaid = await client.query(
            `SELECT id
             FROM referral_attributions
             WHERE referral_code_id = $1
               AND status = 'paid'
               AND client_contact = $2
               AND crm_deal_id <> $3
             LIMIT 1`,
            [referralCodeId, invitedIdentity, String(dealId)]
          );
          isFirstPaidPurchase = !previousPaid.rows.length;
        }

        const refAccountId = await getAccountIdByUserId(client, referrerUserId);
        if (refAccountId && isFirstPaidPurchase) {
          const reward = FIRST_PURCHASE_REFERRAL_FIXED;
          if (reward > 0) {
            const insertTx = await client.query(
              `INSERT INTO loyalty_transactions (account_id, type, amount, status, reason, external_ref, currency, confirmed_at)
               VALUES ($1, 'accrual', $2, 'confirmed', 'referral_first_purchase', $3, $4, now())
               ON CONFLICT (external_ref) DO NOTHING
               RETURNING id`,
              [
                refAccountId,
                reward,
                `b24:deal:${dealId}:referral`,
                currency
              ]
            );
            if (insertTx.rows.length) {
              await client.query(
                `UPDATE loyalty_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2`,
                [reward, refAccountId]
              );
            }
          }
        }
      }
    }

    await client.query(
      `UPDATE crm_events SET processed_at = now(), process_status = 'ok' WHERE id = $1`,
      [insertEvent.rows[0].id]
    );

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "internal_error" });
  } finally {
    client.release();
  }
});

export default router;
