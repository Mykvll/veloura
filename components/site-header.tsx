import Image from "next/image";

/**
 * The customer-site header.
 *
 * A sticky bar with the round gold logo + VELOURA / "by CM" lockup on the left
 * and the two section links. The customer site is a ONE-PAGER: the links are
 * plain #anchors that smooth-scroll to the Collection and FAQ sections on "/"
 * (html has `scroll-smooth`) — no route navigation anywhere. "Our Collection"
 * carries the active gold underline.
 *
 * Responsive: at mobile widths (<720px, the brand breakpoint) the links drop
 * to a full-width row under the lockup, each keeping a 44px tap target.
 * No client state needed, so this is a server component.
 */
const LINKS = [
  { href: "#collection", label: "Our Collection", active: true },
  { href: "#faq", label: "FAQ", active: false },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border-soft bg-background-card">
      <div className="relative mx-auto flex w-full max-w-page-max flex-wrap items-center gap-x-8 gap-y-0 px-6 py-2.5">
        {/* Logo lockup → back to the top. Round logo + gold wordmark. */}
        <a
          href="#top"
          aria-label="Veloura by CM — top of page"
          className="flex flex-none items-center gap-3"
        >
          <Image
            src="/veloura-logo.png"
            alt=""
            width={44}
            height={44}
            className="h-9 w-9 rounded-full md:h-11 md:w-11"
            priority
          />
          <span className="flex flex-col leading-none">
            <span className="font-display text-logo uppercase tracking-[0.14em] text-text-accent">
              VELOURA
            </span>
            <span className="mt-0.5 font-script text-lg leading-none text-text-accent">
              by CM
            </span>
          </span>
        </a>

        {/* Links: truly centered on the bar on wide screens (absolutely
            positioned at 50% — centering them in the space beside the lockup
            would sit them right of centre); a full-width row below the lockup
            on mobile (<720px). */}
        <nav className="flex items-center gap-6 mobile:order-last mobile:w-full mobile:justify-center mobile:border-t mobile:border-background-panel min-[720px]:absolute min-[720px]:left-1/2 min-[720px]:top-1/2 min-[720px]:-translate-x-1/2 min-[720px]:-translate-y-1/2">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`flex min-h-tap items-center border-b text-label-sm uppercase tracking-label transition-colors duration-fast ${
                l.active
                  ? "border-brand-primary text-text-accent"
                  : "border-transparent text-text-primary hover:text-text-accent"
              }`}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
