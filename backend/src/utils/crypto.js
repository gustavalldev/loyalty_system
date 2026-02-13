import crypto from "crypto";

export function hashOtp(code) {
  const secret = process.env.OTP_SECRET || "dev_secret";
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

export function generateOtpCode() {
  const num = crypto.randomInt(0, 1000000);
  return String(num).padStart(6, "0");
}

export function generateCode(length = 10) {
  const bytes = crypto.randomBytes(Math.ceil(length / 2));
  return bytes.toString("hex").slice(0, length).toUpperCase();
}
