import { env } from "../config/env";

export interface SolicitarRespuestaIAParams {
  conversacionId: string;
  tenantId: string;
  mensajeEntrante: string;
}

async function postWithTimeout(url: string, params: SolicitarRespuestaIAParams): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);

  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Service ${env.SERVICE_TOKEN}`,
        "x-tenant-id": params.tenantId
      },
      body: JSON.stringify({
        conversacionId: params.conversacionId,
        tenantId: params.tenantId,
        mensajeEntrante: params.mensajeEntrante
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function solicitarRespuestaIA(params: SolicitarRespuestaIAParams): Promise<void> {
  if (!env.AI_API_URL || !env.SERVICE_TOKEN) {
    console.info("[SERVICE] AI API no configurada; se omite procesamiento externo", {
      conversacionId: params.conversacionId,
      tenantId: params.tenantId
    });
    return;
  }

  const url = `${env.AI_API_URL.replace(/\/$/, "")}/api/procesar-mensaje`;

  try {
    const firstResponse = await postWithTimeout(url, params);

    if (firstResponse.ok) {
      return;
    }

    if (firstResponse.status >= 500) {
      const retryResponse = await postWithTimeout(url, params);
      if (retryResponse.ok) {
        return;
      }
      console.warn("[SERVICE] AI API retry failed", {
        status: retryResponse.status,
        conversacionId: params.conversacionId,
        tenantId: params.tenantId
      });
      return;
    }

    console.warn("[SERVICE] AI API request rejected", {
      status: firstResponse.status,
      conversacionId: params.conversacionId,
      tenantId: params.tenantId
    });
  } catch (error) {
    console.warn("[SERVICE] AI API request failed", {
      error,
      conversacionId: params.conversacionId,
      tenantId: params.tenantId
    });
  }
}
