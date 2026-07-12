import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { CollectionGallery } from "@/components/collection-gallery";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionTitle } from "@/components/section-title";
import { FaqSection } from "@/components/faq-section";
import type { DressDetail } from "@/components/dress-detail-modal";
import type { CustomerAccessory } from "@/components/accessory-picker";
import type { PaymentOption } from "@/components/reserve/payment-step";
import type { BlockedDate } from "@/components/availability-calendar";

// Always fetch fresh from Supabase on each request (no static caching), so new
// dresses show up as soon as they're added.
export const dynamic = "force-dynamic";

/**
 * The hero at the top of the one-pager (design/index.html → <Hero />): round
 * logo, the gold display-serif tagline, the uppercase occasions line, and a
 * gold pill CTA that smooth-scrolls to #collection (html has `scroll-smooth`).
 * All static, so it lives right here in the server page.
 */
function Hero() {
  return (
    <section className="flex flex-col items-center gap-3.5 px-6 pb-10 pt-14 text-center">
      <Image
        src="/veloura-logo.png"
        alt="Veloura by CM"
        width={110}
        height={110}
        className="h-[110px] w-[110px] rounded-full shadow-card"
        priority
      />
      <h1 className="font-display text-display-lg uppercase tracking-display text-text-accent">
        Wear luxury,
        <br />
        not the price.
      </h1>
      <p className="text-label-base uppercase tracking-label text-text-secondary">
        Graduation · Weddings · Formal Events · Date Nights
      </p>
      <a
        href="#collection"
        className="mt-1 inline-flex h-[52px] items-center justify-center rounded-pill bg-brand-primary px-[34px] text-label-base uppercase tracking-label text-text-on-primary transition-colors duration-fast ease-soft hover:bg-brand-primary-hover active:bg-brand-primary-active"
      >
        Browse the collection
      </a>
    </section>
  );
}

export default async function Home() {
  const supabase = await createClient();

  // Fetch every non-hidden dress with ALL the detail the modal needs (photos,
  // sizes, reviews) — not just the card cover. The detail now lives in a modal
  // on this page, so loading it up front makes opening a dress instant (no
  // second round-trip). This is the same query the old /dress/[id] page ran,
  // just for the whole collection at once.
  const { data: dresses, error } = await supabase
    .from("dresses")
    .select(
      `id, name, style_name, price, status,
       dress_photos(url, label, is_cover, sort_order),
       dress_sizes(size, bust_cm, waist_cm, length_cm),
       reviews(id, renter_name, body, photo_url, created_at)`,
    )
    .neq("status", "hidden")
    .order("created_at", { ascending: true });

  // Accessories offered as rental add-ons in the reserve flow. The same list is
  // shown for every dress; out-of-stock ones are disabled (not hidden), so we
  // fetch them all. Oldest-first keeps the order stable as new ones are added.
  const { data: accessoryRows } = await supabase
    .from("accessories")
    .select("id, name, price, stock, image_url")
    .order("created_at", { ascending: true });

  const accessories: CustomerAccessory[] = (accessoryRows ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    price: a.price,
    stock: a.stock,
    imageUrl: a.image_url,
  }));

  // Payment channels for the reserve flow's payment step, in the order the admin
  // set (sort_order, then creation). Each carries its QR image URL (or null).
  const { data: paymentRows } = await supabase
    .from("payment_methods")
    .select("id, name, qr_url")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const paymentMethods: PaymentOption[] = (paymentRows ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    qrUrl: m.qr_url,
  }));

  // Blocked days for the reserve-flow calendar. The `blocked_dates` view already
  // expands each active rental into its rental days PLUS the wash day
  // (end_date + 1), one row per (dress, day) — so we just pass the flat list to
  // the calendar and let it decide what to disable per mode. See
  // <AvailabilityCalendar>.
  const { data: blockedRows } = await supabase
    .from("blocked_dates")
    .select("dress_id, dress_name, blocked_day");

  const blockedDates: BlockedDate[] = (blockedRows ?? [])
    // The view's columns are nullable in the generated types; keep only complete
    // rows so the calendar's keys are always real days.
    .filter((r) => r.dress_id && r.blocked_day)
    .map((r) => ({
      dressId: r.dress_id as string,
      dressName: r.dress_name ?? "",
      day: r.blocked_day as string,
    }));

  // Already-taken fitting slots, so the fitting form can disable them. Read from
  // the `booked_fitting_slots` view (which surfaces just date + time, without
  // the PII on bookings). Shaped into a { "YYYY-MM-DD": ["4:00 PM", …] } map.
  const { data: fittingRows } = await supabase
    .from("booked_fitting_slots")
    .select("fitting_date, fitting_time");

  const fittingsBooked: Record<string, string[]> = {};
  for (const r of fittingRows ?? []) {
    if (!r.fitting_date || !r.fitting_time) continue;
    (fittingsBooked[r.fitting_date] ??= []).push(r.fitting_time);
  }

  if (error) {
    // Surface the failure instead of rendering a silently-empty grid.
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-page-max flex-1 px-6 py-12">
          <p className="text-body-base text-state-error">
            Sorry — we couldn&apos;t load the collection right now. Please try
            again.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  // Shape each raw row into the plain DressDetail the client components use.
  // Photos are ordered cover-first (is_cover, then sort_order) so the card cover
  // and the gallery's first slide agree; reviews are newest-first.
  const cards: DressDetail[] = (dresses ?? []).map((d) => {
    const photos = [...(d.dress_photos ?? [])]
      .sort((a, b) => {
        if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
      .map((p) => ({ url: p.url, label: p.label }));

    const reviews = [...(d.reviews ?? [])]
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .map((r) => ({
        id: r.id,
        name: r.renter_name,
        body: r.body,
        photoUrl: r.photo_url,
      }));

    return {
      id: d.id,
      name: d.name,
      styleName: d.style_name,
      price: d.price,
      photos,
      sizes: d.dress_sizes ?? [],
      reviews,
    };
  });

  // The one-pager, in the prototype's stacked order:
  // NavBar → Hero → Our Collection → FAQ → footer. The dress detail / reserve /
  // payment flow is a modal wizard opened from a DressCard — never a route.
  return (
    <div id="top">
      <SiteHeader />

      <Hero />

      <main
        id="collection"
        className="mx-auto w-full max-w-page-max scroll-mt-24 px-6 pb-12 pt-2"
      >
        <SectionTitle subtitle="Only the sizes indicated are available">
          Our Collection
        </SectionTitle>

        {cards.length === 0 ? (
          // Empty state — no dresses in the catalogue yet.
          <div className="mt-8 rounded-lg border border-dashed border-border-strong bg-background-card p-10 text-center">
            <p className="text-body-lg text-text-primary">
              Our collection is being prepared.
            </p>
            <p className="mt-1 text-body-sm text-text-secondary">
              Please check back soon — new dresses are on their way.
            </p>
          </div>
        ) : (
          <CollectionGallery
            dresses={cards}
            accessories={accessories}
            paymentMethods={paymentMethods}
            blockedDates={blockedDates}
            fittingsBooked={fittingsBooked}
          />
        )}
      </main>

      <FaqSection />

      <SiteFooter />
    </div>
  );
}
