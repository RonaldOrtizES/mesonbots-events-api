import { ConversationStatus, MessageDirection, MessageType, TemplateCategory } from "../../types";

export interface AbrirOContinuarConversacionParams {
  tenantId: string;
  customerPhone: string;
  customerName?: string;
}

export interface AbrirOContinuarConversacionResult {
  conversacionId: string;
  esNueva: boolean;
}

export interface RegistrarMensajeParams {
  conversacionId: string;
  tenantId: string;
  direction: MessageDirection;
  content: string;
  messageType?: MessageType;
  generatedByAi?: boolean;
  metaMessageId?: string;
  isTemplate?: boolean;
  templateCategory?: TemplateCategory;
  aiInputTokens?: number;
  aiOutputTokens?: number;
  aiCostUsd?: number;
}

export interface RegistrarMensajeResult {
  messageId: string;
}

export interface CerrarConversacionOpciones {
  resolvedByHuman?: boolean;
  aiHandledFully?: boolean;
}

export interface ConversationListFilters {
  tenantId: string;
  estado?: ConversationStatus;
  busqueda?: string;
  limit: number;
  offset: number;
}
