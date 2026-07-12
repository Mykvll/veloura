"use client";

/**
 * The admin section nav (client component).
 *
 * The admin experience is one page ("/admin") made of stacked sections, so
 * these links scroll to a section by id rather than navigating to a route.
 */
const LINKS = [
  { id: "analytics", label: "Analytics" },
  { id: "dresses", label: "Dresses" },
  { id: "accessories", label: "Accessories" },
  { id: "payments", label: "Payments" },
  { id: "bookings", label: "Bookings" },
  { id: "calendar", label: "Calendar" },
] as const;

export function AdminNav() {
  // Smoothly scroll the target section into view. We handle the click ourselves
  // (instead of a bare `#id` href) so the scroll is always smooth regardless of
  // global CSS, and so it works when we're already at that hash.
  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    // whitespace-nowrap + flex-none links: on narrow screens the parent row
    // scrolls horizontally instead of clipping the last links.
    <nav className="flex items-center gap-1 whitespace-nowrap">
      {LINKS.map((l) => (
        <a
          key={l.id}
          href={`#${l.id}`}
          onClick={(e) => {
            e.preventDefault();
            scrollToSection(l.id);
          }}
          className="flex min-h-tap flex-none items-center rounded-sm px-3 text-label-sm uppercase tracking-label text-text-secondary transition-fast hover:text-text-heading"
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
