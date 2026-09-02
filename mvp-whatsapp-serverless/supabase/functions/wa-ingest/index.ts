import { createClient } from "npm:@supabase/supabase-js@2";
import { extractInboundMessages, safeEqual } from "../_shared/bgd.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INGRESS_SECRET = Deno.env.get("BGD_INGRESS_SECRET") ?? "";
const PROCESS_URL = `${SUPABASE_URL}/functions/v1/wa-process`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function audit(db: any, params: Record<string, unknown>) {
  const { error } = await db.rpc("bgd_append_audit_event", params);
  if (error) throw new Error(`audit_append_failed:${error.code ?? "unknown"}`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE || !INGRESS_SECRET) return json({ error: "server_not_configured" }, 503);

  const supplied = req.headers.get("x-bgd-ingress-secret");
  if (!safeEqual(supplied, INGRESS_SECRET)) return json({ error: "unauthorized" }, 401);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400); }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let accepted = 0, duplicates = 0, ignored = 0;
  const background: Promise<unknown>[] = [];

  for (const item of extractInboundMessages(payload)) {
    const traceId = crypto.randomUUID();
    const { data: connection, error: connectionError } = await db
      .from("whatsapp_connections")
      .select("id,tenant_id,phone_number_id,display_phone,active")
      .eq("phone_number_id", item.phoneNumberId)
      .eq("active", true)
      .maybeSingle();
    if (connectionError) return json({ error: "connection_lookup_failed" }, 500);
    if (!connection) { ignored += 1; continue; }

    const { error: eventError } = await db.from("whatsapp_inbound_events").insert({
      tenant_id: connection.tenant_id,
      phone_number_id: connection.phone_number_id,
      provider_event_id: item.message.providerMessageId,
      event_kind: "message",
      payload,
      trace_id: traceId,
    });
    if (eventError?.code === "23505") { duplicates += 1; continue; }
    if (eventError) return json({ error: "inbound_event_persist_failed" }, 500);

    const { data: identity, error: identityError } = await db
      .from("contact_identities")
      .upsert({ tenant_id: connection.tenant_id, phone_e164: item.message.sender, role: "other", status: "active" }, { onConflict: "tenant_id,phone_e164" })
      .select("id,phone_e164,role")
      .single();
    if (identityError || !identity) return json({ error: "identity_resolve_failed" }, 500);

    let conversation: any = null;
    const { data: existingConversation, error: conversationLookupError } = await db
      .from("conversations")
      .select("id,status,identity_role")
      .eq("tenant_id", connection.tenant_id)
      .eq("contact_key", item.message.sender)
      .eq("channel", "whatsapp")
      .in("status", ["open", "human"])
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conversationLookupError) return json({ error: "conversation_lookup_failed" }, 500);

    if (existingConversation) conversation = existingConversation;
    else {
      const { data: createdConversation, error: createConversationError } = await db
        .from("conversations")
        .insert({ tenant_id: connection.tenant_id, contact_key: item.message.sender, channel: "whatsapp", status: "open", identity_id: identity.id, identity_role: identity.role })
        .select("id,status,identity_role").single();
      if (createConversationError || !createdConversation) return json({ error: "conversation_create_failed" }, 500);
      conversation = createdConversation;
      await audit(db, {
        p_tenant_id: connection.tenant_id, p_event_type: "CONVERSATION_OPENED", p_actor_type: "system",
        p_actor_id: "conversation_engine", p_entity_type: "conversation", p_entity_id: conversation.id,
        p_trace_id: traceId, p_payload: { channel: "whatsapp", identity_role: identity.role }, p_note: null,
      });
    }

    const { data: stored, error: messageError } = await db
      .from("conversation_messages")
      .insert({
        tenant_id: connection.tenant_id, conversation_id: conversation.id, channel: "whatsapp", direction: "inbound",
        provider_message_id: item.message.providerMessageId, sender: item.message.sender, recipient: item.message.recipient,
        message_type: item.message.messageType, body: item.message.text, metadata_json: item.message.metadata, trace_id: traceId,
      }).select("id").single();
    if (messageError?.code === "23505") { duplicates += 1; continue; }
    if (messageError || !stored) return json({ error: "message_persist_failed" }, 500);

    const { data: job, error: jobError } = await db
      .from("automation_jobs")
      .upsert({
        tenant_id: connection.tenant_id, conversation_id: conversation.id, job_type: "auto_reply",
        trigger_message_id: stored.id, trace_id: traceId, status: "pending",
      }, { onConflict: "tenant_id,job_type,trigger_message_id", ignoreDuplicates: true })
      .select("id").maybeSingle();
    if (jobError) return json({ error: "job_queue_failed" }, 500);

    await audit(db, {
      p_tenant_id: connection.tenant_id, p_event_type: "MESSAGE_PERSISTED", p_actor_type: "external_contact",
      p_actor_id: item.message.sender, p_entity_type: "conversation_message", p_entity_id: stored.id,
      p_trace_id: traceId, p_payload: { conversation_id: conversation.id, provider_message_id: item.message.providerMessageId, direction: "inbound" }, p_note: null,
    });
    await audit(db, {
      p_tenant_id: connection.tenant_id, p_event_type: "WHATSAPP_MESSAGE_RECEIVED", p_actor_type: "external_contact",
      p_actor_id: item.message.sender, p_entity_type: "whatsapp_message", p_entity_id: item.message.providerMessageId,
      p_trace_id: traceId, p_payload: { message_type: item.message.messageType, phone_number_id: connection.phone_number_id, conversation_id: conversation.id }, p_note: null,
    });

    if (job?.id) {
      await audit(db, {
        p_tenant_id: connection.tenant_id, p_event_type: "AUTO_REPLY_QUEUED", p_actor_type: "system",
        p_actor_id: "automation", p_entity_type: "automation_job", p_entity_id: job.id,
        p_trace_id: traceId, p_payload: { conversation_id: conversation.id, trigger_message_id: stored.id }, p_note: null,
      });
      const task = fetch(PROCESS_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-bgd-ingress-secret": INGRESS_SECRET },
        body: JSON.stringify({ job_id: job.id }),
      }).catch((error) => console.error("wa-process dispatch failed", error));
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(task); else background.push(task);
    }
    accepted += 1;
  }

  if (background.length) await Promise.allSettled(background);
  return json({ status: "ok", accepted, duplicates, ignored });
});
