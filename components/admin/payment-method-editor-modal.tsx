"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { createClient } from "@/lib/supabase/client";
import { savePaymentMethod } from "@/app/admin/(protected)/payment-actions";
import type { AdminPaymentMethod } from "./types";

/* Small brand-token field label, mirroring the accessory editor. */
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

const inputClass =
  "min-h-tap w-full rounded-sm border border-border-soft bg-white px-4 py-2 text-body-base text-text-primary outline-none placeholder:text-text-secondary focus:border-border-accent focus:shadow-focus";

/**
 * Create / edit one payment type (channel + QR) in a modal.
 *
 * UPLOAD FLOW (same as the accessory editor): the QR file never passes through
 * the server action. When the admin picks an image, THIS client component
 * uploads it straight to the public `dress-photos` bucket, keeps only the public
 * URL in state, and on Save sends the URL — not the bytes — to the
 * `savePaymentMethod` action. New channels get a client-side uuid up front so
 * the QR can be filed under that id before the row exists.
 */
export function PaymentMethodEditorModal({
  method,
  onClose,
}: {
  method: AdminPaymentMethod | null;
  onClose: () => void;
}) {
  const isNew = method === null;
  const router = useRouter();
  const supabase = createClient();

  // A stable id for this edit session (new channels need one before upload).
  const [id] = useState(() => method?.id ?? crypto.randomUUID());

  const [name, setName] = useState(method?.name ?? "");
  const [qrUrl, setQrUrl] = useState<string | null>(method?.qrUrl ?? null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* --------------------------- upload --------------------------- */

  async function pickQr(file: File) {
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `payment-qr/${id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("dress-photos")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const url = supabase.storage.from("dress-photos").getPublicUrl(path).data
        .publicUrl;
      setQrUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "QR upload failed.");
    } finally {
      setUploading(false);
    }
  }

  /* --------------------------- save ----------------------------- */

  const canSave = name.trim().length > 0 && !uploading;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await savePaymentMethod({ id, name, qrUrl });
      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  /* ----------------------------- UI ----------------------------- */

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay-scrim" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(460px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border-soft bg-background-card shadow-float"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-4">
            <div>
              <Dialog.Title className="font-display text-display-md uppercase tracking-display text-text-accent">
                {isNew ? "New payment type" : name || "Edit payment type"}
              </Dialog.Title>
              <p className="text-body-sm text-text-secondary">
                {isNew ? "Add a payment channel" : "Edit payment channel"}
              </p>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="min-h-tap min-w-tap rounded-sm text-2xl leading-none text-text-secondary hover:text-text-heading focus-visible:shadow-focus"
            >
              ✕
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-4 overflow-y-auto px-6 py-6">
            {/* Name */}
            <div>
              <FieldLabel required hint="shown in the customer picker">
                Payment type
              </FieldLabel>
              <input
                className={inputClass}
                placeholder="e.g. GCash"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* QR image */}
            <div>
              <FieldLabel hint="customers scan this to pay">
                QR code
              </FieldLabel>
              {qrUrl ? (
                <div className="relative w-44">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrUrl}
                    alt={name ? `${name} QR code` : "QR code"}
                    className="block h-44 w-44 rounded-sm border border-border-soft object-contain bg-white"
                  />
                  <button
                    type="button"
                    aria-label="Remove QR code"
                    onClick={() => setQrUrl(null)}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-pill bg-background-inverse/75 text-xs text-text-on-primary"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="flex h-44 w-44 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed border-border-strong bg-white px-2 text-center text-body-sm text-text-secondary hover:border-brand-primary">
                  <span className="text-2xl leading-none text-brand-primary">
                    +
                  </span>
                  {uploading ? "Uploading…" : "Upload QR image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) pickQr(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <p className="mt-2 text-body-sm text-text-secondary">
                Optional — you can add the QR later. Until then the customer sees
                a &ldquo;QR coming soon&rdquo; placeholder for this channel.
              </p>
            </div>

            {error ? (
              <p className="text-body-sm text-state-error">{error}</p>
            ) : null}

            {/* Save */}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || isPending}
              className="min-h-tap rounded-pill bg-brand-primary px-5 text-label-base uppercase tracking-label text-text-on-primary transition-colors hover:bg-brand-primary-hover disabled:opacity-50 focus-visible:shadow-focus"
            >
              {isPending
                ? "Saving…"
                : isNew
                  ? "Add payment type"
                  : "Save changes"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
