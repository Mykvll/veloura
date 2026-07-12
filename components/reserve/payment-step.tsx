"use client";

import { useState, useTransition, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { createRentBooking, type RentBookingInput } from "@/app/reserve-actions";
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

/** A diagonal-stripe "placeholder" fill — the same treatment the prototype uses
 *  for the not-yet-uploaded QR / detail shots. */
const stripe =
  "repeating-linear-gradient(45deg,#F1E8D8,#F1E8D8 10px,#F7F1E6 10px,#F7F1E6 20px)";

/**
 * The payment step — the final step of the reserve wizard (design/index.html →
 * PaymentStep). Shows the amount due, a payment-channel picker, a QR placeholder
 * for the chosen channel, and a receipt upload. Submitting writes the booking.
 *
 * WHY THE BOOKING IS SAVED HERE (not earlier): a visitor (`anon`) can only
 * INSERT a booking, never UPDATE it (see the RLS policies in the data model). So
 * we collect everything across the wizard and write ONE row at the very end,
 * with the payment method + proof path attached. That also means "Cancel" needs
 * no server call — nothing was written yet, so the date was never held.
 *
 * PROOF UPLOAD: the screenshot goes straight to the PRIVATE `payment-proofs`
 * bucket from the browser (same pattern as the ID upload); only its storage
 * PATH is sent to the server action. We keep a local object-URL just to preview
 * it, since the bucket is private and has no public URL.
 */
export function PaymentStep({
  dressName,
  date,
  total,
  methods,
  input,
  onPaid,
  onCancel,
}: {
  dressName: string;
  /** The rental date (ISO), for the summary line. */
  date: string;
  /** Amount due now — dress fee plus any picked accessories. */
  total: number;
  /** The payment channels the admin has configured (with their QR images). */
  methods: PaymentOption[];
  /** Everything the rent form collected, minus the payment fields we add here. */
  input: Omit<RentBookingInput, "paymentMethod" | "proofPath">;
  onPaid: () => void;
  onCancel: () => void;
}) {
  const supabase = createClient();

  // The chosen channel (the whole row, so we have its QR + name), or null.
  const [selected, setSelected] = useState<PaymentOption | null>(null);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [warn, setWarn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    } catch (e) {
      console.error("Payment proof upload failed", e);
      setError("Sorry — your receipt didn't upload. Please try again.");
      setProofPath(null);
      setProofPreview(null);
    } finally {
      setUploading(false);
    }
  }

  const canSubmit = !!selected && !!proofPath && !uploading;

  function handleSubmit() {
    if (!selected || !proofPath) return;
    setError(null);
    startTransition(async () => {
      const res = await createRentBooking({
        ...input,
        paymentMethod: selected.name,
        proofPath,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      onPaid();
    });
  }

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

      {/* Right: amount due, channel picker, receipt upload, submit / cancel. */}
      <div className="flex flex-col gap-3.5">
        <div className="rounded-md bg-background-panel p-3 text-body-sm text-text-primary">
          <b>{dressName}</b> · {niceDate(date)}
          <div className="mt-0.5 text-text-secondary">
            Amount due now:{" "}
            <b className="text-text-accent">
              ₱{total.toLocaleString("en-PH")}
            </b>{" "}
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
                    onClick={() => setSelected(m)}
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
                onClick={onCancel}
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
