import Image from "next/image";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionTitle } from "@/components/section-title";

/**
 * Loading state for the one-pager (/).
 *
 * Next.js shows this instantly while the server component fetches dresses from
 * Supabase. The static parts of the page (header, hero, section title, footer)
 * render for real; only the dress grid is a set of softly pulsing placeholder
 * cards shaped like the real DressCards.
 */
export default function CollectionLoading() {
  return (
    <>
      <SiteHeader />

      {/* Hero — static, so it renders fully even while loading. */}
      <section className="flex flex-col items-center gap-3.5 px-6 pb-10 pt-14 text-center">
        <Image
          src="/veloura-logo.png"
          alt="Veloura by CM"
          width={110}
          height={110}
          className="h-[110px] w-[110px] rounded-full shadow-card"
          priority
        />
        {/* Same tagline lockup as app/page.tsx — keep the two in sync so the
            loading state doesn't flash a different headline. */}
        <h1 className="text-text-accent">
          <span
            className="block font-hero-serif uppercase"
            style={{
              fontSize: "clamp(44px, 8vw, 84px)",
              lineHeight: 1.02,
              letterSpacing: "0.06em",
            }}
          >
            Every Entrance
          </span>
          <span
            className="block font-hero-script"
            style={{
              fontSize: "clamp(40px, 7vw, 76px)",
              lineHeight: 1,
              marginTop: "0.06em",
            }}
          >
            deserves elegance
          </span>
        </h1>
        <p className="text-label-base uppercase tracking-label text-text-secondary">
          Graduation · Weddings · Formal Events · Date Nights
        </p>
      </section>

      <main className="mx-auto w-full max-w-page-max flex-1 px-6 pb-12 pt-2">
        <SectionTitle subtitle="Only the sizes indicated are available">
          Our Collection
        </SectionTitle>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              aria-hidden
              className="animate-pulse overflow-hidden rounded-lg border border-border-soft bg-background-card shadow-card"
            >
              <div className="aspect-[3/4] w-full bg-background-panel" />
              <div className="space-y-2 p-3">
                <div className="mx-auto h-4 w-2/3 rounded-sm bg-background-panel" />
                <div className="mx-auto h-3 w-1/2 rounded-sm bg-background-panel" />
              </div>
            </div>
          ))}
        </div>

        <span className="sr-only">Loading the collection…</span>
      </main>

      <SiteFooter />
    </>
  );
}
