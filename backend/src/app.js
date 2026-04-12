import express from "express";
import cors from "cors";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import loyaltyRoutes from "./routes/loyalty.js";
import referralRoutes from "./routes/referrals.js";
import adminRoutes from "./routes/admin.js";

const app = express();

const localOriginPatterns = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/
];
const envOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (envOrigins.includes(origin) || localOriginPatterns.some((pattern) => pattern.test(origin))) {
      return callback(null, true);
    }
    return callback(new Error("cors_not_allowed"));
  },
  credentials: true
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/me", meRoutes);
app.use("/loyalty", loyaltyRoutes);
app.use("/referrals", referralRoutes);
app.use("/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

export default app;
