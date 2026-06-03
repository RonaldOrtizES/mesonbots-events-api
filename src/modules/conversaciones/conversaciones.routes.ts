import { Router } from "express";
import { z } from "zod";
import { requireDualAuth } from "../../middleware/dual-auth";
import { requireAuth } from "../../middleware/auth";
import { ConversationStatus } from "../../types";
import { HttpError, ok } from "../../utils/responses";
import { mensajesRouter } from "../mensajes/mensajes.routes";
import {
  cambiarEstadoConversacion,
  devolverAlBot,
  listarConversaciones,
  obtenerConversacion,
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

function getTenantId(reqTenantId: string | undefined): string {
  if (!reqTenantId) {
    throw new HttpError(401, "Tenant id is required", "TENANT_REQUIRED");
  }

  return reqTenantId;
}

export const conversacionesRouter = Router();

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
