"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AccessoryEditorModal } from "./accessory-editor-modal";
import { deleteAccessory } from "@/app/admin/(protected)/accessory-actions";
import { SectionTitle } from "@/components/section-title";
import { accAvail } from "@/lib/accessories";
import type { AdminAccessory } from "./types";

// Shared capsule shape for the stock badges, matching the rest of the admin UI.
const pill =
  "inline-flex items-center whitespace-nowrap rounded-pill px-2 py-0.5 text-label-sm uppercase tracking-label";

/** "Jul 22, 2026" — short enough to sit inline in a badge or caption. */
function shortDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Peso formatter, matching the rest of the admin UI. */
function peso(n: number) {
  return `₱${n.toLocaleString("en-PH")}`;
}

/**
 * The "Accessories" management grid (client component).
 *
 * One card per accessory (image, name, rental price, unit cost, stock badge)
 * plus an "Add accessory" tile. Each card has Edit and Remove; Remove asks for
 * an inline confirm step first (business rule 4). The editor modal's open/close
 * state lives here.
 *
 * `editing` is: an AdminAccessory (edit it) | "new" (create) | null (closed).
 */
export function AccessoriesManager({
  accessories,
}: {
  accessories: AdminAccessory[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminAccessory | "new" | null>(null);
  // Which card is mid-delete-confirm (accessory id), and the pending remove.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // The "is it free on…?" date, which the field itself displays — it starts on
  // today, so the admin can always see which day the badges describe.
  //
  // Both bits of state start empty and are filled in after mount rather than
  // during render: the server renders in UTC and the admin's browser is on
  // Manila time, so a render-time `new Date()` can disagree across the date
  // line and trip a hydration mismatch. The first paint shows an empty field,
  // which reads the same as today's snapshot anyway.
  const [checkDate, setCheckDate] = useState("");
  const [today, setToday] = useState("");
  useEffect(() => {
    // "en-CA" gives YYYY-MM-DD in the browser's own timezone.
    const iso = new Date().toLocaleDateString("en-CA");
    setToday(iso);
    setCheckDate(iso);
  }, []);
  // Today is a richer case than any other day: bookings give us a live `rented`
  // count, so the badges can say "2 available" / "Rented out". For other days
  // all we know from accessory_blocked_dates is at-capacity or not, so those
  // badges answer the narrower free / fully-booked question.
  const showingToday = !checkDate || checkDate === today;

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteAccessory(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div>
      {/* Centered section title + count badge under it (admin.html). */}
      <SectionTitle subtitle="Limited stock — customers can add these to a rental until they run out">
        Accessories
      </SectionTitle>
      <div className="mt-3.5 flex justify-center">
        <span className="rounded-pill border border-border-strong px-3 py-1 text-label-sm uppercase tracking-label text-text-secondary">
          {accessories.length}{" "}
          {accessories.length === 1 ? "accessory" : "accessories"}
        </span>
      </div>

      {/* "Free on…?" check. Availability is date-scoped (an accessory out next
          weekend is free today), so the default badges are a TODAY snapshot and
          this lets the admin ask about any other day. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
        <label
          htmlFor="acc-check-date"
          className="text-label-sm uppercase tracking-label text-text-heading"
        >
          Check availability on
        </label>
        <input
          id="acc-check-date"
          type="date"
          value={checkDate}
          onChange={(e) => setCheckDate(e.target.value)}
          className="min-h-tap rounded-sm border border-border-soft bg-white px-3 py-1.5 text-body-sm text-text-primary outline-none focus:border-border-accent focus:shadow-focus"
        />
        {/* Only worth showing once the admin has moved off today. */}
        {today && checkDate !== today ? (
          <button
            type="button"
            onClick={() => setCheckDate(today)}
            className="min-h-tap rounded-pill border border-border-soft bg-white px-3 text-label-sm uppercase tracking-label text-text-secondary hover:border-border-strong"
          >
            Today
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-body-sm text-state-error">{error}</p>
      ) : null}

      {/* Grid: accessory cards + the Add tile. */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accessories.map((a) => {
          const avail = accAvail(a);
          const { rented, unavailableUnits } = a;
          const low = avail > 0 && avail <= 2;
          // Capacity is what the shop can rent on ANY day; a day is "full" when
          // it appears in this accessory's blocked days.
          const capacity = Math.max(0, a.stock - unavailableUnits);
          const fullThatDay = a.blockedDays.includes(checkDate);
          const dateFree = capacity > 0 && !fullThatDay;

          // Main badge — on today it's the live snapshot (green available /
          // gold low / red none); on any other day it answers "free THAT day?".
          const mainToneClass = !showingToday
            ? dateFree
              ? "bg-state-success text-text-on-primary"
              : "bg-state-error text-text-on-primary"
            : avail > 0
              ? low
                ? "bg-brand-primary text-text-on-primary"
                : "bg-state-success text-text-on-primary"
              : "bg-state-error text-text-on-primary";
          const mainLabel = !showingToday
            ? dateFree
              ? `Free ${shortDate(checkDate)}`
              : capacity <= 0
                ? "Unavailable"
                : `Fully booked ${shortDate(checkDate)}`
            : avail > 0
              ? `${avail} available`
              : rented > 0
                ? "Rented out"
                : "Unavailable";
          return (
            <div
              key={a.id}
              className="flex flex-col gap-3 rounded-lg border border-border-soft bg-background-card p-4 shadow-card"
            >
              {/* Top row: image + name/price/stock */}
              <div className="flex items-start gap-3">
                {a.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.imageUrl}
                    alt={a.name}
                    className="h-16 w-16 flex-none rounded-sm border border-border-soft object-cover"
                  />
                ) : (
                  <span className="flex h-16 w-16 flex-none items-center justify-center rounded-sm border border-border-soft bg-background-panel text-label-sm uppercase tracking-label text-text-secondary">
                    No photo
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-label-base uppercase tracking-wide text-text-heading">
                      {a.name}
                    </span>
                    <span className="flex-none text-price-base text-text-accent">
                      +{peso(a.price)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={`${pill} ${mainToneClass}`}>
                      {mainLabel}
                    </span>
                    {/* Secondary badges name the two out-of-stock reasons:
                        units out on rent (taupe) and units pulled from service
                        (outline). Shown only when there are any. */}
                    {rented > 0 ? (
                      <span
                        className={`${pill} bg-brand-secondary text-text-on-primary`}
                      >
                        {rented} out on rent
                      </span>
                    ) : null}
                    {unavailableUnits > 0 ? (
                      <span
                        className={`${pill} border border-border-accent text-text-accent`}
                      >
                        {unavailableUnits} unavailable
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 text-body-sm text-text-secondary">
                    {a.stock} owned · unit cost {peso(a.cost)}
                  </div>
                </div>
              </div>

              {/* Actions — Edit / Remove, with an inline confirm on Remove. */}
              <div className="flex flex-wrap gap-2">
                {confirmId === a.id ? (
                  <>
                    <span className="w-full text-body-sm text-text-primary">
                      Remove <b>{a.name}</b>? This can&apos;t be undone.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      disabled={isPending}
                      className="rounded-pill bg-state-error inline-flex min-h-tap items-center justify-center px-4 text-label-sm uppercase tracking-label text-text-on-primary transition-colors disabled:opacity-60"
                    >
                      {isPending ? "Removing…" : "Yes, remove"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      disabled={isPending}
                      className="rounded-pill border border-border-strong inline-flex min-h-tap items-center justify-center px-4 text-label-sm uppercase tracking-label text-text-secondary transition-colors hover:bg-background-panel disabled:opacity-60"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      className="rounded-pill border border-border-strong inline-flex min-h-tap items-center justify-center px-4 text-label-sm uppercase tracking-label text-text-primary transition-colors hover:bg-background-panel"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setConfirmId(a.id);
                      }}
                      className="rounded-pill inline-flex min-h-tap items-center justify-center px-4 text-label-sm uppercase tracking-label text-state-error transition-colors hover:bg-background-panel"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Add accessory tile */}
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-background-card text-text-secondary transition duration-fast ease-soft hover:border-brand-primary hover:text-text-heading focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-brand-primary text-2xl leading-none text-text-on-primary">
            +
          </span>
          <span className="text-label-base uppercase tracking-label">
            Add accessory
          </span>
        </button>
      </div>

      {/* Editor modal — fresh instance per accessory / for "new". */}
      {editing ? (
        <AccessoryEditorModal
          key={editing === "new" ? "new" : editing.id}
          accessory={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
