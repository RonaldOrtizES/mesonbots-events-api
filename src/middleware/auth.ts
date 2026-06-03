import { NextFunction, Request, Response } from "express";
import { extractBearerToken, verifyJwtToken } from "../utils/jwt";
import { fail } from "../utils/responses";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.header("authorization"));

  if (!token) {
    fail(res, 401, "Missing Bearer token", "AUTH_MISSING");
    return;
  }

  try {
    const payload = verifyJwtToken(token);
    const tenantId = payload.tenantId ?? payload.tenant_id;
    const userId = payload.userId ?? payload.sub ?? payload.id;

    if (!tenantId) {
      fail(res, 401, "JWT does not include tenant id", "AUTH_INVALID_TENANT");
      return;
    }

    req.auth = {
      source: "jwt",
      tenantId,
      userId,
      role: payload.role
    };

    next();
  } catch (error) {
    console.warn("[AUTH] JWT invalido", error);
    fail(res, 401, "Invalid token", "AUTH_INVALID");
  }
}
