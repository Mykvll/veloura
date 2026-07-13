// Retention cleanup for customer PII (Item 10, step 2).
//
// Deletes the ID photo + payment proof of bookings the admin flagged `invalid`
// (fake proof) from the private `payment-proofs` bucket, INVALID_GRACE_DAYS
// after the booking was created, and nulls the id_photo_url / proof_url columns
// that referenced them.
//
// Deliberately NARROW: legitimate rentals (pending or verified) are left
// untouched — we keep their ID/proof. Only flagged-fake bookings are purged.
// An `invalid` booking doesn't block dates (blocked_dates counts only
// pending/verified), so we keep the row itself for the admin's fraud record and
// strip just the PII files.
//
// NOT handled here: the "10-minute unpaid reservation hold" is a reserve-flow
// change tracked as a separate task.
//
// Auth: verify_jwt is disabled, so this checks its own header — the caller must
// present `x-cron-secret`, compared against a Supabase Vault secret via the
// verify_cron_secret() RPC (the secret value never leaves the database). The
// pg_cron job is the only intended caller.
//
// DB access: service_role has no direct DML on `bookings` in this project
// (anon-key + RLS design), so reads/writes go through the SECURITY DEFINER RPCs
// list_invalid_expired_pii() and clear_booking_files(), both granted only to
// service_role. Storage deletion uses the service_role key, which the Storage
// API authorizes directly.
//
// Files are deleted BEFORE the columns are nulled, so a storage failure leaves
// the path in the DB to retry next run rather than orphaning the file.

import { createClient } from "jsr:@supabase/supabase-js@2";

const INVALID_GRACE_DAYS = 7; // purge a flagged-fake booking's files this long after it was created

type BookingFiles = {
  id: string;
  id_photo_url: string | null;
  proof_url: string | null;
};

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

  // --- custom auth: shared secret, verified inside the DB against Vault ---
  const provided = req.headers.get("x-cron-secret") ?? "";
  const { data: authorized, error: authError } = await supabase.rpc(
    "verify_cron_secret",
    { candidate: provided },
  );
  if (authError) return json(500, { error: `auth check failed: ${authError.message}` });
  if (authorized !== true) return json(401, { error: "unauthorized" });

  // --- flagged-fake bookings past the grace window that still have files ---
  const { data, error } = await supabase.rpc("list_invalid_expired_pii", {
    grace_days: INVALID_GRACE_DAYS,
  });
  if (error) return json(500, { error: error.message });

  const bookings = (data ?? []) as BookingFiles[];
  if (bookings.length === 0) {
    return json(200, { ok: true, scanned: 0, filesDeleted: 0, bookingsCleared: 0 });
  }

  const paths = bookings.flatMap((b) =>
    [b.id_photo_url, b.proof_url].filter((p): p is string => Boolean(p)),
  );

  // Delete the files first. remove() returns the objects it actually deleted.
  const { data: removed, error: removeError } = await supabase.storage
    .from("payment-proofs")
    .remove(paths);
  if (removeError) return json(500, { error: `storage remove failed: ${removeError.message}` });
  const deleted = new Set((removed ?? []).map((o: { name: string }) => o.name));

  // Null a path column only once its object is confirmed gone, so we never drop
  // the reference to a file still sitting in the bucket.
  let bookingsCleared = 0;
  for (const b of bookings) {
    const clearId = b.id_photo_url != null && deleted.has(b.id_photo_url);
    const clearProof = b.proof_url != null && deleted.has(b.proof_url);
    if (!clearId && !clearProof) continue;
    const { error: clearError } = await supabase.rpc("clear_booking_files", {
      booking_id: b.id,
      clear_id: clearId,
      clear_proof: clearProof,
    });
    if (!clearError) bookingsCleared++;
  }

  return json(200, {
    ok: true,
    scanned: bookings.length,
    filesDeleted: deleted.size,
    bookingsCleared,
  });
});
