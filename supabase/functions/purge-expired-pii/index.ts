// Retention cleanup for customer PII (Item 10, step 2).
//
// TWO passes, both over the private `payment-proofs` bucket:
//
//  1. INVALID bookings (flagged-fake proof): delete the ID photo + payment proof
//     INVALID_GRACE_DAYS after the booking was created, and null the
//     id_photo_url / proof_url columns. Unchanged, long-standing behaviour — a
//     fake proof is NOT backed up.
//
//  2. COMPLETED rentals (legitimate, dress returned): once the retention window
//     has elapsed (return day = end_date + 1, plus COMPLETED_GRACE_DAYS), BACK
//     UP the ID photo + payment proof to the owner's Google Drive, and only
//     AFTER a confirmed upload delete them from storage + null the columns.
//     Covers verified rentals and pending rentals whose return day is long past
//     (see list_completed_expired_pii). Nothing is ever deleted that wasn't
//     archived first.
//
//     Each booking gets its own readably-named Drive subfolder
//     ("2026-07-20 - Mara Santos - Zolana") holding "ID.<ext>" and
//     "payment-proof.<ext>", so the owner can find a specific customer's records.
//
// DRY_RUN gate: while true, pass 2 uploads to Drive (subfolder name prefixed
// "DRYRUN - ") but deletes NOTHING. Flip to false + redeploy to go live.
//
// Auth: verify_jwt is disabled, so this checks its own header — the caller must
// present `x-cron-secret`, compared against a Supabase Vault secret via the
// verify_cron_secret() RPC. The pg_cron job is the only intended caller.
//
// DB access: service_role has no direct DML on `bookings` (anon-key + RLS
// design), so reads/writes go through the SECURITY DEFINER RPCs
// list_invalid_expired_pii(), list_completed_expired_pii() and
// clear_booking_files(), all granted only to service_role. Storage + Drive use
// service_role / the owner's OAuth token respectively.
//
// Files are deleted BEFORE the columns are nulled (and, in pass 2, uploaded
// before either), so a failure leaves the path in the DB to retry next run
// rather than orphaning a file or dropping a reference to one still present.

import { createClient } from "jsr:@supabase/supabase-js@2";

const INVALID_GRACE_DAYS = 7; // purge a flagged-fake booking's files this long after it was created
const COMPLETED_GRACE_DAYS = 5; // purge a returned rental's files this long after its return day
const DRY_RUN = false; // pass 2: back up to Drive, then delete the archived files

const BUCKET = "payment-proofs";
const FOLDER_MIME = "application/vnd.google-apps.folder";

type BookingFiles = {
  id: string;
  id_photo_url: string | null;
  proof_url: string | null;
  // Present on the completed-rental pass (used to name the Drive subfolder).
  renter_name?: string | null;
  dress_name?: string | null;
  end_date?: string | null;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Best-effort MIME from a storage path (Supabase download usually sets it too). */
function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

/** File extension from a storage path (defaults to "bin"). */
function extFromPath(path: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "bin";
}

/** Drive names aren't a real filesystem, but keep them tidy and slash-free. */
function tidyName(s: string): string {
  return s.replace(/[/\\]+/g, "-").replace(/\s+/g, " ").trim();
}

/** Exchange the stored refresh token for a short-lived Drive access token. */
async function driveAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GDRIVE_CLIENT_ID")!,
      client_secret: Deno.env.get("GDRIVE_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GDRIVE_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`drive token exchange failed: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

/** Find (or create) a subfolder by name under `parentId`; returns its id. With
 *  the drive.file scope the query only sees folders THIS app created, so this
 *  reuses a booking's folder on a retry instead of duplicating it. */
async function findOrCreateFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string> {
  const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `name = '${escaped}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const listData = await listRes.json();
  if (Array.isArray(listData.files) && listData.files.length > 0) {
    return listData.files[0].id as string;
  }
  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    },
  );
  const createData = await createRes.json();
  if (!createData.id) {
    throw new Error(`folder create failed: ${JSON.stringify(createData)}`);
  }
  return createData.id as string;
}

/** Multipart-upload one file into `folderId`; returns the new file id. */
async function driveUpload(
  accessToken: string,
  folderId: string,
  name: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const boundary = `veloura-${crypto.randomUUID()}`;
  const enc = new TextEncoder();
  const meta = JSON.stringify({ name, parents: [folderId] });
  const pre = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${meta}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mime}\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0);
  body.set(bytes, pre.length);
  body.set(post, pre.length + bytes.length);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const data = await res.json();
  if (!data.id) {
    throw new Error(`drive upload failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.id as string;
}

/** "2026-07-20 - Mara Santos - Zolana" (skips missing parts). */
function backupFolderName(b: BookingFiles): string {
  const parts = [b.end_date, b.renter_name, b.dress_name].filter(
    (p): p is string => Boolean(p),
  );
  const base = parts.length > 0 ? parts.join(" - ") : b.id;
  return tidyName(`${DRY_RUN ? "DRYRUN - " : ""}${base}`);
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

  // =====================================================================
  // PASS 1 — flagged-fake bookings past the grace window (delete, no backup)
  // =====================================================================
  const invalidResult = { scanned: 0, filesDeleted: 0, bookingsCleared: 0 };
  {
    const { data, error } = await supabase.rpc("list_invalid_expired_pii", {
      grace_days: INVALID_GRACE_DAYS,
    });
    if (error) return json(500, { error: error.message });

    const bookings = (data ?? []) as BookingFiles[];
    invalidResult.scanned = bookings.length;
    if (bookings.length > 0) {
      const paths = bookings.flatMap((b) =>
        [b.id_photo_url, b.proof_url].filter((p): p is string => Boolean(p)),
      );
      const { data: removed, error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove(paths);
      if (removeError) return json(500, { error: `storage remove failed: ${removeError.message}` });
      const deleted = new Set((removed ?? []).map((o: { name: string }) => o.name));
      invalidResult.filesDeleted = deleted.size;

      for (const b of bookings) {
        const clearId = b.id_photo_url != null && deleted.has(b.id_photo_url);
        const clearProof = b.proof_url != null && deleted.has(b.proof_url);
        if (!clearId && !clearProof) continue;
        const { error: clearError } = await supabase.rpc("clear_booking_files", {
          booking_id: b.id,
          clear_id: clearId,
          clear_proof: clearProof,
        });
        if (!clearError) invalidResult.bookingsCleared++;
      }
    }
  }

  // =====================================================================
  // PASS 2 — completed rentals: BACK UP to Drive, then (unless DRY_RUN) delete
  // =====================================================================
  const completedResult = {
    dryRun: DRY_RUN,
    scanned: 0,
    filesBackedUp: 0,
    filesDeleted: 0,
    bookingsCleared: 0,
    errors: [] as string[],
  };
  {
    const { data, error } = await supabase.rpc("list_completed_expired_pii", {
      grace_days: COMPLETED_GRACE_DAYS,
    });
    if (error) {
      completedResult.errors.push(`list failed: ${error.message}`);
    } else {
      const bookings = (data ?? []) as BookingFiles[];
      completedResult.scanned = bookings.length;

      if (bookings.length > 0) {
        let accessToken: string;
        const rootFolderId = Deno.env.get("GDRIVE_BACKUP_FOLDER_ID")!;
        try {
          accessToken = await driveAccessToken();
        } catch (e) {
          // No Drive access → back up nothing → delete nothing. Report and stop
          // pass 2 so we never delete a file we couldn't archive.
          completedResult.errors.push(String((e as Error).message));
          return json(200, { ok: true, invalid: invalidResult, completed: completedResult });
        }

        for (const b of bookings) {
          const files: { col: "id" | "proof"; path: string }[] = [];
          if (b.id_photo_url) files.push({ col: "id", path: b.id_photo_url });
          if (b.proof_url) files.push({ col: "proof", path: b.proof_url });

          // One readably-named subfolder per booking; created lazily on the first
          // file we actually manage to download.
          let bookingFolderId: string | null = null;
          const backedUp: { col: "id" | "proof"; path: string }[] = [];

          for (const f of files) {
            try {
              const { data: blob, error: dlError } = await supabase.storage
                .from(BUCKET)
                .download(f.path);
              if (dlError || !blob) {
                completedResult.errors.push(`download ${f.path}: ${dlError?.message ?? "missing"}`);
                continue;
              }
              const bytes = new Uint8Array(await blob.arrayBuffer());
              if (!bookingFolderId) {
                bookingFolderId = await findOrCreateFolder(
                  accessToken,
                  rootFolderId,
                  backupFolderName(b),
                );
              }
              const fname =
                (f.col === "id" ? "ID" : "payment-proof") + "." + extFromPath(f.path);
              await driveUpload(
                accessToken,
                bookingFolderId,
                fname,
                bytes,
                blob.type || mimeFromPath(f.path),
              );
              completedResult.filesBackedUp++;
              backedUp.push(f);
            } catch (e) {
              completedResult.errors.push(`backup ${f.path}: ${(e as Error).message}`);
            }
          }

          if (DRY_RUN || backedUp.length === 0) continue;

          // Delete only the files we archived, then null just those columns.
          const paths = backedUp.map((f) => f.path);
          const { data: removed, error: rmError } = await supabase.storage
            .from(BUCKET)
            .remove(paths);
          if (rmError) {
            completedResult.errors.push(`remove ${b.id}: ${rmError.message}`);
            continue;
          }
          const deleted = new Set((removed ?? []).map((o: { name: string }) => o.name));
          completedResult.filesDeleted += deleted.size;

          const clearId = backedUp.some((f) => f.col === "id" && deleted.has(f.path));
          const clearProof = backedUp.some((f) => f.col === "proof" && deleted.has(f.path));
          if (!clearId && !clearProof) continue;
          const { error: clearError } = await supabase.rpc("clear_booking_files", {
            booking_id: b.id,
            clear_id: clearId,
            clear_proof: clearProof,
          });
          if (!clearError) completedResult.bookingsCleared++;
        }
      }
    }
  }

  return json(200, { ok: true, invalid: invalidResult, completed: completedResult });
});
