import { env } from "../config/env";

export async function notifyCore(path: string, tenantId: string, body: unknown): Promise<void> {
  if (!env.CORE_API_URL || !env.SERVICE_TOKEN) {
    console.info("[SERVICE] Core API no configurada; se omite notificacion interna", {
      path,
      tenantId
    });
    return;
  }

  const url = `${env.CORE_API_URL.replace(/\/$/, "")}${path}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Service ${env.SERVICE_TOKEN}`,
        "x-tenant-id": tenantId
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.warn("[SERVICE] Core API request failed", {
        path,
        tenantId,
        status: response.status
      });
    }
  } catch (error) {
    console.warn("[SERVICE] Core API request error", {
      path,
      tenantId,
      error
    });
  }
}
