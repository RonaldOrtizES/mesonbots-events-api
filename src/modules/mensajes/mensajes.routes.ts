import { Router } from "express";
import { z } from "zod";
import { obtenerMensajes } from "../conversaciones/conversaciones.service";
import { ok } from "../../utils/responses";
import { registrarMensajeSaliente } from "./mensajes.service";

const enviarMensajeSchema = z.object({
  tenantId: z.string().uuid(),
  contenido: z.string().trim().min(1).max(4096),
  generatedByAi: z.boolean().optional()
});

const mensajesQuerySchema = z.object({
  tenantId: z.string().uuid()
});

export const mensajesRouter = Router({ mergeParams: true });

function getConversationId(params: Record<string, string | undefined>): string {
  const conversationId = params.id;
  if (!conversationId) {
    throw new Error("Conversation id is required");
  }

  return conversationId;
}

mensajesRouter.get("/", async (req, res, next) => {
  try {
    const query = mensajesQuerySchema.parse(req.query);
    const conversationId = getConversationId(req.params);
    const messages = await obtenerMensajes(conversationId, query.tenantId);
    ok(res, messages);
  } catch (error) {
    next(error);
  }
});

mensajesRouter.post("/", async (req, res, next) => {
  try {
    const conversationId = getConversationId(req.params);
    const body = enviarMensajeSchema.parse(req.body);
    const result = await registrarMensajeSaliente({
      tenantId: body.tenantId,
      conversacionId: conversationId,
      contenido: body.contenido,
      generatedByAi: body.generatedByAi ?? false
    });

    ok(res, result, 201);
  } catch (error) {
    next(error);
  }
});
