import { Request, Response } from "express";
import { env } from "../../src/config/env";
import { cerrarConversacionesInactivas } from "../../src/modules/conversaciones/conversaciones.service";
import { extractBearerToken } from "../../src/utils/jwt";

export default async function handler(req: Request, res: Response): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, error: { message: "Method not allowed" } });
    return;
  }

  const token = extractBearerToken(req.header("authorization"));

  if (!token || token !== env.CRON_SECRET) {
    res.status(401).json({ ok: false, error: { message: "Invalid cron token" } });
    return;
  }

  try {
    const result = await cerrarConversacionesInactivas();
    console.info("[CRON] Conversaciones cerradas", result);
    res.status(200).json({
      ok: true,
      cerradas: result.cerradas,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[CRON] Error cerrando conversaciones", error);
    res.status(500).json({
      ok: false,
      error: {
        message: "Error closing inactive conversations"
      }
    });
  }
}
