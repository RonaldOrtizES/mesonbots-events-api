import { env } from "../../config/env";
import { query } from "../../db/client";
import { solicitarRespuestaIA } from "../../shared/ai-client";
import {
  abrirOContinuarConversacion,
  registrarMensaje
} from "../conversaciones/conversaciones.service";

interface TenantRow {
  id: string;
}

interface WebhookLogRow {
  id: string;
}

interface MetaMessageEvent {
  phoneNumberId: string;
  sender: string;
  content: string;
  messageType: "text" | "image" | "audio" | "video" | "document";
  metaMessageId?: string;
  customerName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function extractMetaEvents(payload: unknown): MetaMessageEvent[] {
  if (!isRecord(payload)) {
    return [];
  }

  const events: MetaMessageEvent[] = [];

  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) {
      continue;
    }

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || !isRecord(change.value)) {
        continue;
      }

      const value = change.value;
      const metadata = isRecord(value.metadata) ? value.metadata : {};
      const phoneNumberId = asString(metadata.phone_number_id);
      const contacts = asArray(value.contacts);
      const firstContact = isRecord(contacts[0]) ? contacts[0] : {};
      const profile = isRecord(firstContact.profile) ? firstContact.profile : {};
      const customerName = asString(profile.name);

      if (!phoneNumberId) {
        continue;
      }

      for (const message of asArray(value.messages)) {
        if (!isRecord(message)) {
          continue;
        }

        const sender = asString(message.from);
        const rawType = asString(message.type) ?? "text";
        const messageType = ["text", "image", "audio", "video", "document"].includes(rawType)
          ? rawType as MetaMessageEvent["messageType"]
          : "text";
        const text = isRecord(message.text) ? asString(message.text.body) : undefined;
        const content = text ?? `[${messageType}]`;

        if (!sender || !content) {
          continue;
        }

        events.push({
          phoneNumberId,
          sender,
          content,
          messageType,
          metaMessageId: asString(message.id),
          customerName
        });
      }
    }
  }

  return events;
}

async function saveWebhookLog(payload: unknown, eventType: string): Promise<string | null> {
  try {
    const result = await query<WebhookLogRow>(
      `
        INSERT INTO webhooks_log (source, event_type, payload, processed, received_at)
        VALUES ('meta', $1, $2::jsonb, false, NOW())
        RETURNING id
      `,
      [eventType, JSON.stringify(payload)]
    );

    return result.rows[0]?.id ?? null;
  } catch (error) {
    console.warn("[WEBHOOK] No se pudo guardar webhooks_log de Meta", error);
    return null;
  }
}

async function markWebhookProcessed(logId: string | null): Promise<void> {
  if (!logId) {
    return;
  }

  try {
    await query(
      `
        UPDATE webhooks_log
        SET processed = true
        WHERE id = $1
      `,
      [logId]
    );
  } catch (error) {
    console.warn("[WEBHOOK] No se pudo marcar webhook Meta como procesado", { logId, error });
  }
}

async function findTenantId(phoneNumberId: string): Promise<string | null> {
  const result = await query<TenantRow>(
    `
      SELECT id
      FROM tenants
      WHERE whatsapp_phone_id = $1
      LIMIT 1
    `,
    [phoneNumberId]
  );

  return result.rows[0]?.id ?? null;
}

export function verifyMetaWebhook(queryParams: Record<string, unknown>): string | null {
  const mode = asString(queryParams["hub.mode"]);
  const token = asString(queryParams["hub.verify_token"]);
  const challenge = asString(queryParams["hub.challenge"]);

  if (mode === "subscribe" && token === env.META_VERIFY_TOKEN && challenge) {
    return challenge;
  }

  return null;
}

export async function processMetaWebhook(payload: unknown): Promise<void> {
  const logId = await saveWebhookLog(payload, "whatsapp_message");
  const events = extractMetaEvents(payload);

  if (events.length === 0) {
    console.info("[WEBHOOK] Meta payload sin mensajes procesables");
    await markWebhookProcessed(logId);
    return;
  }

  for (const event of events) {
    try {
      const tenantId = await findTenantId(event.phoneNumberId);

      if (!tenantId) {
        console.warn("[WEBHOOK] Tenant no encontrado para phone_number_id", {
          phoneNumberId: event.phoneNumberId
        });
        continue;
      }

      const conversation = await abrirOContinuarConversacion({
        tenantId,
        customerPhone: event.sender,
        customerName: event.customerName
      });

      await registrarMensaje({
        conversacionId: conversation.conversacionId,
        tenantId,
        direction: "inbound",
        content: event.content,
        messageType: event.messageType,
        metaMessageId: event.metaMessageId
      });

      void solicitarRespuestaIA({
        conversacionId: conversation.conversacionId,
        tenantId,
        mensajeEntrante: event.content
      });
    } catch (error) {
      console.warn("[WEBHOOK] Error procesando evento Meta", { event, error });
    }
  }

  await markWebhookProcessed(logId);
}
