import dayjs from "dayjs";
import { PoolClient } from "pg";
import { query, withTransaction } from "../../db/client";
import { ConversationStatus, TemplateCategory } from "../../types";
import { HttpError } from "../../utils/responses";
import {
  AbrirOContinuarConversacionParams,
  AbrirOContinuarConversacionResult,
  CerrarConversacionOpciones,
  ConversationListFilters,
  RegistrarMensajeParams,
  RegistrarMensajeResult
} from "./conversaciones.types";

const DEFAULT_WHATSAPP_PRICING: Record<TemplateCategory, number> = {
  utility: 0.013,
  marketing: 0.0851,
  authentication: 0.013
};

interface ConversationIdRow {
  id: string;
  service_window_expires_at: Date | string | null;
}

interface EndCustomerRow {
  id: string;
}

interface PricingRow {
  value: unknown;
}

interface CountRow {
  count: string;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function getToday(): string {
  return dayjs().format("YYYY-MM-DD");
}

async function incrementDailyMetric(
  client: PoolClient,
  tenantId: string,
  date: string,
  increments: {
    messagesInbound?: number;
    messagesOutbound?: number;
    conversationsOpened?: number;
    conversationsClosed?: number;
    conversationsEscalated?: number;
    conversationsResolvedByAi?: number;
    costWhatsappUsd?: number;
    costAiUsd?: number;
  }
): Promise<void> {
  const values = {
    messagesInbound: increments.messagesInbound ?? 0,
    messagesOutbound: increments.messagesOutbound ?? 0,
    conversationsOpened: increments.conversationsOpened ?? 0,
    conversationsClosed: increments.conversationsClosed ?? 0,
    conversationsEscalated: increments.conversationsEscalated ?? 0,
    conversationsResolvedByAi: increments.conversationsResolvedByAi ?? 0,
    costWhatsappUsd: increments.costWhatsappUsd ?? 0,
    costAiUsd: increments.costAiUsd ?? 0
  };

  await client.query(
    `
      INSERT INTO metrics_daily (
        tenant_id,
        date,
        messages_inbound,
        messages_outbound,
        conversations_opened,
        conversations_closed,
        conversations_escalated,
        conversations_resolved_by_ai,
        cost_whatsapp_usd,
        cost_ai_usd
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (tenant_id, date)
      DO UPDATE SET
        messages_inbound = metrics_daily.messages_inbound + EXCLUDED.messages_inbound,
        messages_outbound = metrics_daily.messages_outbound + EXCLUDED.messages_outbound,
        conversations_opened = metrics_daily.conversations_opened + EXCLUDED.conversations_opened,
        conversations_closed = metrics_daily.conversations_closed + EXCLUDED.conversations_closed,
        conversations_escalated = metrics_daily.conversations_escalated + EXCLUDED.conversations_escalated,
        conversations_resolved_by_ai = metrics_daily.conversations_resolved_by_ai + EXCLUDED.conversations_resolved_by_ai,
        cost_whatsapp_usd = metrics_daily.cost_whatsapp_usd + EXCLUDED.cost_whatsapp_usd,
        cost_ai_usd = metrics_daily.cost_ai_usd + EXCLUDED.cost_ai_usd
    `,
    [
      tenantId,
      date,
      values.messagesInbound,
      values.messagesOutbound,
      values.conversationsOpened,
      values.conversationsClosed,
      values.conversationsEscalated,
      values.conversationsResolvedByAi,
      values.costWhatsappUsd,
      values.costAiUsd
    ]
  );
}

async function findOrCreateEndCustomer(
  client: PoolClient,
  params: AbrirOContinuarConversacionParams
): Promise<string> {
  const existing = await client.query<EndCustomerRow>(
    `
      SELECT id
      FROM end_customers
      WHERE tenant_id = $1 AND whatsapp_phone = $2
      LIMIT 1
      FOR UPDATE
    `,
    [params.tenantId, params.customerPhone]
  );

  if (existing.rows[0]) {
    await client.query(
      `
        UPDATE end_customers
        SET
          name = COALESCE($3, name),
          last_contact_at = NOW()
        WHERE tenant_id = $1 AND whatsapp_phone = $2
      `,
      [params.tenantId, params.customerPhone, params.customerName ?? null]
    );
    return existing.rows[0].id;
  }

  const inserted = await client.query<EndCustomerRow>(
    `
      INSERT INTO end_customers (
        tenant_id,
        whatsapp_phone,
        name,
        total_conversations,
        total_appointments,
        first_contact_at,
        last_contact_at
      )
      VALUES ($1, $2, $3, 0, 0, NOW(), NOW())
      RETURNING id
    `,
    [params.tenantId, params.customerPhone, params.customerName ?? null]
  );

  return inserted.rows[0].id;
}

async function createConversation(
  client: PoolClient,
  params: AbrirOContinuarConversacionParams,
  endCustomerId: string
): Promise<string> {
  const inserted = await client.query<ConversationIdRow>(
    `
      INSERT INTO conversations (
        tenant_id,
        end_customer_id,
        customer_phone,
        customer_name,
        status,
        service_window_opened_at,
        service_window_expires_at,
        is_in_service_window,
        total_messages,
        inbound_messages,
        outbound_messages,
        resolved_by_human,
        ai_handled_fully,
        total_ai_tokens,
        total_ai_cost_usd,
        first_message_at,
        last_message_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'open',
        NOW(),
        NOW() + INTERVAL '24 hours',
        true,
        0,
        0,
        0,
        false,
        true,
        0,
        0,
        NOW(),
        NOW()
      )
      RETURNING id
    `,
    [params.tenantId, endCustomerId, params.customerPhone, params.customerName ?? null]
  );

  await client.query(
    `
      UPDATE end_customers
      SET total_conversations = total_conversations + 1
      WHERE id = $1 AND tenant_id = $2
    `,
    [endCustomerId, params.tenantId]
  );

  await incrementDailyMetric(client, params.tenantId, getToday(), {
    conversationsOpened: 1
  });

  return inserted.rows[0].id;
}

async function recoverOpenConversation(
  params: AbrirOContinuarConversacionParams
): Promise<AbrirOContinuarConversacionResult> {
  return withTransaction(async (client) => {
    const existing = await client.query<ConversationIdRow>(
      `
        SELECT id
        FROM conversations
        WHERE tenant_id = $1
          AND customer_phone = $2
          AND status = 'open'
        LIMIT 1
        FOR UPDATE
      `,
      [params.tenantId, params.customerPhone]
    );

    if (!existing.rows[0]) {
      throw new HttpError(409, "Open conversation conflict could not be recovered", "CONVERSATION_CONFLICT");
    }

    await client.query(
      `
        UPDATE conversations
        SET
          service_window_expires_at = NOW() + INTERVAL '24 hours',
          is_in_service_window = true,
          customer_name = COALESCE($3, customer_name)
        WHERE id = $1 AND tenant_id = $2
      `,
      [existing.rows[0].id, params.tenantId, params.customerName ?? null]
    );

    return {
      conversacionId: existing.rows[0].id,
      esNueva: false
    };
  });
}

export async function abrirOContinuarConversacion(
  params: AbrirOContinuarConversacionParams
): Promise<AbrirOContinuarConversacionResult> {
  try {
    return await withTransaction(async (client) => {
      const existingOpen = await client.query<ConversationIdRow>(
        `
          SELECT id, service_window_expires_at
          FROM conversations
          WHERE tenant_id = $1
            AND customer_phone = $2
            AND status = 'open'
          LIMIT 1
          FOR UPDATE
        `,
        [params.tenantId, params.customerPhone]
      );

      const openConversation = existingOpen.rows[0];

      if (openConversation) {
        const expiresAt = openConversation.service_window_expires_at
          ? dayjs(openConversation.service_window_expires_at)
          : null;

        if (expiresAt?.isAfter(dayjs())) {
          await client.query(
            `
              UPDATE conversations
              SET
                service_window_expires_at = NOW() + INTERVAL '24 hours',
                is_in_service_window = true,
                customer_name = COALESCE($3, customer_name)
              WHERE id = $1 AND tenant_id = $2
            `,
            [openConversation.id, params.tenantId, params.customerName ?? null]
          );

          return {
            conversacionId: openConversation.id,
            esNueva: false
          };
        }

        await client.query(
          `
            UPDATE conversations
            SET
              status = 'closed',
              closed_at = NOW(),
              is_in_service_window = false
            WHERE id = $1 AND tenant_id = $2
          `,
          [openConversation.id, params.tenantId]
        );

        await incrementDailyMetric(client, params.tenantId, getToday(), {
          conversationsClosed: 1
        });
      }

      const endCustomerId = await findOrCreateEndCustomer(client, params);
      const conversationId = await createConversation(client, params, endCustomerId);

      return {
        conversacionId: conversationId,
        esNueva: true
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      console.warn("[CONV] Race condition recuperada al abrir conversacion", {
        tenantId: params.tenantId,
        customerPhone: params.customerPhone
      });
      return recoverOpenConversation(params);
    }

    throw error;
  }
}

async function getWhatsappPricing(): Promise<Record<TemplateCategory, number>> {
  try {
    const result = await query<PricingRow>(
      "SELECT value FROM system_config WHERE key = $1 LIMIT 1",
      ["pricing_whatsapp_el_salvador"]
    );
    const value = result.rows[0]?.value;
    const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;

    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Partial<Record<TemplateCategory, unknown>>;
      return {
        utility: typeof record.utility === "number" ? record.utility : DEFAULT_WHATSAPP_PRICING.utility,
        marketing: typeof record.marketing === "number" ? record.marketing : DEFAULT_WHATSAPP_PRICING.marketing,
        authentication: typeof record.authentication === "number"
          ? record.authentication
          : DEFAULT_WHATSAPP_PRICING.authentication
      };
    }
  } catch (error) {
    console.warn("[CONV] No se pudo leer pricing de WhatsApp; usando defaults", error);
  }

  return DEFAULT_WHATSAPP_PRICING;
}

export async function registrarMensaje(params: RegistrarMensajeParams): Promise<RegistrarMensajeResult> {
  const pricing = await getWhatsappPricing();
  const isTemplate = params.isTemplate ?? params.messageType === "template";
  const templateCategory = params.templateCategory;
  const whatsappCostUsd = isTemplate && templateCategory ? pricing[templateCategory] : 0;
  const aiCostUsd = params.aiCostUsd ?? 0;

  return withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO messages (
          conversation_id,
          tenant_id,
          direction,
          message_type,
          content,
          generated_by_ai,
          ai_model,
          ai_input_tokens,
          ai_output_tokens,
          ai_cost_usd,
          whatsapp_cost_usd,
          is_billable,
          is_template,
          template_category,
          delivery_status,
          meta_message_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id
      `,
      [
        params.conversacionId,
        params.tenantId,
        params.direction,
        params.messageType ?? "text",
        params.content,
        params.generatedByAi ?? false,
        params.generatedByAi ? "external-ai-api" : null,
        params.aiInputTokens ?? 0,
        params.aiOutputTokens ?? 0,
        aiCostUsd,
        whatsappCostUsd,
        whatsappCostUsd > 0 || aiCostUsd > 0,
        isTemplate,
        templateCategory ?? null,
        params.direction === "outbound" ? "sent" : "received",
        params.metaMessageId ?? null
      ]
    );

    await client.query(
      `
        UPDATE conversations
        SET
          total_messages = total_messages + 1,
          inbound_messages = inbound_messages + CASE WHEN $3 = 'inbound' THEN 1 ELSE 0 END,
          outbound_messages = outbound_messages + CASE WHEN $3 = 'outbound' THEN 1 ELSE 0 END,
          last_message_at = NOW(),
          total_ai_tokens = total_ai_tokens + $4,
          total_ai_cost_usd = total_ai_cost_usd + $5
        WHERE id = $1 AND tenant_id = $2
      `,
      [
        params.conversacionId,
        params.tenantId,
        params.direction,
        (params.aiInputTokens ?? 0) + (params.aiOutputTokens ?? 0),
        aiCostUsd
      ]
    );

    if (params.direction === "outbound" && isTemplate && templateCategory) {
      const usageColumn = templateCategory === "marketing" ? "marketing_used" : "notifications_used";
      await client.query(
        `
          UPDATE subscriptions
          SET ${usageColumn} = ${usageColumn} + 1
          WHERE tenant_id = $1 AND status = 'active'
        `,
        [params.tenantId]
      );
    }

    await incrementDailyMetric(client, params.tenantId, getToday(), {
      messagesInbound: params.direction === "inbound" ? 1 : 0,
      messagesOutbound: params.direction === "outbound" ? 1 : 0,
      costWhatsappUsd: whatsappCostUsd,
      costAiUsd: aiCostUsd
    });

    return {
      messageId: inserted.rows[0].id
    };
  });
}

export async function cerrarConversacionesInactivas(): Promise<{ cerradas: number }> {
  return withTransaction(async (client) => {
    const updated = await client.query<{ tenant_id: string }>(
      `
        UPDATE conversations
        SET
          status = 'closed',
          closed_at = NOW(),
          is_in_service_window = false
        WHERE status = 'open'
          AND service_window_expires_at < NOW()
        RETURNING tenant_id
      `
    );

    const closedByTenant = new Map<string, number>();
    for (const row of updated.rows) {
      closedByTenant.set(row.tenant_id, (closedByTenant.get(row.tenant_id) ?? 0) + 1);
    }

    for (const [tenantId, count] of closedByTenant) {
      await incrementDailyMetric(client, tenantId, getToday(), {
        conversationsClosed: count
      });
    }

    return {
      cerradas: updated.rowCount ?? 0
    };
  });
}

export async function cerrarConversacion(
  conversacionId: string,
  tenantId: string,
  opciones: CerrarConversacionOpciones = {}
): Promise<void> {
  await withTransaction(async (client) => {
    const result = await client.query(
      `
        UPDATE conversations
        SET
          status = 'closed',
          closed_at = NOW(),
          is_in_service_window = false,
          resolved_by_human = COALESCE($3, resolved_by_human),
          ai_handled_fully = COALESCE($4, ai_handled_fully)
        WHERE id = $1 AND tenant_id = $2 AND status <> 'closed'
      `,
      [
        conversacionId,
        tenantId,
        opciones.resolvedByHuman ?? null,
        opciones.aiHandledFully ?? null
      ]
    );

    if ((result.rowCount ?? 0) > 0) {
      await incrementDailyMetric(client, tenantId, getToday(), {
        conversationsClosed: 1,
        conversationsResolvedByAi: opciones.aiHandledFully ? 1 : 0
      });
    }
  });
}

export async function cerrarConversacionPorTelefono(
  tenantId: string,
  customerPhone: string,
  opciones: CerrarConversacionOpciones = {}
): Promise<{ conversacionId: string | null; cerrada: boolean }> {
  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `
        UPDATE conversations
        SET
          status = 'closed',
          closed_at = NOW(),
          is_in_service_window = false,
          resolved_by_human = COALESCE($3, resolved_by_human),
          ai_handled_fully = COALESCE($4, ai_handled_fully)
        WHERE tenant_id = $1
          AND customer_phone = $2
          AND status = 'open'
        RETURNING id
      `,
      [
        tenantId,
        customerPhone,
        opciones.resolvedByHuman ?? null,
        opciones.aiHandledFully ?? null
      ]
    );

    const closedConversation = result.rows[0];

    if (!closedConversation) {
      return {
        conversacionId: null,
        cerrada: false
      };
    }

    await incrementDailyMetric(client, tenantId, getToday(), {
      conversationsClosed: 1,
      conversationsResolvedByAi: opciones.aiHandledFully ? 1 : 0
    });

    return {
      conversacionId: closedConversation.id,
      cerrada: true
    };
  });
}

export async function escalarConversacion(
  conversacionId: string,
  tenantId: string,
  razon: string
): Promise<void> {
  await withTransaction(async (client) => {
    const result = await client.query(
      `
        UPDATE conversations
        SET
          status = 'escalated',
          escalated_at = NOW(),
          escalated_reason = $3,
          ai_handled_fully = false
        WHERE id = $1 AND tenant_id = $2
      `,
      [conversacionId, tenantId, razon]
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new HttpError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
    }

    await incrementDailyMetric(client, tenantId, getToday(), {
      conversationsEscalated: 1
    });
  });
}

export async function listarConversaciones(filters: ConversationListFilters): Promise<{
  items: unknown[];
  total: number;
  limit: number;
  offset: number;
}> {
  const conditions = ["tenant_id = $1"];
  const params: unknown[] = [filters.tenantId];

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`status = $${params.length}`);
  }

  if (filters.busqueda) {
    params.push(`%${filters.busqueda}%`);
    conditions.push(`(customer_name ILIKE $${params.length} OR customer_phone ILIKE $${params.length})`);
  }

  const whereClause = conditions.join(" AND ");

  const totalResult = await query<CountRow>(
    `SELECT COUNT(*)::text AS count FROM conversations WHERE ${whereClause}`,
    params
  );

  const listParams = [...params, filters.limit, filters.offset];
  const listResult = await query(
    `
      SELECT *
      FROM conversations
      WHERE ${whereClause}
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    listParams
  );

  return {
    items: listResult.rows,
    total: Number(totalResult.rows[0]?.count ?? 0),
    limit: filters.limit,
    offset: filters.offset
  };
}

export async function obtenerConversacion(conversacionId: string, tenantId: string): Promise<unknown> {
  const result = await query(
    `
      SELECT *
      FROM conversations
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
    `,
    [conversacionId, tenantId]
  );

  if (!result.rows[0]) {
    throw new HttpError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
  }

  return result.rows[0];
}

export async function obtenerMensajes(conversacionId: string, tenantId: string): Promise<unknown[]> {
  await obtenerConversacion(conversacionId, tenantId);

  const result = await query(
    `
      SELECT *
      FROM messages
      WHERE conversation_id = $1 AND tenant_id = $2
      ORDER BY created_at ASC
    `,
    [conversacionId, tenantId]
  );

  return result.rows;
}

export async function cambiarEstadoConversacion(
  conversacionId: string,
  tenantId: string,
  estado: ConversationStatus
): Promise<void> {
  if (estado === "closed") {
    await cerrarConversacion(conversacionId, tenantId);
    return;
  }

  if (estado === "escalated") {
    await escalarConversacion(conversacionId, tenantId, "Escalada manualmente");
    return;
  }

  const result = await query(
    `
      UPDATE conversations
      SET
        status = $3,
        is_in_service_window = CASE WHEN $3 = 'open' THEN true ELSE is_in_service_window END
      WHERE id = $1 AND tenant_id = $2
    `,
    [conversacionId, tenantId, estado]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new HttpError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
  }
}

export async function tomarControl(conversacionId: string, tenantId: string): Promise<void> {
  const result = await query(
    `
      UPDATE conversations
      SET resolved_by_human = true, ai_handled_fully = false
      WHERE id = $1 AND tenant_id = $2
    `,
    [conversacionId, tenantId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new HttpError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
  }
}

export async function devolverAlBot(conversacionId: string, tenantId: string): Promise<void> {
  const result = await query(
    `
      UPDATE conversations
      SET resolved_by_human = false, ai_handled_fully = true
      WHERE id = $1 AND tenant_id = $2
    `,
    [conversacionId, tenantId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new HttpError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
  }
}
