"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { createClient } from "@/lib/supabase/client";
import { saveAccessory } from "@/app/admin/(protected)/accessory-actions";
import { accAvail } from "@/lib/accessories";
import type { AdminAccessory } from "./types";

/* Small brand-token field primitives, mirroring the dress editor. */

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
 * One labelled −/+ counter row for the inventory section. `labelColor` tints
 * the label to match the design (heading for owned, taupe for on-rent, red for
 * unavailable). The parent owns the clamping in onDec/onInc.
 */
function Stepper({
  label,
  hint,
  value,
  labelColor = "text-text-heading",
  onDec,
  onInc,
}: {
  label: string;
  hint: string;
  value: number;
  labelColor?: string;
  onDec: () => void;
  onInc: () => void;
}) {
  const stepBtn =
    "flex h-10 w-10 flex-none items-center justify-center rounded-pill border border-border-soft bg-white text-2xl leading-none text-text-accent hover:bg-background-panel";
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-background-panel px-3.5 py-2.5">
      <div className="min-w-0">
        <div
          className={`text-label-sm uppercase tracking-label ${labelColor}`}
        >
          {label}
        </div>
        <div className="mt-0.5 text-body-sm text-text-secondary">{hint}</div>
      </div>
      <div className="flex flex-none items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={onDec}
          className={stepBtn}
        >
          −
        </button>
        <span className="min-w-7 text-center text-price-base text-text-heading">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={onInc}
          className={stepBtn}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Create / edit one accessory in a modal.
 *
 * UPLOAD FLOW (same as the dress editor): the image file never passes through
 * the server action. When the admin picks a file, THIS client component uploads
 * it straight to the public `dress-photos` bucket (that bucket also holds
 * accessory images per the data model), keeps only the public URL in state, and
 * on Save sends the URL — not the bytes — to the `saveAccessory` action. New
 * accessories get a client-side uuid up front so the image can be filed under
 * that id before the row exists.
 */
export function AccessoryEditorModal({
  accessory,
  onClose,
}: {
  accessory: AdminAccessory | null;
  onClose: () => void;
}) {
  const isNew = accessory === null;
  const router = useRouter();
  const supabase = createClient();

  // A stable id for this edit session (new accessories need one before upload).
  const [id] = useState(() => accessory?.id ?? crypto.randomUUID());

  const [name, setName] = useState(accessory?.name ?? "");
  // Sensible starting values for a blank accessory.
  const [price, setPrice] = useState<number>(accessory?.price ?? 80);
  const [cost, setCost] = useState<number>(accessory?.cost ?? 200);
  // Per-unit inventory: total owned, out on rent, and pulled from service.
  // rented + unavailableUnits are kept ≤ stock by the stepper handlers below.
  const [stock, setStock] = useState<number>(accessory?.stock ?? 1);
  const [rented, setRented] = useState<number>(accessory?.rented ?? 0);
  const [unavailableUnits, setUnavailableUnits] = useState<number>(
    accessory?.unavailableUnits ?? 0,
  );
  const [imageUrl, setImageUrl] = useState<string | null>(
    accessory?.imageUrl ?? null,
  );

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* --------------------------- upload --------------------------- */

  async function pickImage(file: File) {
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `accessories/${id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("dress-photos")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const url = supabase.storage.from("dress-photos").getPublicUrl(path).data
        .publicUrl;
      setImageUrl(url);
    } catch (e) {
      console.error("Accessory photo upload failed", e);
      setError("Couldn't upload the photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  /* --------------------------- save ----------------------------- */

  const canSave = name.trim().length > 0 && !uploading;
  // Lock the upload tile while a file is uploading or the save is in flight —
  // a photo added mid-save wouldn't make it into the row being written.
  const uploadLocked = uploading || isPending;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveAccessory({
        id,
        name,
        price,
        cost,
        stock,
        rented,
        unavailableUnits,
        imageUrl,
      });
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
              <Dialog.Title className="font-display text-display-lg uppercase tracking-display text-text-accent md:text-display-xl">
                {isNew ? "New accessory" : name || "Edit accessory"}
              </Dialog.Title>
              <p className="text-body-sm text-text-secondary">
                {isNew ? "Add to accessories" : "Edit accessory"}
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
              <FieldLabel required>Accessory name</FieldLabel>
              <input
                className={inputClass}
                placeholder="e.g. Pearl drop earrings"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Photo */}
            <div>
              <FieldLabel hint="shown to customers in the rental picker">
                Photo
              </FieldLabel>
              {imageUrl ? (
                <div className="relative w-36">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={name || "Accessory"}
                    className="block h-36 w-36 rounded-sm border border-border-soft object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setImageUrl(null)}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-pill bg-background-inverse/75 text-xs text-text-on-primary"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label
                  className={`flex h-36 w-36 flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed border-border-strong bg-white px-2 text-center text-body-sm text-text-secondary ${
                    uploadLocked
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer hover:border-brand-primary"
                  }`}
                >
                  <span className="text-2xl leading-none text-brand-primary">
                    +
                  </span>
                  {uploading ? "Uploading…" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadLocked}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) pickImage(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            {/* Rental price + unit cost */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required hint="rental add-on">
                  Rental price (₱)
                </FieldLabel>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
              </div>
              <div>
                <FieldLabel required hint="what you paid">
                  Unit cost (₱)
                </FieldLabel>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={cost}
                  onChange={(e) => setCost(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Inventory — three counters. Owned is the total; the other two
                track where those units are. rented + unavailableUnits are
                clamped to never exceed owned, so "Available to rent" stays sane. */}
            <div>
              <FieldLabel required hint="track how many units are where">
                Inventory
              </FieldLabel>
              <div className="flex flex-col gap-2">
                <Stepper
                  label="Units owned"
                  hint="total pieces you have"
                  value={stock}
                  onDec={() => {
                    // Drop a unit off the top, trimming the buckets that no
                    // longer fit: unavailable first, then rented.
                    const owned = Math.max(0, stock - 1);
                    const unavail = Math.min(unavailableUnits, owned);
                    const out = Math.min(rented, owned - unavail);
                    setStock(owned);
                    setUnavailableUnits(unavail);
                    setRented(out);
                  }}
                  onInc={() => setStock(stock + 1)}
                />
                <Stepper
                  label="Out on rent"
                  hint="with customers now — will return"
                  value={rented}
                  labelColor="text-brand-secondary"
                  onDec={() => setRented(Math.max(0, rented - 1))}
                  onInc={() =>
                    setRented(Math.min(stock - unavailableUnits, rented + 1))
                  }
                />
                <Stepper
                  label="Unavailable"
                  hint="damaged, lost, or in repair — not rentable"
                  value={unavailableUnits}
                  labelColor="text-state-error"
                  onDec={() =>
                    setUnavailableUnits(Math.max(0, unavailableUnits - 1))
                  }
                  onInc={() =>
                    setUnavailableUnits(
                      Math.min(stock - rented, unavailableUnits + 1),
                    )
                  }
                />
              </div>
              <div className="mt-2 text-body-sm text-text-secondary">
                Available to rent now:{" "}
                <b
                  className={
                    accAvail({ stock, rented, unavailableUnits }) > 0
                      ? "text-state-success"
                      : "text-state-error"
                  }
                >
                  {accAvail({ stock, rented, unavailableUnits })}
                </b>
                {accAvail({ stock, rented, unavailableUnits }) === 0
                  ? rented > 0
                    ? " — all units currently rented out"
                    : " — currently unavailable"
                  : ""}
              </div>
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
                  ? "Add accessory"
                  : "Save changes"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
