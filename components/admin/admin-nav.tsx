"use client";

/**
 * The admin section nav (client component).
 *
 * The admin experience is one page ("/admin") made of stacked sections, so these
 * links scroll to a section by id rather than navigating to a route — mirroring
 * the admin.html prototype's top nav. Only the sections that exist so far are
 * listed (Dresses, Accessories); more are added as they're built.
 */
const LINKS = [
  { id: "dresses", label: "Dresses" },
  { id: "accessories", label: "Accessories" },
  { id: "payments", label: "Payments" },
  { id: "bookings", label: "Bookings" },
] as const;

export function AdminNav() {
  // Smoothly scroll the target section into view. We handle the click ourselves
  // (instead of a bare `#id` href) so the scroll is always smooth regardless of
  // global CSS, and so it works when we're already at that hash.
  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((l) => (
        <a
          key={l.id}
          href={`#${l.id}`}
          onClick={(e) => {
            e.preventDefault();
            scrollToSection(l.id);
          }}
          className="min-h-tap rounded-sm px-3 py-2 text-label-sm uppercase tracking-label text-text-secondary transition-fast hover:text-text-heading"
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
