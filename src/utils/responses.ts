import { Response } from "express";

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;

  public constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function ok<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({
    ok: true,
    data
  });
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}

export function fail(res: Response, statusCode: number, message: string, code?: string): Response {
  return res.status(statusCode).json({
    ok: false,
    error: {
      message,
      code
    }
  });
}
