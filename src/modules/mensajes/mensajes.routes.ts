import { Router } from "express";
import { z } from "zod";
import { requireDualAuth } from "../../middleware/dual-auth";
import { obtenerMensajes } from "../conversaciones/conversaciones.service";
import { ok } from "../../utils/responses";
import { registrarMensajeSaliente } from "./mensajes.service";

const enviarMensajeSchema = z.object({
  contenido: z.string().trim().min(1).max(4096),
  generatedByAi: z.boolean().optional()
});

function getTenantId(reqTenantId: string | undefined): string {
  if (!reqTenantId) {
    throw new Error("Tenant id is required");
  }

  return reqTenantId;
}

export const mensajesRouter = Router({ mergeParams: true });

mensajesRouter.get("/", requireDualAuth, async (req, res, next) => {
  try {
    const tenantId = getTenantId(req.auth?.tenantId);
    const conversationId = req.params.id;
    const messages = await obtenerMensajes(conversationId, tenantId);
    ok(res, messages);
  } catch (error) {
    next(error);
  }
});

mensajesRouter.post("/", requireDualAuth, async (req, res, next) => {
  try {
    const tenantId = getTenantId(req.auth?.tenantId);
    const conversationId = req.params.id;
    const body = enviarMensajeSchema.parse(req.body);
    const result = await registrarMensajeSaliente({
      tenantId,
      conversacionId: conversationId,
      contenido: body.contenido,
      generatedByAi: req.auth?.source === "service" ? body.generatedByAi ?? true : false
    });

    ok(res, result, 201);
  } catch (error) {
    next(error);
  }
});
