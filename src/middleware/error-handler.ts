import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError, fail } from "../utils/responses";

export function notFoundHandler(req: Request, res: Response): void {
  fail(res, 404, `Route not found: ${req.method} ${req.path}`, "NOT_FOUND");
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof HttpError) {
    fail(res, error.statusCode, error.message, error.code);
    return;
  }

  if (error instanceof ZodError) {
    fail(res, 400, "Invalid request payload", "VALIDATION_ERROR");
    return;
  }

  console.error("[ERROR] Unhandled error", error);
  fail(res, 500, "Internal server error", "INTERNAL_ERROR");
}
