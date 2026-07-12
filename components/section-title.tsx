import type { ReactNode } from "react";

/**
 * Centered display-serif section title with thin gold rules and ✦ sparkles —
 * a 1:1 port of the design system's <SectionTitle /> (components/display/
 * SectionTitle.jsx). Used by every stacked section on the customer one-pager
 * AND the admin page, so both match the prototypes.
 *
 * Anatomy: gold hairline · ✦ TITLE ✦ · gold hairline, with an optional
 * uppercase letterspaced subtitle underneath. The title is gold display serif
 * per the brand title-colour rule.
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
        <h2 className="flex items-center gap-3 font-display text-display-lg uppercase tracking-display text-text-accent">
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
