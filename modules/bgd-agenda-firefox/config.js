// BrasilGuard Agenda — configurações públicas de integração.
// NUNCA versionar senhas, service role ou tokens permanentes.
// GOOGLE_CLIENT_SECRET fica como marcador e é injetado apenas no build local de teste.
const BGD_CONFIG = {
  SUPABASE_URL: "https://zwtmcqtepkzxuhilxyjx.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_O-JhQJkS7jmHwPn7qYExZg_pjIyIZ-N",
  BACKEND_URL: "https://zwtmcqtepkzxuhilxyjx.supabase.co/functions/v1/bgd-agenda-appointments",
  PLATFORM_API_URL: "https://zwtmcqtepkzxuhilxyjx.supabase.co/functions/v1/bgd-agenda-platform-v3",
  PROFILE_API_URL: "https://zwtmcqtepkzxuhilxyjx.supabase.co/functions/v1/bgd-agenda-profile-v3",
  COMMERCE_API_URL: "https://zwtmcqtepkzxuhilxyjx.supabase.co/functions/v1/bgd-agenda-commerce-v1",
  // Só alterar para true após definir plano/preço, InfiniteTag e entrega de e-mail.
  COMMERCE_ENFORCED: false,
  DEFAULT_TENANT_SLUG: "brasilguard-default",
  API_VERSION: "v1",
  GOOGLE_CLIENT_ID: "752721916663-l59ed4t5h8bcts9b0pojk4ed7aca5l5n.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "MUDARASENHA",
  GOOGLE_SCOPE: "openid email profile https://www.googleapis.com/auth/calendar.events",
  WHATSAPP_PHONE_NUMBER_ID: "MUDARASENHA"
};
