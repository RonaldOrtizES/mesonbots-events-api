import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { JwtPayload } from "../types";

export function verifyJwtToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded === "string") {
    throw new Error("Invalid JWT payload");
  }

  return decoded as JwtPayload;
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export function extractServiceToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Service" || !token) {
    return null;
  }

  return token;
}
