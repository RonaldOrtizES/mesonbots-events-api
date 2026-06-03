import { query } from "../../db/client";

export async function processTwilioSms(payload: unknown): Promise<void> {
  try {
    await query(
      `
        INSERT INTO webhooks_log (source, event_type, payload, processed, received_at)
        VALUES ('twilio', 'sms', $1::jsonb, true, NOW())
      `,
      [JSON.stringify(payload)]
    );
    console.info("[WEBHOOK] Twilio SMS recibido");
  } catch (error) {
    console.warn("[WEBHOOK] No se pudo guardar webhook SMS de Twilio", error);
  }
}

export async function processTwilioVoice(payload: unknown): Promise<void> {
  try {
    await query(
      `
        INSERT INTO webhooks_log (source, event_type, payload, processed, received_at)
        VALUES ('twilio', 'voice', $1::jsonb, true, NOW())
      `,
      [JSON.stringify(payload)]
    );
    console.info("[WEBHOOK] Twilio Voice recibido");
  } catch (error) {
    console.warn("[WEBHOOK] No se pudo guardar webhook Voice de Twilio", error);
  }
}

export function incomingCallTwiml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    "<Say language=\"es-MX\">Gracias por llamar a Mesonbots. Este numero solo recibe verificaciones automaticas.</Say>",
    "<Hangup />",
    "</Response>"
  ].join("");
}
