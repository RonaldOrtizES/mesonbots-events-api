import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { extractBearerToken, extractServiceToken, verifyJwtToken } from "../utils/jwt";
import { fail } from "../utils/responses";

export function requireDualAuth(req: Request, res: Response, next: NextFunction): void {
  const serviceToken = extractServiceToken(req.header("authorization"));

  if (serviceToken) {
    if (serviceToken !== env.SERVICE_TOKEN) {
      fail(res, 401, "Invalid service token", "SERVICE_AUTH_INVALID");
      return;
    }

    req.auth = {
      source: "service",
      tenantId: req.header("x-tenant-id") ?? undefined
    };
    next();
    return;
  }

  const jwtToken = extractBearerToken(req.header("authorization"));

  if (!jwtToken) {
    fail(res, 401, "Missing authorization token", "AUTH_MISSING");
    return;
  }

  try {
    const payload = verifyJwtToken(jwtToken);
    const tenantId = payload.tenantId ?? payload.tenant_id;

    if (!tenantId) {
      fail(res, 401, "JWT does not include tenant id", "AUTH_INVALID_TENANT");
      return;
    }

    req.auth = {
      source: "jwt",
      tenantId,
      userId: payload.userId ?? payload.sub ?? payload.id,
      role: payload.role
    };
    next();
  } catch (error) {
    console.warn("[AUTH] JWT invalido en dual-auth", error);
    fail(res, 401, "Invalid token", "AUTH_INVALID");
  }
}
