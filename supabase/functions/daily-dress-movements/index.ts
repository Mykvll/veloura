// Daily 7am "dress movements" digest to the owner's Telegram group.
//
// Once a day it posts what physically moves today:
//   • DELIVERIES — verified rent bookings whose start_date is today (the dress
//     goes out to the renter).
//   • RETURNS    — verified rent bookings whose end_date is today (the dress is
//     due back). end_date is the last rental day; the +1 wash day is internal.
//
// Only VERIFIED rent bookings count (same bar as analytics); in-progress payment
// holds are excluded. If there is nothing to deliver or return today, it stays
// SILENT — no "all clear" ping — to keep the group quiet on empty days.
//
// Auth mirrors cleanup-holds / purge-expired-pii: verify_jwt is disabled and the
// caller must present the `x-cron-secret` header, checked against a Vault secret
// via verify_cron_secret(). The pg_cron job (0 23 * * * UTC = 7:00 AM Manila) is
// the only intended caller.
//
// DB access: service_role has no direct SELECT on `bookings` in this project
// (anon-key + RLS design), so today's movements come from the SECURITY DEFINER
// RPC list_daily_dress_movements(), and the Telegram credentials come from the
// Vault-backed get_telegram_config() RPC — both granted only to service_role.
// "Today" is computed inside the RPC in Asia/Manila, NOT here: at 23:00 UTC the
// server's UTC date is still yesterday.

import { createClient } from "jsr:@supabase/supabase-js@2";

type Movement = {
  kind: "delivery" | "return";
  dress_name: string | null;
  renter_name: string | null;
  contact: string | null;
  deliver_time: string | null;
  start_date: string | null;
  end_date: string | null;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** One booking line: dress — renter (time / contact). */
function line(m: Movement): string {
  const bits: string[] = [];
  if (m.deliver_time) bits.push(m.deliver_time);
  if (m.contact) bits.push(m.contact);
  const tail = bits.length ? ` (${bits.join(" · ")})` : "";
  return `• ${m.dress_name ?? "—"} — ${m.renter_name ?? "—"}${tail}`;
}

function buildMessage(movements: Movement[]): string {
  const deliveries = movements.filter((m) => m.kind === "delivery");
  const returns = movements.filter((m) => m.kind === "return");

  const today = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const parts: string[] = [`📦 Today's dress movements — ${today}`, ""];

  parts.push(`🚚 Deliveries (${deliveries.length})`);
  parts.push(
    deliveries.length ? deliveries.map(line).join("\n") : "• none",
  );
  parts.push("");
  parts.push(`↩️ Returns due (${returns.length})`);
  parts.push(returns.length ? returns.map(line).join("\n") : "• none");
  parts.push("");
  parts.push("🟢 LIVE — velourabycm.com");
  parts.push("Manage it › https://velourabycm.com/admin");

  return parts.join("\n");
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- custom auth: shared secret, verified inside the DB against Vault ---
  const provided = req.headers.get("x-cron-secret") ?? "";
  const { data: authorized, error: authError } = await supabase.rpc(
    "verify_cron_secret",
    { candidate: provided },
  );
  if (authError) return json(500, { error: `auth check failed: ${authError.message}` });
  if (authorized !== true) return json(401, { error: "unauthorized" });

  // --- today's deliveries + returns (verified rent bookings, Manila date) ---
  const { data, error } = await supabase.rpc("list_daily_dress_movements");
  if (error) return json(500, { error: error.message });

  const movements = (data ?? []) as Movement[];
  if (movements.length === 0) {
    // Nothing moves today — stay silent, but report it for the cron log.
    return json(200, { ok: true, movements: 0, sent: false });
  }

  // --- Telegram credentials from Vault via SECURITY DEFINER RPC ---
  const { data: cfg, error: cfgError } = await supabase.rpc("get_telegram_config");
  if (cfgError) return json(500, { error: `config load failed: ${cfgError.message}` });
  const conf = (Array.isArray(cfg) ? cfg[0] : cfg) as
    | { bot_token: string | null; chat_id: string | null }
    | null;
  if (!conf?.bot_token || !conf?.chat_id) {
    return json(500, { error: "telegram not configured (vault secrets missing)" });
  }

  // --- post the digest (plain text, no parse_mode — no escaping needed) ---
  const res = await fetch(
    `https://api.telegram.org/bot${conf.bot_token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: conf.chat_id,
        text: buildMessage(movements),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return json(502, { error: `telegram sendMessage failed: ${res.status} ${body}` });
  }

  return json(200, { ok: true, movements: movements.length, sent: true });
});
