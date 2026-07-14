"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { attachRentPayment, releaseRentHold } from "@/app/reserve-actions";
import { patchHold, clearHold } from "@/lib/hold-storage";
import { niceDate } from "@/lib/reserve";

/* Small brand-token field label, mirroring the rent form. */
function FieldLabel({
  children,
  required,
  hint,
}: {
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
      <span className="text-label-sm uppercase tracking-label text-text-heading">
        {children}
        {required ? <span className="text-text-accent"> *</span> : null}
      </span>
      {hint ? (
        <span className="text-body-sm text-text-secondary">{hint}</span>
      ) : null}
    </div>
  );
}

/** A payment channel the customer can pay with — comes from the admin-managed
 *  `payment_methods` table (see the Payments section in /admin). `qrUrl` is the
 *  public URL of the channel's QR image, or null until the admin uploads one. */
export type PaymentOption = {
  id: string;
  name: string;
  qrUrl: string | null;
};

/** A diagonal-stripe "placeholder" fill for not-yet-uploaded QR / detail shots. */
const stripe =
  "repeating-linear-gradient(45deg,#F1E8D8,#F1E8D8 10px,#F7F1E6 10px,#F7F1E6 20px)";

/** Format a millisecond span as "m:ss" (floored at 0). */
function formatLeft(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(secs / 60);
  return `${m}:${String(secs % 60).padStart(2, "0")}`;
}

/**
 * The payment step — the final step of the reserve wizard, shown once the date
 * is HELD (a `hold` booking already exists). The customer has a 10-minute window
 * to pay and submit proof; submitting turns the hold into a `pending` booking.
 *
 * COUNTDOWN: anchored to the server clock. The hold's `holdExpiresAt` and the
 * server's `serverNow` at creation are translated into one local deadline, so a
 * skewed device clock can't mis-time it, and a refresh (which re-reads the same
 * server values via get_hold_status) resumes exactly where it should. The DB
 * expiry is 11 minutes but the UI window is 10 — the extra minute is grace so a
 * submit fired at 0:00 still lands in time.
 *
 * PROOF UPLOAD: the screenshot goes straight to the PRIVATE `payment-proofs`
 * bucket from the browser; only its storage PATH is sent to the server. We keep
 * a local object-URL just to preview it (the bucket is private, no public URL).
 */
export function PaymentStep({
  dressName,
  date,
  total,
  methods,
  bookingId,
  holdExpiresAt,
  serverNow,
  initialMethodId,
  initialProofPath,
  onPaid,
  onCancel,
  onExpire,
}: {
  dressName: string;
  /** The rental date (ISO), for the summary line. */
  date: string;
  /** Amount due now — dress fee plus any picked accessories. */
  total: number;
  /** The payment channels the admin has configured (with their QR images). */
  methods: PaymentOption[];
  /** The held booking this payment attaches to. */
  bookingId: string;
  /** ISO timestamp the hold lapses (server clock). */
  holdExpiresAt: string;
  /** Server "now" when the hold was (re)read — pairs with holdExpiresAt. */
  serverNow: string;
  /** Restored on a refresh-resume: previously chosen channel / uploaded proof. */
  initialMethodId?: string;
  initialProofPath?: string;
  onPaid: () => void;
  onCancel: () => void;
  /** The window lapsed before payment — send the customer back to pick a date. */
  onExpire: () => void;
}) {
  const supabase = createClient();

  const [selected, setSelected] = useState<PaymentOption | null>(
    initialMethodId
      ? (methods.find((m) => m.id === initialMethodId) ?? null)
      : null,
  );
  const [proofPath, setProofPath] = useState<string | null>(
    initialProofPath ?? null,
  );
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [warn, setWarn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Milliseconds left in the UI window (null until the effect anchors it).
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    // Anchor the countdown to the SERVER clock once, on mount: translate the
    // server expiry into a local deadline. UI window = DB expiry − the 1-minute
    // grace, so the customer sees 10:00 while the DB holds for 11:00.
    const uiDeadline =
      Date.now() +
      (new Date(holdExpiresAt).getTime() - new Date(serverNow).getTime()) -
      60_000;
    const tick = (): boolean => {
      const left = uiDeadline - Date.now();
      setRemaining(left);
      if (left <= 0) {
        setExpired(true);
        return true; // stop
      }
      return false;
    };
    if (tick()) return;
    const id = setInterval(() => {
      if (tick()) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt, serverNow]);

  async function uploadProof(file: File) {
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `proofs/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw new Error(upErr.message);
      setProofPath(path);
      setProofPreview(URL.createObjectURL(file));
      patchHold({ proofPath: path }); // survive a refresh
    } catch (e) {
      console.error("Payment proof upload failed", e);
      setError("Sorry — your receipt didn't upload. Please try again.");
      setProofPath(null);
      setProofPreview(null);
    } finally {
      setUploading(false);
    }
  }

  function chooseMethod(m: PaymentOption) {
    setSelected(m);
    patchHold({ methodId: m.id }); // survive a refresh
  }

  const canSubmit = !!selected && !!proofPath && !uploading && !expired;

  function handleSubmit() {
    if (!selected || !proofPath) return;
    setError(null);
    startTransition(async () => {
      const res = await attachRentPayment(bookingId, selected.name, proofPath);
      if (res.error) {
        setError(res.error);
        if (res.error.toLowerCase().includes("expired")) setExpired(true);
        return;
      }
      clearHold();
      onPaid();
    });
  }

  function handleCancel() {
    clearHold();
    void releaseRentHold(bookingId); // free the date now
    onCancel();
  }

  // Window lapsed before payment — the hold is released (server-side + swept).
  if (expired) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3.5 py-8 text-center">
        <div className="font-display text-display-lg uppercase tracking-display text-text-accent">
          Time&apos;s up
        </div>
        <p className="text-body-base text-text-primary">
          Your payment window closed, so <b>{dressName}</b> for{" "}
          <b>{niceDate(date)}</b> has been released. Please pick your date again
          to try once more.
        </p>
        <button
          type="button"
          onClick={() => {
            clearHold();
            onExpire();
          }}
          className="mt-1 flex min-h-tap items-center justify-center rounded-pill bg-brand-primary px-[26px] text-label-base uppercase tracking-label text-text-on-primary transition-fast hover:bg-brand-primary-hover active:bg-brand-primary-active"
        >
          Pick a date again
        </button>
      </div>
    );
  }

  // Under two minutes turns the timer red to nudge the customer.
  const urgent = remaining !== null && remaining <= 120_000;

  return (
    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
      {/* Left: QR for the chosen channel, or the uploaded proof once attached. */}
      <div className="flex flex-col gap-3">
        {proofPreview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proofPreview}
              alt="Your payment proof"
              className="mx-auto block w-full max-w-[300px] rounded-md border border-border-soft"
            />
            <div className="text-center text-label-sm uppercase tracking-label text-state-success">
              Payment proof attached
            </div>
          </>
        ) : proofPath ? (
          // Resumed after a refresh: we have the path but not the preview image.
          <div className="mx-auto flex aspect-square w-full max-w-[300px] items-center justify-center rounded-md border border-border-soft bg-background-panel p-5 text-center">
            <span className="text-label-sm uppercase tracking-label text-state-success">
              Payment proof attached
            </span>
          </div>
        ) : selected ? (
          <>
            {selected.qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.qrUrl}
                alt={`${selected.name} QR code`}
                className="mx-auto block aspect-square w-full max-w-[300px] rounded-md border border-border-soft bg-white object-contain"
              />
            ) : (
              <div
                className="mx-auto flex aspect-square w-full max-w-[300px] items-center justify-center rounded-md border border-border-soft p-5 text-center"
                style={{ background: stripe }}
              >
                <span className="font-mono text-body-sm text-text-secondary">
                  {selected.name} QR — coming soon
                  <br />
                  (message us and we&apos;ll send it)
                </span>
              </div>
            )}
            <p className="text-center text-body-sm text-text-secondary">
              Scan with your {selected.name} app, then upload your receipt on the
              right.
            </p>
          </>
        ) : (
          <p className="px-5 py-10 text-center text-body-sm text-text-secondary">
            Choose a payment option to show its QR code.
          </p>
        )}
      </div>

      {/* Right: countdown, amount due, channel picker, receipt upload, submit. */}
      <div className="flex flex-col gap-3.5">
        {/* Payment-window countdown. */}
        <div
          className={`flex items-center justify-between rounded-md px-3 py-2 text-body-sm ${
            urgent
              ? "bg-state-error/10 text-state-error"
              : "bg-background-panel text-text-primary"
          }`}
        >
          <span className="text-label-sm uppercase tracking-label">
            Time left to pay
          </span>
          <span className="font-mono text-price-lg tabular-nums">
            {remaining === null ? "—:—" : formatLeft(remaining)}
          </span>
        </div>

        <div className="rounded-md bg-background-panel p-3 text-body-sm text-text-primary">
          <b>{dressName}</b> · {niceDate(date)}
          <div className="mt-0.5 text-text-secondary">
            Amount due now:{" "}
            <b className="text-text-accent">₱{total.toLocaleString("en-PH")}</b>{" "}
            — full payment · only paid reservations secure the date
          </div>
        </div>

        <div>
          <FieldLabel required>Payment option</FieldLabel>
          {methods.length === 0 ? (
            <p className="rounded-sm border border-dashed border-border-strong bg-background-panel px-4 py-3 text-body-sm text-text-secondary">
              No payment options are set up yet — please message us and we&apos;ll
              help you pay.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {methods.map((m) => {
                const sel = selected?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => chooseMethod(m)}
                    className={`min-h-tap rounded-sm border px-1 text-label-sm uppercase tracking-wide transition-fast ${
                      sel
                        ? "border-brand-primary bg-brand-primary text-text-on-primary"
                        : "border-border-soft bg-white text-text-primary hover:border-brand-primary"
                    }`}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <FieldLabel required hint="screenshot or take a photo">
            Upload receipt
          </FieldLabel>
          <label className="flex min-h-tap cursor-pointer items-center gap-2.5 rounded-sm border border-dashed border-border-strong bg-white px-4 py-2 text-body-sm text-text-secondary hover:border-brand-primary">
            <span className="text-brand-primary">⬆</span>
            <span className={proofPath ? "text-text-primary" : ""}>
              {uploading
                ? "Uploading…"
                : proofPath
                  ? "Replace payment proof"
                  : "Tap to upload or take a photo"}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadProof(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {error ? (
          <p className="text-body-sm text-state-error">{error}</p>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || isPending}
          className="flex h-[52px] w-full items-center justify-center rounded-pill bg-brand-primary px-6 text-label-base uppercase tracking-label text-text-on-primary transition-fast hover:bg-brand-primary-hover active:bg-brand-primary-active disabled:opacity-50"
        >
          {isPending ? "Submitting…" : "Submit payment proof"}
        </button>

        {/* Cancel is the ONLY way out of this step, and it warns first. */}
        {warn ? (
          <div className="flex flex-col gap-2.5 rounded-md border border-state-error bg-background-panel p-3.5">
            <p className="text-body-sm text-text-primary">
              Cancel this reservation? Your chosen date will be released and may
              be taken by someone else.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleCancel}
                className="flex min-h-tap items-center justify-center rounded-pill border border-state-error px-4 text-label-sm uppercase tracking-label text-state-error transition-fast hover:bg-background-card"
              >
                Yes, cancel
              </button>
              <button
                type="button"
                onClick={() => setWarn(false)}
                className="flex min-h-tap items-center justify-center rounded-pill px-4 text-label-sm uppercase tracking-label text-text-secondary transition-fast hover:text-text-heading"
              >
                Keep my reservation
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setWarn(true)}
            className="flex min-h-tap w-full items-center justify-center rounded-pill px-6 text-label-base uppercase tracking-label text-text-secondary transition-fast hover:text-text-heading"
          >
            Cancel reservation
          </button>
        )}
      </div>
    </div>
  );
}
