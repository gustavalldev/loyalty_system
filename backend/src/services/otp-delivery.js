const UNISENDER_ENDPOINT = "https://api.unisender.com/ru/api/sendEmail?format=json";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getUniSenderConfig() {
  const apiKey = process.env.UNISENDER_API_KEY || "";
  const senderName = process.env.UNISENDER_SENDER_NAME || "";
  const senderEmail = process.env.UNISENDER_SENDER_EMAIL || "";
  const listId = process.env.UNISENDER_LIST_ID || "";

  if (!apiKey || !senderName || !senderEmail || !listId) {
    return null;
  }

  return { apiKey, senderName, senderEmail, listId };
}

function buildOtpEmail({ code, ttlSeconds }) {
  const minutes = Math.max(1, Math.ceil(Number(ttlSeconds || 0) / 60));
  const subject = process.env.OTP_EMAIL_SUBJECT || "Код подтверждения";
  const body = process.env.OTP_EMAIL_BODY_HTML || `
    <div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111827">
      <p>Ваш код подтверждения:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${escapeHtml(code)}</p>
      <p>Код действует ${minutes} мин.</p>
      <p>Если вы не запрашивали этот код, просто проигнорируйте письмо.</p>
    </div>
  `;

  return { subject, body };
}

async function sendViaUniSender({ to, code, ttlSeconds }) {
  const config = getUniSenderConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("unisender_not_configured");
    }
    console.warn("[OTP][email] UniSender is not configured, skipping external email send");
    return { skipped: true };
  }

  const { subject, body } = buildOtpEmail({ code, ttlSeconds });
  const payload = new URLSearchParams({
    api_key: config.apiKey,
    email: to,
    sender_name: config.senderName,
    sender_email: config.senderEmail,
    subject,
    body,
    list_id: String(config.listId)
  });

  const response = await fetch(UNISENDER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.code || data.error || "unisender_request_failed");
  }

  return { ok: true, provider: "unisender", response: data };
}

export async function sendOtpMessage({ target, channel, code, ttlSeconds }) {
  if (channel === "email") {
    return sendViaUniSender({ to: target, code, ttlSeconds });
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(`[OTP] unsupported delivery channel "${channel}", skipping send`);
    return { skipped: true };
  }

  throw new Error("unsupported_channel");
}
