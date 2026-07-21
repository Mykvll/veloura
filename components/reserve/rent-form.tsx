"use client";

import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { AccessoryPicker, type CustomerAccessory } from "../accessory-picker";
import { accStateForBooking } from "@/lib/accessories";
import { createRentHold } from "@/app/reserve-actions";
import { saveHold } from "@/lib/hold-storage";
import {
  DELIVERY_TIMES,
  niceDate,
  lastWearDay,
  returnDay,
  RETURN_BY,
} from "@/lib/reserve";

/** What the rent form hands to the payment step once the hold is created: the
 *  booking id + the server-anchored expiry that drives the payment countdown,
 *  plus the date and running total for the payment summary. */
export type RentPaymentContext = {
  bookingId: string;
  date: string;
  total: number;
  /** ISO timestamp the hold lapses (server clock). */
  holdExpiresAt: string;
  /** Server "now" when the hold was created — for a skew-proof countdown. */
  serverNow: string;
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
 * The rent form — step 2 of the reserve flow, shown beside the calendar.
 * Collects the renter's details, their valid ID, the chosen accessories and a
 * delivery time, then hands off to the payment step (the booking is only saved
 * once payment proof is submitted there).
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
  /** Advance to the payment step once the hold is created. */
  onContinue: (ctx: RentPaymentContext) => void;
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
  // In-flight while create_rent_hold runs (holds the date + starts the timer).
  const [reserving, setReserving] = useState(false);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const accessoriesTotal = accessories
    .filter((a) => picked.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);
  const total = dress.price + accessoriesTotal;

  // Add-ons ticked earlier that the CURRENTLY chosen date has since made
  // unavailable (e.g. picked first, then a clashing date). The server rejects
  // these anyway (create_rent_hold → conflict 'accessory'), so we catch it here
  // and say which one, instead of letting the customer hit that at checkout.
  const unavailablePicked = accessories.filter(
    (a) =>
      picked.includes(a.id) &&
      accStateForBooking(a, a.blockedDays, date).code !== "available",
  );

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
      // Log the technical detail for us; show the customer a calm, plain message.
      console.error("ID upload failed", e);
      setError("Sorry — your ID didn't upload. Please try again.");
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
    unavailablePicked.length === 0 &&
    !uploading &&
    !reserving;

  // Create the hold NOW (this is where the date is first held + the 10-minute
  // payment window starts), then advance to payment. On a date clash the RPC
  // returns a friendly message and we stay put.
  async function handleContinue() {
    if (!date || !idPath || reserving) return;
    setError(null);
    setReserving(true);
    const bookingId = crypto.randomUUID();
    const res = await createRentHold({
      bookingId,
      dressId: dress.id,
      name,
      contact,
      address,
      idPath,
      date,
      deliverTime,
      accessoryIds: picked,
    });
    setReserving(false);
    if (res.error || !res.bookingId || !res.holdExpiresAt || !res.serverNow) {
      setError(res.error ?? "Something went wrong. Please try again.");
      return;
    }
    // Remember the hold so an accidental refresh can resume the payment step.
    saveHold({ bookingId: res.bookingId, dressId: dress.id, date, total });
    onContinue({
      bookingId: res.bookingId,
      date,
      total,
      holdExpiresAt: res.holdExpiresAt,
      serverNow: res.serverNow,
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
            startDate={date}
          />
          {/* Names the add-on that clashes with the chosen date, so the disabled
              Continue button is never a mystery. Tapping the row removes it. */}
          {unavailablePicked.length > 0 ? (
            <p className="mt-1.5 text-body-sm text-state-error">
              {unavailablePicked.map((a) => a.name).join(", ")}{" "}
              {unavailablePicked.length === 1 ? "isn't" : "aren't"} available on
              your chosen date — tap to remove{" "}
              {unavailablePicked.length === 1 ? "it" : "them"} to continue.
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <FieldLabel required hint="so we know when to expect the courier">
          Expected delivery arrival
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
        {/* Delivery time above is informational; it never changes these dates. */}
        {date ? (
          <p className="mt-1.5 text-body-sm text-text-secondary">
            2-day rental: {niceDate(date)} – {niceDate(lastWearDay(date))}. Return
            before <b className="text-text-primary">{RETURN_BY}</b> on{" "}
            {niceDate(returnDay(date))}.
          </p>
        ) : null}
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
        className="flex h-[52px] w-full items-center justify-center rounded-pill bg-brand-primary px-6 text-label-base uppercase tracking-label text-text-on-primary transition-fast hover:bg-brand-primary-hover active:bg-brand-primary-active disabled:opacity-50"
      >
        {reserving ? "Reserving your date…" : "Continue to payment"}
      </button>
    </div>
  );
}
