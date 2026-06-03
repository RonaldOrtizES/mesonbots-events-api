import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { extractServiceToken } from "../utils/jwt";
import { fail } from "../utils/responses";

export function requireServiceAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractServiceToken(req.header("authorization"));

  if (!token || token !== env.SERVICE_TOKEN) {
    fail(res, 401, "Invalid service token", "SERVICE_AUTH_INVALID");
    return;
  }

  const tenantId = req.header("x-tenant-id") ?? undefined;

  req.auth = {
    source: "service",
    tenantId
  };

  next();
}
