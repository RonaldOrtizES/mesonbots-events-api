import { Router } from "express";
import { z } from "zod";
import { requireDualAuth } from "../../middleware/dual-auth";
import { requireAuth } from "../../middleware/auth";
import { ConversationStatus } from "../../types";
import { HttpError, ok } from "../../utils/responses";
import { mensajesRouter } from "../mensajes/mensajes.routes";
import {
  abrirOContinuarConversacion,
  cambiarEstadoConversacion,
  cerrarConversacionPorTelefono,
  devolverAlBot,
  listarConversaciones,
  obtenerConversacion,
  registrarMensaje,
  tomarControl
} from "./conversaciones.service";

const estados: [ConversationStatus, ...ConversationStatus[]] = ["open", "closed", "escalated", "archived"];

const listQuerySchema = z.object({
  estado: z.enum(estados).optional(),
  busqueda: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

const estadoBodySchema = z.object({
  estado: z.enum(estados)
});

const iniciarConversacionBodySchema = z.object({
  tenantId: z.string().uuid(),
  telefonoOrigen: z.string().trim().min(5).max(20),
  nombreCliente: z.string().trim().min(1).max(255).optional(),
  contenido: z.string().trim().min(1).max(4096).optional(),
  messageType: z.enum(["text", "image", "audio", "video", "document", "template"]).default("text"),
  metaMessageId: z.string().trim().min(1).max(255).optional()
});

const cerrarAutomaticoBodySchema = z.object({
  tenantId: z.string().uuid(),
  telefonoOrigen: z.string().trim().min(5).max(20),
  aiHandledFully: z.boolean().default(true)
});

function getTenantId(reqTenantId: string | undefined): string {
  if (!reqTenantId) {
    throw new HttpError(401, "Tenant id is required", "TENANT_REQUIRED");
  }

  return reqTenantId;
}

export const conversacionesRouter = Router();

conversacionesRouter.post("/iniciar", async (req, res, next) => {
  try {
    const body = iniciarConversacionBodySchema.parse(req.body);
    const conversation = await abrirOContinuarConversacion({
      tenantId: body.tenantId,
      customerPhone: body.telefonoOrigen,
      customerName: body.nombreCliente
    });

    const message = body.contenido
      ? await registrarMensaje({
        conversacionId: conversation.conversacionId,
        tenantId: body.tenantId,
        direction: "inbound",
        content: body.contenido,
        messageType: body.messageType,
        metaMessageId: body.metaMessageId
      })
      : null;

    ok(res, {
      tenantId: body.tenantId,
      telefonoOrigen: body.telefonoOrigen,
      conversacionId: conversation.conversacionId,
      esNueva: conversation.esNueva,
      messageId: message?.messageId ?? null
    }, 201);
  } catch (error) {
    next(error);
  }
});

conversacionesRouter.post("/cerrar-automatico", async (req, res, next) => {
  try {
    const body = cerrarAutomaticoBodySchema.parse(req.body);
    const result = await cerrarConversacionPorTelefono(body.tenantId, body.telefonoOrigen, {
      resolvedByHuman: false,
      aiHandledFully: body.aiHandledFully
    });

    ok(res, {
      tenantId: body.tenantId,
      telefonoOrigen: body.telefonoOrigen,
      conversacionId: result.conversacionId,
      cerrada: result.cerrada
    });
  } catch (error) {
    next(error);
  }
});

conversacionesRouter.get("/", requireDualAuth, async (req, res, next) => {
  try {
    const tenantId = getTenantId(req.auth?.tenantId);
    const filters = listQuerySchema.parse(req.query);
    const result = await listarConversaciones({
      tenantId,
      estado: filters.estado,
      busqueda: filters.busqueda,
      limit: filters.limit,
      offset: filters.offset
    });

    ok(res, result);
  } catch (error) {
    next(error);
  }
});

conversacionesRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const tenantId = getTenantId(req.auth?.tenantId);
    const conversation = await obtenerConversacion(req.params.id, tenantId);
    ok(res, conversation);
  } catch (error) {
    next(error);
  }
});

conversacionesRouter.use("/:id/mensajes", mensajesRouter);

conversacionesRouter.patch("/:id/estado", requireAuth, async (req, res, next) => {
  try {
    const tenantId = getTenantId(req.auth?.tenantId);
    const body = estadoBodySchema.parse(req.body);
    await cambiarEstadoConversacion(req.params.id, tenantId, body.estado);
    ok(res, { id: req.params.id, estado: body.estado });
  } catch (error) {
    next(error);
  }
});

conversacionesRouter.post("/:id/tomar-control", requireAuth, async (req, res, next) => {
  try {
    const tenantId = getTenantId(req.auth?.tenantId);
    await tomarControl(req.params.id, tenantId);
    ok(res, { id: req.params.id, resolvedByHuman: true, aiHandledFully: false });
  } catch (error) {
    next(error);
  }
});

conversacionesRouter.post("/:id/devolver-al-bot", requireAuth, async (req, res, next) => {
  try {
    const tenantId = getTenantId(req.auth?.tenantId);
    await devolverAlBot(req.params.id, tenantId);
    ok(res, { id: req.params.id, resolvedByHuman: false, aiHandledFully: true });
  } catch (error) {
    next(error);
  }
});
