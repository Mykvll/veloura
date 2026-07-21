import type { ReactNode } from "react";

/**
 * Centered Marcellus section title with thin gold rules and ✦ sparkles.
 * Marcellus (font-section) is used HERE and nowhere else — the rest of the
 * type system stays on Cormorant Garamond (font-display).
 * Used by every stacked section on the customer one-pager AND the admin page.
 *
 * Anatomy: gold hairline · ✦ TITLE ✦ · gold hairline, with an optional
 * uppercase letterspaced subtitle underneath.
 */
export function SectionTitle({
  children,
  subtitle,
}: {
  children: ReactNode;
  /** Small uppercase line under the title (muted brown label). */
  subtitle?: string;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-4">
        <span className="h-px max-w-[90px] flex-1 bg-brand-primary" aria-hidden />
        <h2 className="flex items-center gap-3 font-section text-display-lg uppercase tracking-display text-text-accent">
          <span className="text-sm" aria-hidden>
            ✦
          </span>
          {children}
          <span className="text-sm" aria-hidden>
            ✦
          </span>
        </h2>
        <span className="h-px max-w-[90px] flex-1 bg-brand-primary" aria-hidden />
      </div>
      {subtitle ? (
        <p className="mt-2.5 text-label-base uppercase tracking-label text-text-secondary">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
