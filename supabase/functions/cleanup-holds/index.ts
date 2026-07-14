// Reclaim lapsed rent holds (payment-hold feature).
//
// A 'hold' booking reserves its dates for a 10-minute payment window. If the
// customer never pays, the row must be removed and the ID photo they uploaded
// during the hold deleted (PII hygiene). The time-aware `blocked_dates` view
// already stops counting an expired hold the instant it lapses, so this sweep
// is not on the critical path for freeing a date — it's housekeeping, run every
// few minutes.
//
// Auth mirrors purge-expired-pii: verify_jwt is disabled and the caller must
// present the `x-cron-secret` header, checked against a Vault secret via the
// verify_cron_secret() RPC. DB writes go through the purge_expired_holds()
// SECURITY DEFINER RPC (service_role has no direct DML on bookings here).

import { createClient } from "jsr:@supabase/supabase-js@2";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const provided = req.headers.get("x-cron-secret") ?? "";
  const { data: authorized, error: authError } = await supabase.rpc(
    "verify_cron_secret",
    { candidate: provided },
  );
  if (authError) return json(500, { error: `auth check failed: ${authError.message}` });
  if (authorized !== true) return json(401, { error: "unauthorized" });

  // Delete lapsed holds; get back their ID-photo paths to remove from storage.
  const { data, error } = await supabase.rpc("purge_expired_holds");
  if (error) return json(500, { error: error.message });

  const paths = ((data ?? []) as string[]).filter(Boolean);
  let filesDeleted = 0;
  if (paths.length > 0) {
    const { data: removed, error: removeError } = await supabase.storage
      .from("payment-proofs")
      .remove(paths);
    if (removeError) {
      // Rows are already gone; a storage failure just leaves orphan ID files for
      // the (separate) orphan sweep. Log rather than fail.
      console.error("cleanup-holds: storage remove failed:", removeError.message);
    } else {
      filesDeleted = removed?.length ?? 0;
    }
  }

  return json(200, { ok: true, holdsPurged: paths.length, filesDeleted });
});
