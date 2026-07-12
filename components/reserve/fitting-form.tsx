"use client";

import { useState, useTransition, type ReactNode } from "react";
import { createFittingBooking } from "@/app/reserve-actions";
import {
  fittingSlots,
  isWeekend,
  niceDate,
  FITTING_FEE,
  PARKING_FEE,
  FITTING_LOCATION,
} from "@/lib/reserve";

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

/** A pill toggle (time slot / vehicle / parking choice). */
function Pill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-tap rounded-pill border px-4 text-label-sm uppercase tracking-wide transition-fast disabled:cursor-not-allowed disabled:line-through disabled:opacity-50 ${
        active
          ? "border-brand-primary bg-brand-primary text-text-on-primary"
          : "border-border-soft bg-white text-text-primary hover:border-border-strong"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The fitting form — step 2 of the reserve flow in fitting mode. Collects
 * name, contact, a time slot (the slots depend on weekday vs weekend;
 * already-booked ones are disabled) and an optional parking reservation, then
 * saves a 'pending' fitting booking. The date and slot are re-checked on the
 * server before the row is written.
 */
export function FittingForm({
  dress,
  date,
  bookedTimes,
  onDone,
}: {
  dress: { id: string; name: string };
  /** The fitting date picked on the calendar, or null until one is chosen. */
  date: string | null;
  /** Times already taken on `date` (from booked_fitting_slots). */
  bookedTimes: string[];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [time, setTime] = useState("");
  const [parking, setParking] = useState(false);
  const [vehicle, setVehicle] = useState("Car");
  const [plate, setPlate] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const slots = date ? fittingSlots(date) : [];

  const canSubmit =
    !!date &&
    !!name.trim() &&
    !!contact.trim() &&
    !!time &&
    (!parking || !!plate.trim());

  function handleSubmit() {
    if (!date) return;
    setError(null);
    startTransition(async () => {
      const res = await createFittingBooking({
        dressId: dress.id,
        name,
        contact,
        date,
        time,
        parking,
        vehicle,
        plate,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  const totalFee = FITTING_FEE + (parking ? PARKING_FEE : 0);

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

      {/* Fitting date — read-only echo of the calendar pick. */}
      <div>
        <FieldLabel>Fitting date</FieldLabel>
        <div
          className={`flex min-h-tap items-center rounded-sm border border-dashed border-border-strong bg-background-panel px-4 py-2 text-body-base ${
            date ? "text-text-primary" : "text-text-secondary"
          }`}
        >
          {date ? niceDate(date) : "Pick a date on the calendar"}
        </div>
      </div>

      <div>
        <FieldLabel
          required
          hint={date ? (isWeekend(date) ? "(weekend times)" : "(weekday times)") : ""}
        >
          Fitting time
        </FieldLabel>
        {date ? (
          <div className="flex flex-wrap gap-2">
            {slots.map((t) => {
              const taken = bookedTimes.includes(t);
              return (
                <Pill
                  key={t}
                  active={time === t}
                  disabled={taken}
                  onClick={() => setTime(t)}
                >
                  {t}
                </Pill>
              );
            })}
          </div>
        ) : (
          <p className="text-body-sm text-text-secondary">
            Pick a date first — weekdays offer 4:00 &amp; 7:00 PM; weekends 1:00,
            3:00, 5:00, 7:00 &amp; 9:00 PM.
          </p>
        )}
      </div>

      {/* Fitting location — read-only. */}
      <div>
        <FieldLabel>Fitting location</FieldLabel>
        <div className="flex min-h-tap items-center rounded-sm border border-dashed border-border-strong bg-background-panel px-4 py-2 text-body-base text-text-primary">
          {FITTING_LOCATION}
        </div>
      </div>

      <div>
        <FieldLabel>Bringing a vehicle?</FieldLabel>
        <div className="flex flex-wrap gap-2.5">
          <Pill active={!parking} onClick={() => setParking(false)}>
            No
          </Pill>
          <Pill active={parking} onClick={() => setParking(true)}>
            Yes — reserve parking
          </Pill>
        </div>
      </div>

      {parking ? (
        <div className="flex flex-col gap-3 rounded-md bg-background-panel p-4">
          <div className="flex items-baseline justify-between gap-2.5">
            <span className="text-label-sm uppercase tracking-label text-text-heading">
              Parking reservation
            </span>
            <span className="text-price-base text-text-accent">
              ₱{PARKING_FEE}
            </span>
          </div>
          <div className="flex gap-2">
            {["Car", "Motorcycle"].map((v) => (
              <Pill
                key={v}
                active={vehicle === v}
                onClick={() => setVehicle(v)}
              >
                {v}
              </Pill>
            ))}
          </div>
          <div>
            <FieldLabel required>Plate number</FieldLabel>
            <input
              className={inputClass}
              placeholder="e.g. ABC 1234"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
            />
          </div>
          <p className="text-body-sm text-text-secondary">
            We reserve a slot near Harbour Park Residences in advance (₱
            {PARKING_FEE}, added to your fitting fee). Please arrive on time.
          </p>
        </div>
      ) : null}

      <p className="text-body-sm text-text-secondary">
        Fitting fee ₱{FITTING_FEE}, by appointment only. Please bring one (1)
        valid ID for condominium visitor requirements.
      </p>

      {error ? <p className="text-body-sm text-state-error">{error}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending}
        className="flex h-[52px] w-full items-center justify-center rounded-pill bg-brand-primary px-6 text-label-base uppercase tracking-label text-text-on-primary transition-fast hover:bg-brand-primary-hover active:bg-brand-primary-active disabled:opacity-50"
      >
        {isPending
          ? "Booking…"
          : `Book this fitting · ₱${totalFee.toLocaleString("en-PH")}`}
      </button>
    </div>
  );
}
