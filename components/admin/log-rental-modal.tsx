"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { logPastRental } from "@/app/admin/(protected)/history-actions";

/* Small brand-token field primitives, mirroring the accessory editor. */

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

/** A dress the modal can attribute a past rental to (current price pre-fills
 *  the amount, but the admin can overwrite it with what was really paid). */
export type LogRentalDressOption = {
  id: string;
  name: string;
  price: number;
};

/**
 * Log one pre-system rental in a modal.
 *
 * Everything here is from the admin's memory — no payment proof, no contact
 * number, no delivery time. Both date pickers are capped at today (these are
 * PAST rentals), and picking a dress pre-fills the amount with its current
 * rental price as a starting point. The server action re-validates all of it.
 */
export function LogRentalModal({
  dresses,
  onClose,
}: {
  dresses: LogRentalDressOption[];
  onClose: () => void;
}) {
  const router = useRouter();

  const [dressId, setDressId] = useState("");
  const [renterName, setRenterName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [amount, setAmount] = useState<number>(0);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Today on the admin's device (the shop runs on Manila time) — the cap for
  // both date pickers. en-CA formats as YYYY-MM-DD, ready for <input max>.
  const today = new Date().toLocaleDateString("en-CA");

  function pickDress(id: string) {
    setDressId(id);
    // Pre-fill with the dress's current rental price; the admin overwrites it
    // with what the renter actually paid if that differs.
    const dress = dresses.find((d) => d.id === id);
    if (dress) setAmount(dress.price);
  }

  // Mirror of the server action's checks — the Log button stays disabled until
  // every field is valid (typed dates can bypass the picker's max, hence the
  // explicit ≤ today checks).
  const canSave =
    dressId !== "" &&
    renterName.trim().length > 0 &&
    startDate !== "" &&
    endDate !== "" &&
    startDate <= today &&
    endDate <= today &&
    endDate >= startDate &&
    amount > 0;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await logPastRental({
        dressId,
        renterName,
        startDate,
        endDate,
        amountPaid: amount,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

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
                Log past rental
              </Dialog.Title>
              <p className="text-body-sm text-text-secondary">
                A rental from before this system
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
            {/* Dress */}
            <div>
              <FieldLabel required>Dress</FieldLabel>
              <select
                className={inputClass}
                value={dressId}
                onChange={(e) => pickDress(e.target.value)}
              >
                <option value="" disabled>
                  Choose a dress…
                </option>
                {dresses.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Renter */}
            <div>
              <FieldLabel required>Renter&apos;s name</FieldLabel>
              <input
                className={inputClass}
                placeholder="e.g. Maria Santos"
                value={renterName}
                onChange={(e) => setRenterName(e.target.value)}
              />
            </div>

            {/* Dates — past only */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Rented from</FieldLabel>
                <input
                  type="date"
                  max={today}
                  className={inputClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel required>Until</FieldLabel>
                <input
                  type="date"
                  min={startDate || undefined}
                  max={today}
                  className={inputClass}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Amount */}
            <div>
              <FieldLabel required hint="what they actually paid — rental + any add-ons">
                Amount paid (₱)
              </FieldLabel>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>

            {/* What logging does (and doesn't do). */}
            <p className="rounded-md bg-background-panel px-4 py-3 text-body-sm text-text-secondary">
              Logged rentals count toward total earnings and each dress&apos;s
              wear-count. They skip payment verification and never block
              calendar dates.
            </p>

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
              {isPending ? "Logging…" : "Log rental"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
