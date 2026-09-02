export interface Env {
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
  SUPABASE_INGEST_URL: string;
  BGD_INGRESS_SECRET: string;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifyMetaSignature(raw: ArrayBuffer, header: string | null, secret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=") || !secret) return false;
  const signature = hexToBytes(header.slice("sha256=".length));
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signature, raw);
}

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge") ?? "";
      if (mode === "subscribe" && token && env.WHATSAPP_VERIFY_TOKEN && token === env.WHATSAPP_VERIFY_TOKEN) return text(challenge);
      return text("webhook verification failed", 403);
    }

    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!env.WHATSAPP_APP_SECRET || !env.SUPABASE_INGEST_URL || !env.BGD_INGRESS_SECRET) return json({ error: "worker_not_configured" }, 503);

    const raw = await request.arrayBuffer();
    const valid = await verifyMetaSignature(raw, request.headers.get("X-Hub-Signature-256"), env.WHATSAPP_APP_SECRET);
    if (!valid) return json({ error: "invalid_webhook_signature" }, 401);

    const upstream = await fetch(env.SUPABASE_INGEST_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bgd-ingress-secret": env.BGD_INGRESS_SECRET },
      body: raw,
    });
    if (!upstream.ok) {
      console.error("Supabase ingest rejected webhook", upstream.status);
      return json({ error: "upstream_ingest_failed" }, 502);
    }

    return json({ status: "ok" });
  },
};
