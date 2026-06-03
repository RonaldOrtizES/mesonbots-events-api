import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env";
import { requireCronAuth } from "./middleware/cron-auth";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { conversacionesRouter } from "./modules/conversaciones/conversaciones.routes";
import { cerrarConversacionesInactivas } from "./modules/conversaciones/conversaciones.service";
import { webhooksRouter } from "./modules/webhooks/webhooks.routes";

export const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.CORS_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "mesonbots-events-api",
    timestamp: new Date().toISOString()
  });
});

app.use("/webhook", webhooksRouter);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api", apiLimiter);
app.use("/api/conversaciones", conversacionesRouter);
app.all("/api/cron/cerrar-conversaciones", requireCronAuth, async (_req, res, next) => {
  try {
    const result = await cerrarConversacionesInactivas();
    console.info("[CRON] Conversaciones cerradas", result);
    res.status(200).json({
      ok: true,
      cerradas: result.cerradas,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

app.use(notFoundHandler);
app.use(errorHandler);
