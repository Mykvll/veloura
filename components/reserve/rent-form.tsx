"use client";

import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { AccessoryPicker, type CustomerAccessory } from "../accessory-picker";
import type { RentBookingInput } from "@/app/reserve-actions";
import { DELIVERY_TIMES, niceDate } from "@/lib/reserve";

/** What the rent form hands to the payment step: the booking details it has
 *  collected (everything except the payment channel + proof, which come next)
 *  plus the running total, shown as the amount due. */
export type RentContinueData = {
  input: Omit<RentBookingInput, "paymentMethod" | "proofPath">;
  total: number;
};

/* Small brand-token field label, mirroring the admin editors. */
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
 * The rent form — step 2 of the reserve flow, shown beside the calendar (see
 * design/index.html → RentForm). Collects the renter's details, their valid ID,
 * the chosen accessories and a delivery time, then hands off to the payment step
 * (the booking is only saved once payment proof is submitted there).
 *
 * ID UPLOAD: the ID goes to the PRIVATE `payment-proofs` bucket. As with the
 * admin editors, the file is uploaded straight from the browser and only its
 * storage PATH (not the bytes, and there's no public URL — the bucket is
 * private) is carried forward to the payment step. The date is re-checked on the
 * server before the row is written.
 */
export function RentForm({
  dress,
  accessories,
  date,
  onContinue,
}: {
  dress: { id: string; name: string; price: number };
  accessories: CustomerAccessory[];
  /** The rental date picked on the calendar, or null until one is chosen. */
  date: string | null;
  /** Advance to the payment step, carrying the collected booking details. */
  onContinue: (data: RentContinueData) => void;
}) {
  const supabase = createClient();

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [deliverTime, setDeliverTime] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  // Uploaded-ID state: the storage path we send to the server + its filename
  // for display, plus an in-flight flag.
  const [idPath, setIdPath] = useState<string | null>(null);
  const [idName, setIdName] = useState("");
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const accessoriesTotal = accessories
    .filter((a) => picked.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);
  const total = dress.price + accessoriesTotal;

  async function uploadId(file: File) {
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `ids/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw new Error(upErr.message);
      setIdPath(path);
      setIdName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ID upload failed.");
      setIdPath(null);
      setIdName("");
    } finally {
      setUploading(false);
    }
  }

  const canSubmit =
    !!date &&
    !!name.trim() &&
    !!contact.trim() &&
    !!address.trim() &&
    !!deliverTime &&
    !!idPath &&
    !uploading;

  // Hand the collected details to the payment step. Nothing is saved yet — the
  // booking row is written only after payment proof is submitted there.
  function handleContinue() {
    if (!date || !idPath) return;
    onContinue({
      input: {
        dressId: dress.id,
        name,
        contact,
        address,
        idPath,
        date,
        deliverTime,
        accessoryIds: picked,
      },
      total,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <FieldLabel required>Full name</FieldLabel>
        <input
          className={inputClass}
          placeholder="Juana Dela Cruz"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <FieldLabel required>Contact number</FieldLabel>
        <input
          type="tel"
          className={inputClass}
          placeholder="09xx xxx xxxx"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </div>

      <div>
        <FieldLabel required>Complete address</FieldLabel>
        <input
          className={inputClass}
          placeholder="House no., street, barangay, city"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <div>
        <FieldLabel required hint="clear photo of a valid ID">
          Valid ID
        </FieldLabel>
        <label className="flex min-h-tap cursor-pointer items-center gap-2.5 rounded-sm border border-dashed border-border-strong bg-white px-4 py-2 text-body-sm text-text-secondary hover:border-brand-primary">
          <span className="text-brand-primary">⬆</span>
          <span className={idName ? "text-text-primary" : ""}>
            {uploading
              ? "Uploading…"
              : idName || "Tap to upload your ID"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadId(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {/* Rental date — read-only echo of the calendar pick. */}
      <div>
        <FieldLabel>Rental date</FieldLabel>
        <div
          className={`flex min-h-tap items-center rounded-sm border border-dashed border-border-strong bg-background-panel px-4 py-2 text-body-base ${
            date ? "text-text-primary" : "text-text-secondary"
          }`}
        >
          {date ? niceDate(date) : "Pick a date on the calendar"}
        </div>
      </div>

      {/* Accessories add-on picker + running total. */}
      {accessories.length > 0 ? (
        <div>
          <FieldLabel hint="limited stock — add to your rental">
            Accessories
          </FieldLabel>
          <AccessoryPicker
            accessories={accessories}
            picked={picked}
            onToggle={toggle}
          />
        </div>
      ) : null}

      <div>
        <FieldLabel required hint="rental countdown starts on delivery">
          Preferred time to deliver
        </FieldLabel>
        <select
          className={inputClass}
          value={deliverTime}
          onChange={(e) => setDeliverTime(e.target.value)}
        >
          <option value="" disabled>
            Choose a time…
          </option>
          {DELIVERY_TIMES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <p className="text-body-sm text-text-secondary">
        Base rental is 2 days (₱{dress.price.toLocaleString("en-PH")}) + ₱300 per
        additional day. The day after your return is reserved for cleaning.
      </p>

      {/* Running total — dress fee plus any picked add-ons. */}
      <div className="flex items-baseline justify-between border-t border-border-soft pt-3">
        <span className="text-label-base uppercase tracking-label text-text-heading">
          Total{accessoriesTotal ? " (dress + accessories)" : ""}
        </span>
        <span className="text-price-lg text-text-accent">
          ₱{total.toLocaleString("en-PH")}
        </span>
      </div>

      {error ? <p className="text-body-sm text-state-error">{error}</p> : null}

      <button
        type="button"
        onClick={handleContinue}
        disabled={!canSubmit}
        className="flex min-h-tap w-full items-center justify-center rounded-lg bg-brand-primary px-6 text-label-base uppercase tracking-label text-text-on-primary transition-fast hover:bg-brand-primary-hover disabled:opacity-50"
      >
        Continue to payment
      </button>
    </div>
  );
}
