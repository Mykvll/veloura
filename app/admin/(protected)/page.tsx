import { createClient } from "@/lib/supabase/server";
import { AnalyticsSummary } from "@/components/admin/analytics-summary";
import { DressManager } from "@/components/admin/dress-manager";
import { AccessoriesManager } from "@/components/admin/accessories-manager";
import { PaymentMethodsManager } from "@/components/admin/payment-methods-manager";
import { BookingsManager } from "@/components/admin/bookings-manager";
import { BookingCalendar } from "@/components/admin/booking-calendar";
import type {
  AdminDress,
  AdminAccessory,
  AdminPaymentMethod,
  AdminBooking,
  AnalyticsData,
  CalendarRental,
  CalendarFitting,
} from "@/components/admin/types";

// Session-based + always-fresh: the list must reflect writes immediately.
export const dynamic = "force-dynamic";

/**
 * Admin dashboard (/admin) — the whole admin experience on ONE page.
 *
 * Every feature is a stacked SECTION on this single route rather than its own
 * page, and the top nav scrolls between them.
 *
 * This is a server component: it fetches everything both sections need — every
 * dress with its child data + verified-rental counts, and every accessory —
 * shapes the raw Supabase rows into the plain objects the client components
 * work with, and hands them to <DressManager> and <AccessoriesManager>, which
 * own their own grids and editor modals.
 */
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  // Pull dresses + everything the editor needs, newest first so a freshly
  // added dress lands at the top of the grid.
  const { data: dresses, error } = await supabase
    .from("dresses")
    .select(
      `id, name, style_name, price, cost, status,
       dress_photos(url, label, is_cover, sort_order),
       dress_sizes(size, bust_cm, waist_cm, length_cm),
       reviews(renter_name, body, photo_url)`,
    )
    .order("created_at", { ascending: false });

  // Verified bookings drive both the per-dress "Rented N×" badge and the
  // Analytics section. Business rule 3: analytics count 'verified' only. (A
  // fitting never reaches 'verified' — it has no payment proof to verify — so
  // every verified row here is a real rental sale.) We pull the amount and the
  // snapshotted dress name so we can total revenue and find the most-rented.
  const { data: verified } = await supabase
    .from("bookings")
    .select("id, dress_id, dress_name, amount")
    .eq("payment_status", "verified");

  const rentedByDress = new Map<string, number>();
  const rentalCountByName = new Map<string, number>();
  for (const b of verified ?? []) {
    if (b.dress_id) {
      rentedByDress.set(b.dress_id, (rentedByDress.get(b.dress_id) ?? 0) + 1);
    }
    if (b.dress_name) {
      rentalCountByName.set(
        b.dress_name,
        (rentalCountByName.get(b.dress_name) ?? 0) + 1,
      );
    }
  }

  // Accessory add-on revenue for those verified bookings. Each add-on's price is
  // snapshotted on booking_accessories.price_at_booking, so this is immune to
  // later accessory price edits. The rental fee is then earned − add-ons.
  const verifiedIds = (verified ?? []).map((b) => b.id);
  let accessoryRevenue = 0;
  if (verifiedIds.length > 0) {
    const { data: addonRows } = await supabase
      .from("booking_accessories")
      .select("price_at_booking")
      .in("booking_id", verifiedIds);
    accessoryRevenue = (addonRows ?? []).reduce(
      (sum, r) => sum + (r.price_at_booking ?? 0),
      0,
    );
  }

  // Accessories for the second section (newest first, same as the old
  // /admin/accessories page which is now folded in here).
  const { data: accessories, error: accessoriesError } = await supabase
    .from("accessories")
    .select("id, name, price, cost, stock, image_url")
    .order("created_at", { ascending: false });

  // Payment channels for the third section. Ordered the same way the customer
  // picker shows them (sort_order, then creation order) so admin + customer
  // agree on the list.
  const { data: paymentMethods, error: paymentMethodsError } = await supabase
    .from("payment_methods")
    .select("id, name, qr_url")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // Active fittings for the Calendar section — pending|verified only, matching
  // booked_fitting_slots so the calendar agrees with what actually blocks a
  // slot. (Rentals for the calendar are derived from the Bookings rows below.)
  const { data: fittingRows } = await supabase
    .from("bookings")
    .select("id, dress_name, renter_name, fitting_date, fitting_time")
    .eq("type", "fitting")
    .in("payment_status", ["pending", "verified"])
    .not("fitting_date", "is", null);

  // Rentals for the Bookings & Payments section (fittings have no payment proof
  // to verify). Newest first so the latest reservation sits at the top. Admin
  // can read every booking incl. the PII, per the "admin read bookings" policy.
  const { data: rentalRows } = await supabase
    .from("bookings")
    .select(
      `id, renter_name, dress_name, contact, start_date, end_date,
       deliver_time, amount, payment_status, proof_url`,
    )
    .eq("type", "rent")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div>
        <h1 className="font-display text-display-lg uppercase tracking-display text-text-accent">
          Manage Collection
        </h1>
        <p className="mt-4 text-body-base text-state-error">
          Couldn&apos;t load dresses right now: {error.message}
        </p>
      </div>
    );
  }

  // Shape each raw row into a plain, serializable AdminDress. Photos are sorted
  // so the cover (is_cover, else lowest sort_order) comes first — the editor
  // treats index 0 as the cover.
  const rows: AdminDress[] = (dresses ?? []).map((d) => {
    const photos = [...(d.dress_photos ?? [])].sort((a, b) => {
      if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return {
      id: d.id,
      name: d.name,
      styleName: d.style_name ?? "",
      price: d.price,
      cost: d.cost ?? 0,
      status: d.status,
      photos: photos.map((p) => ({ url: p.url, label: p.label ?? "Front" })),
      sizes: (d.dress_sizes ?? []).map((s) => ({
        size: s.size,
        bust: s.bust_cm,
        waist: s.waist_cm,
        length: s.length_cm,
      })),
      reviews: (d.reviews ?? []).map((r) => ({
        name: r.renter_name,
        body: r.body,
        photoUrl: r.photo_url,
      })),
      rentedCount: rentedByDress.get(d.id) ?? 0,
    };
  });

  // Shape accessory rows the same way the old accessories page did.
  const accessoryRows: AdminAccessory[] = (accessories ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    price: a.price,
    cost: a.cost ?? 0,
    stock: a.stock,
    imageUrl: a.image_url,
  }));

  // Shape payment-method rows for the Payments section.
  const paymentMethodRows: AdminPaymentMethod[] = (paymentMethods ?? []).map(
    (m) => ({ id: m.id, name: m.name, qrUrl: m.qr_url }),
  );

  // Shape bookings for the Bookings section. The payment proof sits in the
  // PRIVATE `payment-proofs` bucket — there's no public URL, and RLS blocks the
  // browser from reading it directly. So here on the server (as the logged-in
  // admin) we mint a short-lived SIGNED URL for each proof: a link with a
  // time-limited token baked in that lets the admin's browser load just that one
  // file for the next hour, without ever making the bucket public.
  const bookingRows: AdminBooking[] = await Promise.all(
    (rentalRows ?? []).map(async (b) => {
      let proofUrl: string | null = null;
      if (b.proof_url) {
        const { data: signed } = await supabase.storage
          .from("payment-proofs")
          .createSignedUrl(b.proof_url, 60 * 60); // valid 1 hour
        proofUrl = signed?.signedUrl ?? null;
      }
      return {
        id: b.id,
        renter: b.renter_name,
        dress: b.dress_name ?? "Dress",
        contact: b.contact,
        start: b.start_date,
        end: b.end_date,
        deliver: b.deliver_time,
        amount: b.amount ?? 0,
        status: b.payment_status,
        proofUrl,
      };
    }),
  );

  // ---- Analytics (VERIFIED only) --------------------------------------------
  // Computed here so it recomputes on every load; the page is force-dynamic and
  // every admin mutation calls router.refresh(), so the cards always reflect the
  // current bookings. Money is in whole pesos.
  const totalEarned = (verified ?? []).reduce((s, b) => s + (b.amount ?? 0), 0);
  const rentalRevenue = totalEarned - accessoryRevenue;

  // Inventory spend: what the shop paid to own the catalogue on hand.
  const dressSpend = rows.reduce((s, d) => s + d.cost, 0);
  const accessorySpend = accessoryRows.reduce((s, a) => s + a.cost * a.stock, 0);
  const totalSpend = dressSpend + accessorySpend;

  // Most-rented dress (verified only), by snapshotted name.
  let topDress = "";
  let topDressCount = 0;
  for (const [name, count] of rentalCountByName) {
    if (count > topDressCount) {
      topDress = name;
      topDressCount = count;
    }
  }

  // ---- Calendar data --------------------------------------------------------
  // Active rentals (pending|verified with dates) drive the calendar's rented /
  // wash days; the component itself expands each into its start..end + wash day.
  const calendarRentals: CalendarRental[] = bookingRows
    .filter((b) => (b.status === "pending" || b.status === "verified") && b.start && b.end)
    .map((b) => ({
      id: b.id,
      dress: b.dress,
      renter: b.renter,
      start: b.start as string,
      end: b.end as string,
      deliver: b.deliver,
    }));

  const calendarFittings: CalendarFitting[] = (fittingRows ?? []).map((f) => ({
    id: f.id,
    dress: f.dress_name ?? "Dress",
    renter: f.renter_name,
    date: f.fitting_date as string,
    time: f.fitting_time,
  }));

  const verifiedCount = verified?.length ?? 0;
  const analytics: AnalyticsData = {
    totalEarned,
    rentalRevenue,
    accessoryRevenue,
    totalSpend,
    dressSpend,
    accessorySpend,
    net: totalEarned - totalSpend,
    verifiedCount,
    // Rentals still awaiting review (from the rows we already fetched).
    pending: bookingRows.filter((b) => b.status === "pending").length,
    topDress,
    topDressCount,
    dressesLive: rows.filter((d) => d.status === "live").length,
    accessoriesCount: accessoryRows.length,
    outStock: accessoryRows.filter((a) => a.stock <= 0).length,
    lowStock: accessoryRows.filter((a) => a.stock > 0 && a.stock <= 2).length,
    avgPerRental: verifiedCount ? Math.round(totalEarned / verifiedCount) : null,
  };

  // Stacked sections on one page. The anchor ids (#analytics, #dresses, …) are
  // what the top nav scrolls to; scroll-mt keeps a section's heading clear of
  // the header when you jump to it.
  return (
    <div className="flex flex-col gap-20">
      <section id="analytics" className="scroll-mt-24">
        <AnalyticsSummary data={analytics} />
      </section>

      <section id="dresses" className="scroll-mt-24">
        <DressManager dresses={rows} />
      </section>

      <section id="accessories" className="scroll-mt-24">
        {accessoriesError ? (
          <div>
            <h2 className="font-display text-display-lg uppercase tracking-display text-text-accent">
              Accessories
            </h2>
            <p className="mt-4 text-body-base text-state-error">
              Couldn&apos;t load accessories right now: {accessoriesError.message}
            </p>
          </div>
        ) : (
          <AccessoriesManager accessories={accessoryRows} />
        )}
      </section>

      <section id="payments" className="scroll-mt-24">
        {paymentMethodsError ? (
          <div>
            <h2 className="font-display text-display-lg uppercase tracking-display text-text-accent">
              Payments
            </h2>
            <p className="mt-4 text-body-base text-state-error">
              Couldn&apos;t load payment types right now:{" "}
              {paymentMethodsError.message}
            </p>
          </div>
        ) : (
          <PaymentMethodsManager methods={paymentMethodRows} />
        )}
      </section>

      <section id="bookings" className="scroll-mt-24">
        <BookingsManager bookings={bookingRows} />
      </section>

      <section id="calendar" className="scroll-mt-24">
        <BookingCalendar
          rentals={calendarRentals}
          fittings={calendarFittings}
        />
      </section>
    </div>
  );
}
