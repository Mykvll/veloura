"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PenLine, BadgeCheck, Search, X } from "lucide-react";
import { niceDate } from "@/lib/reserve";
import { removePastRental, fetchHistoryPage } from "@/app/admin/(protected)/history-actions";
import { SectionTitle } from "@/components/section-title";
import { LogRentalModal, type LogRentalDressOption } from "./log-rental-modal";
import type { AdminPastRental } from "./types";

/** Peso formatter, matching the rest of the admin UI. */
function peso(n: number) {
  return `₱${n.toLocaleString("en-PH")}`;
}

/**
 * History entry row — shows renter, dress, dates, amount, and source badge.
 */
function HistoryEntryRow({
  entry,
  onRemove,
  isRemoving,
}: {
  entry: AdminPastRental;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleRemove() {
    startTransition(async () => {
      const res = await removePastRental(entry.id);
      if (!res.error) {
        setConfirmRemove(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3.5 rounded-lg border border-border-soft bg-background-card p-4 shadow-card">
      {/* Renter / dress / dates / amount */}
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-label-base uppercase tracking-wide text-text-heading">
          {entry.renter} · {entry.dress}
        </div>
        <div className="mt-0.5 text-body-sm text-text-secondary">
          {niceDate(entry.start)} – {niceDate(entry.end)} · paid{" "}
          {peso(entry.amount)}
        </div>
        {/* Source badge: Booking (completed) or Logged manually */}
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-pill border border-border-strong px-2.5 py-0.5 text-label-sm uppercase tracking-label text-text-secondary">
          {entry.source === "Booking" ? (
            <>
              <BadgeCheck className="h-3.5 w-3.5" />
              Completed booking
            </>
          ) : (
            <>
              <PenLine className="h-3.5 w-3.5" />
              Logged manually
            </>
          )}
        </div>
      </div>

      {/* Remove action — only for manually logged, not completed bookings */}
      {entry.source === "Logged" ? (
        <div className="flex flex-wrap items-center gap-2">
          {confirmRemove ? (
            <span className="inline-flex flex-wrap items-center gap-2 rounded-md bg-background-panel px-3 py-2 text-body-sm text-text-primary">
              Remove from history &amp; earnings?
              <button
                type="button"
                onClick={handleRemove}
                disabled={isRemoving}
                className="inline-flex min-h-tap items-center justify-center rounded-pill bg-state-error px-3.5 text-label-sm uppercase tracking-wide text-text-on-primary transition-colors disabled:opacity-60"
              >
                {isRemoving ? "Removing…" : "Yes, remove"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                disabled={isRemoving}
                className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-3.5 text-label-sm uppercase tracking-wide text-text-primary transition-colors hover:bg-background-panel disabled:opacity-60"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-3.5 text-label-sm uppercase tracking-wide text-state-error transition-colors hover:bg-background-panel"
            >
              Remove
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Full-screen modal for viewing all rental history with pagination and search.
 */
function ViewAllHistoryModal({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<AdminPastRental[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadPage(searchTerm: string, nextCursor: string | null) {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchHistoryPage(nextCursor, 20, searchTerm);
      if (nextCursor) {
        // Appending: add to existing entries.
        setEntries((prev) => [
          ...prev,
          ...result.entries,
        ]);
      } else {
        // New search: replace entries.
        setEntries(result.entries);
      }
      setTotal(result.total);
      setTotalEarned(result.totalEarned);
      setHasMore(result.hasMore);
      // Set cursor to the last entry's ID for pagination.
      if (result.entries.length > 0) {
        setCursor(result.entries[result.entries.length - 1].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  // Load initial page on mount.
  const [didInit, setDidInit] = useState(false);
  if (!didInit) {
    setDidInit(true);
    loadPage(search, null);
  }

  function handleSearchChange(newSearch: string) {
    setSearch(newSearch);
    setCursor(null);
    loadPage(newSearch, null);
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim-heavy p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-float">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft p-6">
          <h2 className="font-display text-display-md uppercase tracking-display text-text-accent">
            All Rental History
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-background-panel"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search box */}
        <div className="border-b border-border-soft px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <input
              type="text"
              placeholder="Search by renter or dress name…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full rounded-sm border border-border-soft bg-white pl-10 pr-4 py-2 text-body-base outline-none placeholder:text-text-secondary focus:border-border-accent focus:shadow-focus"
            />
          </div>
        </div>

        {/* Summary chip */}
        <div className="flex justify-center border-b border-border-soft px-6 py-3">
          <span className="rounded-pill border border-border-strong px-3 py-1 text-label-sm uppercase tracking-label text-text-secondary">
            {total} total · {peso(totalEarned)} earned
          </span>
        </div>

        {/* Entries list */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {error ? (
            <p className="text-body-sm text-state-error">{error}</p>
          ) : entries.length === 0 ? (
            <div className="text-center text-body-sm text-text-secondary">
              {search ? "No entries match your search." : "No rental history yet."}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {entries.map((e) => (
                <HistoryEntryRow
                  key={e.id}
                  entry={e}
                  onRemove={() => setRemovingId(e.id)}
                  isRemoving={removingId === e.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Load more button */}
        {hasMore && (
          <div className="border-t border-border-soft p-4 text-center">
            <button
              type="button"
              onClick={() => loadPage(search, cursor)}
              disabled={loading}
              className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-4 text-label-sm uppercase tracking-wide text-text-primary transition-colors hover:bg-background-panel disabled:opacity-60"
            >
              {loading ? "Loading…" : `Show more (${total - entries.length} remaining)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The "Rental History" section — completed bookings (verified, wash day in past)
 * plus pre-system rentals the admin logged. Displays the 5 most recent; a "View
 * all" button opens a paginated modal for the full history.
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
  const [viewingAll, setViewingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const totalEarned = entries.reduce((s, e) => s + e.amount, 0);
  const recentEntries = entries.slice(0, 5);
  const hasMore = entries.length > 5;

  return (
    <div>
      {/* Centered gold section title, like every admin section. */}
      <SectionTitle subtitle="Completed rentals and pre-system bookings — completed rentals are read-only">
        Rental History
      </SectionTitle>

      {/* Summary chip: total entries and earnings. */}
      <div className="mt-3.5 flex justify-center">
        <span className="rounded-pill border border-border-strong px-3 py-1 text-label-sm uppercase tracking-label text-text-secondary">
          {entries.length} total · {peso(totalEarned)} earned
        </span>
      </div>

      {error ? (
        <p className="mt-4 text-body-sm text-state-error">{error}</p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3.5">
        {recentEntries.length === 0 ? (
          <div className="rounded-lg border border-border-soft bg-background-card p-6 text-center text-body-sm text-text-secondary">
            {entries.length === 0
              ? "No rental history yet."
              : "No recent rentals."}
          </div>
        ) : (
          recentEntries.map((e) => (
            <HistoryEntryRow
              key={e.id}
              entry={e}
              onRemove={() => setRemovingId(e.id)}
              isRemoving={removingId === e.id}
            />
          ))
        )}

        {/* "View all" button if there are more than 5 entries. */}
        {hasMore && (
          <button
            type="button"
            onClick={() => setViewingAll(true)}
            className="flex min-h-[110px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-background-card text-text-secondary transition duration-fast ease-soft hover:border-brand-primary hover:text-text-heading focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-brand-primary text-2xl leading-none text-text-on-primary">
              →
            </span>
            <span className="text-center text-label-base uppercase tracking-label">
              View all rental history ({entries.length})
            </span>
          </button>
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

      {/* View all modal — paginated history with search. */}
      {viewingAll ? (
        <ViewAllHistoryModal onClose={() => setViewingAll(false)} />
      ) : null}
    </div>
  );
}
