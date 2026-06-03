import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { extractBearerToken } from "../utils/jwt";
import { fail } from "../utils/responses";

export function requireCronAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.header("authorization"));

  if (!token || token !== env.CRON_SECRET) {
    fail(res, 401, "Invalid cron token", "CRON_AUTH_INVALID");
    return;
  }

  next();
}
