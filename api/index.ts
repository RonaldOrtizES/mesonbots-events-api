import express, { Express } from "express";

function createFallbackApp(error: unknown): Express {
  const app = express();

  app.all("*", (_req, res) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error("[BOOT] Server failed to start", error);

    res.status(503).json({
      ok: false,
      error: {
        message: "Server failed to start",
        details: message,
        hint: "Revisa en Vercel → Settings → Environment Variables que existan DATABASE_URL y JWT_SECRET."
      }
    });
  });

  return app;
}

let app: Express;

try {
  ({ app } = require("../src/app") as { app: Express });
} catch (error) {
  app = createFallbackApp(error);
}

export default app;
