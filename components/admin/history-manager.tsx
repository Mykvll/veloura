"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PenLine } from "lucide-react";
import { niceDate } from "@/lib/reserve";
import { removePastRental } from "@/app/admin/(protected)/history-actions";
import { SectionTitle } from "@/components/section-title";
import { LogRentalModal, type LogRentalDressOption } from "./log-rental-modal";
import type { AdminPastRental } from "./types";

/** Peso formatter, matching the rest of the admin UI. */
function peso(n: number) {
  return `₱${n.toLocaleString("en-PH")}`;
}

/**
 * The "Rental History" section — pre-system rentals the admin logged from
 * memory so lifetime earnings and per-dress wear counts are accurate.
 *
 * One row per logged rental (renter · dress, dates, amount, a "Logged
 * manually" badge so it can't be confused with a live booking) plus a Remove
 * action with an inline confirm (business rule 4 — removing takes the amount
 * back out of Total earned). The "Log past rental" dashed tile opens the
 * modal; `dresses` feeds its catalogue picker.
 */
export function HistoryManager({
  entries,
  dresses,
}: {
  entries: AdminPastRental[];
  dresses: LogRentalDressOption[];
}) {
  const router = useRouter();
  const [logging, setLogging] = useState(false);
  // Which row is mid-remove-confirm, and whether a remove is in flight.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRemove(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await removePastRental(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setConfirmId(null);
      router.refresh();
    });
  }

  const totalLogged = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      {/* Centered gold section title, like every admin section. */}
      <SectionTitle subtitle="Rentals from before this system — logged for lifetime earnings and wear-counts">
        Rental History
      </SectionTitle>

      {/* Summary chip: how much of Total earned comes from logged history. */}
      <div className="mt-3.5 flex justify-center">
        <span className="rounded-pill border border-border-strong px-3 py-1 text-label-sm uppercase tracking-label text-text-secondary">
          {entries.length} logged · {peso(totalLogged)} earned
        </span>
      </div>

      {error ? (
        <p className="mt-4 text-body-sm text-state-error">{error}</p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3.5">
        {entries.length === 0 ? (
          <div className="rounded-lg border border-border-soft bg-background-card p-6 text-center text-body-sm text-text-secondary">
            No past rentals logged yet.
          </div>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-3.5 rounded-lg border border-border-soft bg-background-card p-4 shadow-card"
            >
              {/* Renter / dress / dates / amount */}
              <div className="min-w-0 flex-1 basis-56">
                <div className="text-label-base uppercase tracking-wide text-text-heading">
                  {e.renter} · {e.dress}
                </div>
                <div className="mt-0.5 text-body-sm text-text-secondary">
                  {niceDate(e.start)} – {niceDate(e.end)} · paid{" "}
                  {peso(e.amount)}
                </div>
                {/* Badge: this row is from the admin's memory, not a live
                    booking — it was never verified and blocks no dates. */}
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-pill border border-border-strong px-2.5 py-0.5 text-label-sm uppercase tracking-label text-text-secondary">
                  <PenLine className="h-3.5 w-3.5" />
                  Logged manually
                </div>
              </div>

              {/* Remove, with an inline confirm step. */}
              <div className="flex flex-wrap items-center gap-2">
                {confirmId === e.id ? (
                  <span className="inline-flex flex-wrap items-center gap-2 rounded-md bg-background-panel px-3 py-2 text-body-sm text-text-primary">
                    Remove from history &amp; earnings?
                    <button
                      type="button"
                      onClick={() => handleRemove(e.id)}
                      disabled={isPending}
                      className="inline-flex min-h-tap items-center justify-center rounded-pill bg-state-error px-3.5 text-label-sm uppercase tracking-wide text-text-on-primary transition-colors disabled:opacity-60"
                    >
                      {isPending ? "Removing…" : "Yes, remove"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      disabled={isPending}
                      className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-3.5 text-label-sm uppercase tracking-wide text-text-primary transition-colors hover:bg-background-panel disabled:opacity-60"
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirmId(e.id);
                    }}
                    className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-3.5 text-label-sm uppercase tracking-wide text-state-error transition-colors hover:bg-background-panel"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {/* Log past rental tile — same dashed add-tile as dresses/accessories. */}
        <button
          type="button"
          onClick={() => setLogging(true)}
          className="flex min-h-[110px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-background-card text-text-secondary transition duration-fast ease-soft hover:border-brand-primary hover:text-text-heading focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-brand-primary text-2xl leading-none text-text-on-primary">
            +
          </span>
          <span className="text-label-base uppercase tracking-label">
            Log past rental
          </span>
        </button>
      </div>

      {/* Log modal — fresh instance each time it opens. */}
      {logging ? (
        <LogRentalModal dresses={dresses} onClose={() => setLogging(false)} />
      ) : null}
    </div>
  );
}
