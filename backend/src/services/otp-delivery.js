import nodemailer from "nodemailer";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const PURPOSE_LABELS = {
  registration: {
    subject: "Код регистрации",
    intro: "Ваш код для завершения регистрации:"
  },
  password_reset: {
    subject: "Код восстановления пароля",
    intro: "Ваш код для восстановления пароля:"
  },
  password_change: {
    subject: "Код подтверждения смены пароля",
    intro: "Ваш код для подтверждения смены пароля:"
  },
  login: {
    subject: "Код подтверждения",
    intro: "Ваш код подтверждения:"
  }
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || "";
  const port = Number(process.env.SMTP_PORT || 25);
  const secure = process.env.SMTP_SECURE === "true";
  const ignoreTLS = process.env.SMTP_IGNORE_TLS === "true";
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.MAIL_FROM || "Avantaje Bonus <info@bonus-avantaje.ru>";

  if (!host || !from) {
    return null;
  }

  return {
    host,
    port,
    secure,
    ignoreTLS,
    auth: user && pass ? { user, pass } : undefined,
    from
  };
}

function buildOtpEmail({ code, ttlSeconds, purpose }) {
  const minutes = Math.max(1, Math.ceil(Number(ttlSeconds || 0) / 60));
  const labels = PURPOSE_LABELS[purpose] || PURPOSE_LABELS.login;
  const subject = process.env.OTP_EMAIL_SUBJECT || labels.subject;
  const body = process.env.OTP_EMAIL_BODY_HTML || `
    <div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111827">
      <p>${escapeHtml(labels.intro)}</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${escapeHtml(code)}</p>
      <p>Код действует ${minutes} мин.</p>
      <p>Если вы не запрашивали этот код, просто проигнорируйте письмо.</p>
    </div>
  `;

  return { subject, body };
}

async function sendViaSmtp({ to, code, ttlSeconds, purpose }) {
  const config = getSmtpConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("smtp_not_configured");
    }
    console.warn("[OTP][email] SMTP is not configured, skipping external email send");
    return { skipped: true };
  }

  const { subject, body } = buildOtpEmail({ code, ttlSeconds, purpose });
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ignoreTLS: config.ignoreTLS,
    auth: config.auth
  });

  const info = await transporter.sendMail({
    from: config.from,
    to,
    subject,
    html: body,
    text: `${subject}\n\nКод: ${code}\nКод действует ${Math.max(1, Math.ceil(Number(ttlSeconds || 0) / 60))} мин.`
  });

  return { ok: true, provider: "smtp", messageId: info.messageId };
}

export async function sendOtpMessage({ target, channel, code, ttlSeconds, purpose }) {
  if (channel === "email") {
    return sendViaSmtp({ to: target, code, ttlSeconds, purpose });
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(`[OTP] unsupported delivery channel "${channel}", skipping send`);
    return { skipped: true };
  }

  throw new Error("unsupported_channel");
}
