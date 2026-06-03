import { registrarMensaje } from "../conversaciones/conversaciones.service";

export async function registrarMensajeSaliente(params: {
  tenantId: string;
  conversacionId: string;
  contenido: string;
  generatedByAi?: boolean;
}): Promise<{ messageId: string }> {
  const saved = await registrarMensaje({
    conversacionId: params.conversacionId,
    tenantId: params.tenantId,
    direction: "outbound",
    content: params.contenido,
    messageType: "text",
    generatedByAi: params.generatedByAi ?? false
  });

  return {
    messageId: saved.messageId
  };
}
