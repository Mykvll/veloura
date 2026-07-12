/**
 * Loading state for the admin dashboard (/admin).
 *
 * The dashboard is force-dynamic and fetches a lot (dresses, bookings, payments,
 * analytics) on every load, so Next.js shows this fallback in the meantime. It
 * renders inside the protected layout, so the admin header/nav stay put — this
 * just fills the main area with pulsing placeholders for the stacked sections.
 */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-20" aria-hidden>
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="animate-pulse">
          {/* Section heading placeholder */}
          <div className="h-7 w-56 rounded-sm bg-background-panel" />
          <div className="mt-2 h-3 w-72 rounded-sm bg-background-panel" />

          {/* Card grid placeholder */}
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-40 rounded-lg border border-border-soft bg-background-card shadow-card"
              />
            ))}
          </div>
        </div>
      ))}

      <span className="sr-only">Loading the admin dashboard…</span>
    </div>
  );
}
