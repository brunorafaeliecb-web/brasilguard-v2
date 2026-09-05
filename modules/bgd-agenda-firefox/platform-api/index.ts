import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * BrasilGuard Agenda v0003.a — Platform API foundation.
 *
 * Este arquivo é mantido separado do backend legado `bgd-agenda-appointments`
 * para permitir migração progressiva sem quebrar o MVP v0002.b.
 *
 * Rotas públicas nunca retornam PII de agendamentos. Rotas protegidas devem
 * validar membership/RBAC por tenant e nunca confiar apenas no ID da entidade.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-google-access-token, content-type, idempotency-key, x-bgd-tenant",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function dbClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("configuration_pending:MUDARASENHA");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function tenantBySlug(db: any, slug: string) {
  const { data, error } = await db.from("bgd_tenants")
    .select("id,name,slug,timezone,locale,currency,status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("tenant_not_found");
  return data;
}

async function publicBootstrap(db: any, slug: string) {
  const tenant = await tenantBySlug(db, slug);
  const [branding, services, professionals] = await Promise.all([
    db.from("bgd_tenant_branding").select("*").eq("tenant_id", tenant.id).maybeSingle(),
    db.from("bgd_agenda_services")
      .select("id,name,duration_minutes,buffer_before_minutes,buffer_after_minutes")
      .eq("tenant_id", tenant.id).eq("active", true).order("name"),
    db.from("bgd_agenda_professionals")
      .select("id,name,photo_url,specialty")
      .eq("tenant_id", tenant.id).eq("active", true).order("name"),
  ]);

  if (branding.error) throw branding.error;
  if (services.error) throw services.error;
  if (professionals.error) throw professionals.error;

  return {
    tenant,
    branding: branding.data,
    services: services.data || [],
    professionals: professionals.data || [],
  };
}

async function isBusy(db: any, tenantId: string, professionalId: string | null, startsAt: Date, duration: number) {
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);

  let appointments = db.from("bgd_appointments")
    .select("id,starts_at,duration_minutes")
    .eq("tenant_id", tenantId)
    .in("status", ["scheduled", "confirmed", "rescheduled"])
    .lt("starts_at", endsAt.toISOString());
  if (professionalId) appointments = appointments.eq("professional_id", professionalId);
  const a = await appointments;
  if (a.error) throw a.error;
  const appointmentConflict = (a.data || []).some((row: any) => {
    const otherStart = new Date(row.starts_at).getTime();
    const otherEnd = otherStart + Number(row.duration_minutes) * 60_000;
    return startsAt.getTime() < otherEnd && otherStart < endsAt.getTime();
  });
  if (appointmentConflict) return true;

  let external = db.from("bgd_external_calendar_events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "busy")
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString())
    .limit(1);
  if (professionalId) external = external.eq("professional_id", professionalId);
  const e = await external;
  if (e.error) throw e.error;
  return (e.data || []).length > 0;
}

async function publicSchedule(db: any, slug: string, url: URL) {
  const tenant = await tenantBySlug(db, slug);
  const date = url.searchParams.get("date") || "";
  const professionalId = url.searchParams.get("professional_id");
  const duration = Math.max(5, Number(url.searchParams.get("duration") || 60));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid_date");

  const weekday = new Date(`${date}T12:00:00`).getDay();
  let hours = professionalId
    ? db.from("bgd_agenda_professional_hours").select("starts_at,ends_at")
        .eq("tenant_id", tenant.id).eq("professional_id", professionalId).eq("weekday", weekday).eq("active", true)
    : db.from("bgd_agenda_business_hours").select("starts_at,ends_at")
        .eq("tenant_id", tenant.id).eq("weekday", weekday).eq("active", true);
  const h = await hours;
  if (h.error) throw h.error;

  const slots: Array<{ startsAt: string; status: "free" | "busy"; label: "LIVRE" | "OCUPADO" }> = [];
  for (const range of h.data || []) {
    const start = new Date(`${date}T${String(range.starts_at).slice(0, 8)}`);
    const end = new Date(`${date}T${String(range.ends_at).slice(0, 8)}`);
    for (let cursor = start.getTime(); cursor + duration * 60_000 <= end.getTime(); cursor += 30 * 60_000) {
      const slotStart = new Date(cursor);
      const busy = await isBusy(db, tenant.id, professionalId, slotStart, duration);
      slots.push({ startsAt: slotStart.toISOString(), status: busy ? "busy" : "free", label: busy ? "OCUPADO" : "LIVRE" });
    }
  }
  return { tenantId: tenant.id, date, professionalId, durationMinutes: duration, slots };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = dbClient();
    const url = new URL(req.url);
    const bootstrap = url.pathname.match(/\/api\/v1\/public\/([^/]+)\/bootstrap$/);
    const schedule = url.pathname.match(/\/api\/v1\/public\/([^/]+)\/schedule$/);

    if (req.method === "GET" && bootstrap) {
      return json({ ok: true, ...(await publicBootstrap(db, decodeURIComponent(bootstrap[1]))) });
    }
    if (req.method === "GET" && schedule) {
      return json({ ok: true, ...(await publicSchedule(db, decodeURIComponent(schedule[1]), url)) });
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    const message = String((error as any)?.message || error);
    const status = message === "tenant_not_found" ? 404 : message === "invalid_date" ? 400 : 500;
    return json({ ok: false, error: message }, status);
  }
});
