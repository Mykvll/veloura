import { createClient } from "@/lib/supabase/server";
import { accAvail } from "@/lib/accessories";
import { AnalyticsSummary } from "@/components/admin/analytics-summary";
import { DressManager } from "@/components/admin/dress-manager";
import { AccessoriesManager } from "@/components/admin/accessories-manager";
import { PaymentMethodsManager } from "@/components/admin/payment-methods-manager";
import { BookingsManager } from "@/components/admin/bookings-manager";
import { HistoryManager } from "@/components/admin/history-manager";
import { BookingCalendar } from "@/components/admin/booking-calendar";
import type {
  AdminDress,
  AdminAccessory,
  AdminPaymentMethod,
  AdminBooking,
  AdminPastRental,
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

  // Manually logged pre-system rentals (the Rental History section). They
  // count toward earnings and wear-counts exactly like verified bookings, but
  // they skip verification and never touch availability. Newest first.
  const { data: pastRentals } = await supabase
    .from("rental_history")
    .select("id, dress_id, dress_name, renter_name, start_date, end_date, amount_paid")
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  // Wear-counts: verified bookings + logged history both count as a "wear",
  // so the "Rented N×" badge and "Most rented" reflect the dress's whole life.
  const rentedByDress = new Map<string, number>();
  const rentalCountByName = new Map<string, number>();
  const countWear = (dressId: string | null, dressName: string | null) => {
    if (dressId) {
      rentedByDress.set(dressId, (rentedByDress.get(dressId) ?? 0) + 1);
    }
    if (dressName) {
      rentalCountByName.set(
        dressName,
        (rentalCountByName.get(dressName) ?? 0) + 1,
      );
    }
  };
  for (const b of verified ?? []) countWear(b.dress_id, b.dress_name);
  for (const h of pastRentals ?? []) countWear(h.dress_id, h.dress_name);

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
  // /admin/accessories page which is now folded in here). `rented` is no longer
  // stored — it's derived below as "units out on rent TODAY".
  const { data: accessories, error: accessoriesError } = await supabase
    .from("accessories")
    .select("id, name, price, cost, stock, unavailable_units, image_url")
    .order("created_at", { ascending: false });

  // "Out on rent today" per accessory (units_out): how many active bookings
  // (unexpired hold / pending / verified rentals) are holding each accessory on
  // a range that covers today. This is the date-aware replacement for the old
  // stored `rented` count — the admin readouts ("N out on rent", analytics)
  // show a truthful today-snapshot without any manual field.
  const { data: outTodayRows } = await supabase
    .from("accessory_rented_today")
    .select("accessory_id, units_out");
  const rentedTodayByAccessory = new Map<string, number>();
  for (const r of outTodayRows ?? []) {
    if (!r.accessory_id) continue; // view col is nullable
    rentedTodayByAccessory.set(r.accessory_id, r.units_out ?? 0);
  }

  // The days each accessory is already fully booked — the SAME view the customer
  // picker reads. The admin needs it for two things: the "is it free on…?" date
  // check in the accessories grid, and the date-aware add-on picker in the
  // manual-booking modal (so a walk-in can't be given an accessory that's out).
  const { data: accBlockedRows } = await supabase
    .from("accessory_blocked_dates")
    .select("accessory_id, blocked_day");
  const blockedDaysByAccessory = new Map<string, string[]>();
  for (const r of accBlockedRows ?? []) {
    if (!r.accessory_id || !r.blocked_day) continue; // view cols are nullable
    const list = blockedDaysByAccessory.get(r.accessory_id) ?? [];
    list.push(r.blocked_day);
    blockedDaysByAccessory.set(r.accessory_id, list);
  }

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

  // Rentals for the Bookings section (fittings have no payment proof to verify).
  // Newest first so the latest reservation sits at the top. Admin can read every
  // booking incl. the PII, per the "admin read bookings" policy.
  const { data: rentalRows } = await supabase
    .from("bookings")
    .select(
      `id, renter_name, dress_id, dress_name, contact, start_date, end_date,
       deliver_time, amount, payment_status, manual, proof_url, created_at`,
    )
    .eq("type", "rent")
    // Live customer holds are transient (a 10-min payment window) — they aren't
    // real bookings yet, so keep them out of the admin list, calendar, and
    // analytics. They still block dates for customers via blocked_dates.
    .neq("payment_status", "hold")
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

  // Shape accessory rows the same way the old accessories page did. rented and
  // unavailable_units default to 0 for rows created before those columns existed.
  const accessoryRows: AdminAccessory[] = (accessories ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    price: a.price,
    cost: a.cost ?? 0,
    stock: a.stock,
    rented: rentedTodayByAccessory.get(a.id) ?? 0, // derived: out on rent today
    unavailableUnits: a.unavailable_units ?? 0,
    imageUrl: a.image_url,
    blockedDays: blockedDaysByAccessory.get(a.id) ?? [],
  }));

  // The add-on options for the manual-booking modal — same rows, trimmed to what
  // the picker needs (availability is worked out client-side from blockedDays
  // against the range the admin picks).
  const manualAccessoryOptions = accessoryRows.map((a) => ({
    id: a.id,
    name: a.name,
    price: a.price,
    stock: a.stock,
    unavailableUnits: a.unavailableUnits,
    blockedDays: a.blockedDays,
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
  // Which add-ons go out with each rental — the hand-over checklist shown on
  // every booking card. Names come from the joined accessory (null if it was
  // deleted; the link's price_at_booking still keeps analytics honest).
  const accessoryNamesByBooking = new Map<string, string[]>();
  const rentalIds = (rentalRows ?? []).map((b) => b.id);
  if (rentalIds.length > 0) {
    const { data: bookingAccRows } = await supabase
      .from("booking_accessories")
      .select("booking_id, accessories(name)")
      .in("booking_id", rentalIds);
    for (const r of bookingAccRows ?? []) {
      const name = (r.accessories as { name: string } | null)?.name;
      if (!r.booking_id || !name) continue;
      const list = accessoryNamesByBooking.get(r.booking_id) ?? [];
      list.push(name);
      accessoryNamesByBooking.set(r.booking_id, list);
    }
  }

  const allBookings: AdminBooking[] = await Promise.all(
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
        dressId: b.dress_id,
        contact: b.contact,
        start: b.start_date,
        end: b.end_date,
        deliver: b.deliver_time,
        amount: b.amount ?? 0,
        status: b.payment_status,
        manual: b.manual,
        bookedAt: b.created_at,
        proofUrl,
        accessories: accessoryNamesByBooking.get(b.id) ?? [],
      };
    }),
  );

  // Split bookings: completed (verified + wash day in past) vs active.
  // A booking is completed when: payment_status = "verified" AND end_date + 1 < today.
  // Completed bookings move to Rental History; active bookings stay in Bookings.
  const today = new Date().toISOString().split("T")[0];
  const bookingRows = allBookings.filter((b) => {
    if (b.status !== "verified" || !b.end) return true; // non-verified stay active
    const washDay = new Date(b.end);
    washDay.setDate(washDay.getDate() + 1);
    const washDayIso = washDay.toISOString().split("T")[0];
    return washDayIso >= today; // keep if wash day is today or in future
  });

  const completedBookings = allBookings.filter((b) => {
    if (b.status !== "verified" || !b.end) return false;
    const washDay = new Date(b.end);
    washDay.setDate(washDay.getDate() + 1);
    const washDayIso = washDay.toISOString().split("T")[0];
    return washDayIso < today; // completed if wash day is in past
  });

  // ---- Analytics (verified bookings + logged history) -----------------------
  // Computed here so it recomputes on every load; the page is force-dynamic and
  // every admin mutation calls router.refresh(), so the cards always reflect the
  // current bookings. Money is in whole pesos.
  //
  // Total earned = verified booking revenue (rental fee + add-ons) PLUS what
  // logged pre-system rentals brought in — the business earned before this app
  // existed, and history entries count as earned immediately (no verification).
  const verifiedEarned = (verified ?? []).reduce(
    (s, b) => s + (b.amount ?? 0),
    0,
  );
  const loggedRevenue = (pastRentals ?? []).reduce(
    (s, h) => s + h.amount_paid,
    0,
  );
  const totalEarned = verifiedEarned + loggedRevenue;
  const rentalRevenue = verifiedEarned - accessoryRevenue;

  // Inventory spend: what the shop paid to own the catalogue on hand.
  const dressSpend = rows.reduce((s, d) => s + d.cost, 0);
  const accessorySpend = accessoryRows.reduce((s, a) => s + a.cost * a.stock, 0);
  const totalSpend = dressSpend + accessorySpend;

  // Most-rented dress (verified + logged), by snapshotted name.
  let topDress = "";
  let topDressCount = 0;
  for (const [name, count] of rentalCountByName) {
    if (count > topDressCount) {
      topDress = name;
      topDressCount = count;
    }
  }

  // ---- Calendar data --------------------------------------------------------
  // Build from `allBookings`, not `bookingRows`: the latter drops COMPLETED
  // rentals, but the calendar is a history view too — admin pages back to see
  // past rentals. The component expands each into its start..end + wash day.
  const bookingCalendarRentals: CalendarRental[] = allBookings
    .filter((b) => (b.status === "pending" || b.status === "verified") && b.start && b.end)
    .map((b) => ({
      id: b.id,
      dress: b.dress,
      renter: b.renter,
      start: b.start as string,
      end: b.end as string,
      deliver: b.deliver,
      // Already resolved above (accessoryNamesByBooking) for the booking cards;
      // the expanded calendar itemises the same add-ons inside each day cell.
      accessories: b.accessories,
    }));

  // Logged pre-system rentals (rental_history) are past rentals too. `logged`
  // marks them historical so the calendar shows their days but no wash day.
  const loggedCalendarRentals: CalendarRental[] = (pastRentals ?? [])
    .filter((h) => h.start_date && h.end_date)
    .map((h) => ({
      id: h.id,
      dress: h.dress_name ?? "Dress",
      renter: h.renter_name,
      start: h.start_date,
      end: h.end_date,
      deliver: null,
      // rental_history predates this app and never recorded add-ons.
      accessories: [],
      logged: true,
    }));

  const calendarRentals: CalendarRental[] = [
    ...bookingCalendarRentals,
    ...loggedCalendarRentals,
  ];

  const calendarFittings: CalendarFitting[] = (fittingRows ?? []).map((f) => ({
    id: f.id,
    dress: f.dress_name ?? "Dress",
    renter: f.renter_name,
    date: f.fitting_date as string,
    time: f.fitting_time,
  }));

  const verifiedCount = verified?.length ?? 0;
  const loggedCount = pastRentals?.length ?? 0;
  // "Per rental" = every rental that earned money: verified + logged.
  const rentalsCounted = verifiedCount + loggedCount;
  const analytics: AnalyticsData = {
    totalEarned,
    rentalRevenue,
    accessoryRevenue,
    loggedRevenue,
    totalSpend,
    dressSpend,
    accessorySpend,
    net: totalEarned - totalSpend,
    verifiedCount,
    // Rentals still awaiting review (from the rows we already fetched).
    pending: bookingRows.filter((b) => b.status === "pending").length,
    loggedCount,
    topDress,
    topDressCount,
    dressesLive: rows.filter((d) => d.status === "live").length,
    accessoriesCount: accessoryRows.length,
    // Un-rentable accessories, split by reason: fully out on rent (coming back)
    // vs. none available and none on rent (pulled from service / none owned).
    // "low" still counts the ones you CAN rent but are running short of.
    rentedOut: accessoryRows.filter(
      (a) => accAvail(a) === 0 && a.rented > 0,
    ).length,
    unavailable: accessoryRows.filter(
      (a) => accAvail(a) === 0 && a.rented === 0,
    ).length,
    lowStock: accessoryRows.filter(
      (a) => accAvail(a) > 0 && accAvail(a) <= 2,
    ).length,
    avgPerRental: rentalsCounted
      ? Math.round(totalEarned / rentalsCounted)
      : null,
  };

  // Shape history rows for the Rental History section: completed bookings
  // (merged with manually logged pre-system rentals), sorted newest first.
  const completedBookingsAsHistory: AdminPastRental[] = completedBookings.map((b) => ({
    id: b.id,
    renter: b.renter,
    dress: b.dress,
    start: b.start as string,
    end: b.end as string,
    amount: b.amount,
    source: "Booking",
    contact: b.contact,
    dressId: b.dressId,
  }));

  const loggedAsHistory: AdminPastRental[] = (pastRentals ?? []).map((h) => ({
    id: h.id,
    renter: h.renter_name,
    dress: h.dress_name,
    start: h.start_date,
    end: h.end_date,
    amount: h.amount_paid,
    source: "Logged",
  }));

  // Merge and sort by start_date desc (newest first).
  const historyRows = [...completedBookingsAsHistory, ...loggedAsHistory].sort(
    (a, b) => b.start.localeCompare(a.start) || b.id.localeCompare(a.id),
  );

  const historyDressOptions = rows.map((d) => ({
    id: d.id,
    name: d.name,
    price: d.price,
  }));

  // Stacked sections on one page. The anchor ids (#calendar, #bookings, …) are
  // what the top nav scrolls to; scroll-mt keeps a section's heading clear of
  // the header when you jump to it. New order: Calendar, Bookings, Dresses,
  // Accessories, History, Analytics, Payments.
  return (
    <div className="flex flex-col gap-20">
      <section id="calendar" className="scroll-mt-24">
        <BookingCalendar
          rentals={calendarRentals}
          fittings={calendarFittings}
        />
      </section>

      <section id="bookings" className="scroll-mt-24">
        {/* historyDressOptions doubles as the manual-booking dress picker. */}
        <BookingsManager
          bookings={bookingRows}
          dresses={historyDressOptions}
          accessories={manualAccessoryOptions}
        />
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

      <section id="history" className="scroll-mt-24">
        <HistoryManager entries={historyRows} dresses={historyDressOptions} />
      </section>

      <section id="analytics" className="scroll-mt-24">
        <AnalyticsSummary data={analytics} />
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
    </div>
  );
}
