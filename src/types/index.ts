export type ConversationStatus = "open" | "closed" | "escalated" | "archived";
export type MessageDirection = "inbound" | "outbound";
export type MessageType = "text" | "image" | "audio" | "video" | "document" | "template";
export type TemplateCategory = "utility" | "marketing" | "authentication";
export type AuthSource = "jwt" | "service";

export interface AuthContext {
  source: AuthSource;
  tenantId?: string;
  userId?: string;
  role?: string;
}

export interface JwtPayload {
  sub?: string;
  userId?: string;
  id?: string;
  tenantId?: string;
  tenant_id?: string;
  role?: string;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    message: string;
    code?: string;
  };
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
