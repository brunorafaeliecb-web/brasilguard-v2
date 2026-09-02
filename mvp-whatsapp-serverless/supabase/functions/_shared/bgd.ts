export type InboundMessage = {
  providerMessageId: string;
  sender: string;
  recipient: string;
  messageType: string;
  text: string | null;
  metadata: Record<string, unknown>;
};

export type ParsedInbound = {
  phoneNumberId: string;
  message: InboundMessage;
};

export function extractInboundMessages(payload: Record<string, unknown>): ParsedInbound[] {
  const out: ParsedInbound[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray((entry as any)?.changes) ? (entry as any).changes : [];
    for (const change of changes) {
      const value = change?.value ?? {};
      const metadata = value?.metadata ?? {};
      const phoneNumberId = String(metadata?.phone_number_id ?? "");
      const recipient = String(metadata?.display_phone_number ?? phoneNumberId);
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      for (const msg of messages) {
        const messageType = String(msg?.type ?? "unknown");
        let text: string | null = null;
        const mediaMeta: Record<string, unknown> = {};
        if (messageType === "text") text = msg?.text?.body ?? null;
        else if (messageType === "button") text = msg?.button?.text ?? null;
        else if (messageType === "interactive") {
          const reply = msg?.interactive?.button_reply ?? msg?.interactive?.list_reply ?? {};
          text = reply?.title ?? reply?.id ?? null;
        } else if (["audio", "document", "image", "video"].includes(messageType)) {
          const media = msg?.[messageType] ?? {};
          mediaMeta.media_id = media?.id ?? null;
          mediaMeta.mime_type = media?.mime_type ?? null;
          mediaMeta.sha256 = media?.sha256 ?? null;
          mediaMeta.filename = media?.filename ?? null;
        }
        const providerMessageId = String(msg?.id ?? "");
        const sender = String(msg?.from ?? "");
        if (phoneNumberId && providerMessageId && sender) {
          out.push({
            phoneNumberId,
            message: {
              providerMessageId,
              sender,
              recipient,
              messageType,
              text,
              metadata: { context: msg?.context ?? null, contacts: value?.contacts ?? null, ...mediaMeta },
            },
          });
        }
      }
    }
  }
  return out;
}

export function safeEqual(a: string | null, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function looksLikeKnowledgeQuestion(text: string): boolean {
  const normalized = String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length < 8) return false;
  const prefixes = [
    "qual ", "quais ", "quanto ", "quantos ", "quando ", "onde ", "como ", "por que ", "porque ",
    "tem ", "há ", "posso ", "pode ", "vocês ", "voces ", "what ", "when ", "where ", "how ", "can ", "do you ",
  ];
  return normalized.includes("?") || prefixes.some((p) => normalized.startsWith(p));
}

export function shouldHandoff(text: string | null, behavior: Record<string, unknown> | null): string | null {
  const defaults = ["falar com atendente", "falar com uma pessoa", "atendente humano", "quero um humano", "reclamação"];
  const configured = Array.isArray((behavior as any)?.handoff_keywords) ? (behavior as any).handoff_keywords : defaults;
  const normalized = String(text ?? "").trim().toLowerCase();
  for (const raw of configured) {
    const term = String(raw ?? "").trim().toLowerCase();
    if (term && normalized.includes(term)) return `keyword:${term}`;
  }
  return null;
}
