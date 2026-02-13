import jwt from "jsonwebtoken";

const accessTtl = "15m";
const refreshTtl = "7d";

export function signAccessToken(payload) {
  const secret = process.env.JWT_SECRET || "dev_secret";
  return jwt.sign(payload, secret, { expiresIn: accessTtl });
}

export function signRefreshToken(payload) {
  const secret = process.env.JWT_SECRET || "dev_secret";
  return jwt.sign(payload, secret, { expiresIn: refreshTtl });
}

export function verifyToken(token) {
  const secret = process.env.JWT_SECRET || "dev_secret";
  return jwt.verify(token, secret);
}
