import {
  Banknote,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  CheckCheck,
  Crown,
  Shirt,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionTitle } from "@/components/section-title";
import type { AnalyticsData } from "./types";

/** Peso formatter, matching the rest of the admin UI. */
function peso(n: number) {
  return `₱${n.toLocaleString("en-PH")}`;
}

/** The colour of a card's icon chip. Gold is the default; green/red flag the
 *  money cards (earned vs. spent) and the net position's direction. */
type Tone = "gold" | "success" | "error";

/**
 * One analytics stat card: icon chip, big value, uppercase label, optional
 * sub-line. The value renders in heading brown (a spec-style numeric readout,
 * not a customer-facing price).
 */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "gold",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
}) {
  const chipClass =
    tone === "success"
      ? "bg-state-success"
      : tone === "error"
        ? "bg-state-error"
        : "bg-brand-primary";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-background-card p-4 shadow-card">
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-pill text-text-on-primary ${chipClass}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      {/* Numeric readout — truncate keeps a long dress name (Most rented) on one line. */}
      <div className="truncate text-price-lg text-text-heading">{value}</div>
      <div className="text-label-sm uppercase tracking-label text-text-secondary">
        {label}
      </div>
      {sub ? <div className="text-body-sm text-text-secondary">{sub}</div> : null}
    </div>
  );
}

/**
 * The Analytics SECTION at the top of the admin page (server component).
 *
 * Pure display: every number is computed on the server in the admin page from
 * VERIFIED bookings (business rule 3) plus manually logged pre-system rentals
 * (the Rental History section) and passed in via `data`. Because the
 * admin page is force-dynamic and every mutation calls router.refresh(), these
 * cards recompute whenever bookings change — no client state here.
 *
 * Eight cards, 2-up on mobile and 4-up on desktop, matching admin.html:
 * Total earned, Inventory spend, Net position, Verified rentals, Most rented,
 * Dresses live, Accessories, and Avg. per rental.
 */
export function AnalyticsSummary({ data }: { data: AnalyticsData }) {
  const inTheBlack = data.net >= 0;

  return (
    <div>
      {/* Centered gold section title with sparkles, like every admin section. */}
      <SectionTitle subtitle="Verified rentals + logged history — updates as you verify, delete, or log">
        Analytics
      </SectionTitle>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          icon={Banknote}
          tone="success"
          label="Total earned"
          value={peso(data.totalEarned)}
          sub={`Rentals ${peso(data.rentalRevenue)} · add-ons ${peso(
            data.accessoryRevenue,
          )} · logged ${peso(data.loggedRevenue)}`}
        />
        <StatCard
          icon={ShoppingCart}
          tone="error"
          label="Inventory spend"
          value={peso(data.totalSpend)}
          sub={`Dresses ${peso(data.dressSpend)} · accessories ${peso(
            data.accessorySpend,
          )}`}
        />
        <StatCard
          icon={inTheBlack ? TrendingUp : TrendingDown}
          tone={inTheBlack ? "success" : "error"}
          label="Net position"
          value={peso(data.net)}
          sub={inTheBlack ? "In the black" : "Still recovering cost"}
        />
        <StatCard
          icon={CheckCheck}
          label="Verified rentals"
          value={data.verifiedCount}
          sub={
            data.pending
              ? `${data.pending} awaiting verification`
              : "None pending"
          }
        />
        <StatCard
          icon={Crown}
          label="Most rented"
          value={data.topDress || "—"}
          sub={
            data.topDress
              ? `${data.topDressCount} rental${data.topDressCount > 1 ? "s" : ""}`
              : "No rentals yet"
          }
        />
        <StatCard
          icon={Shirt}
          label="Dresses live"
          value={data.dressesLive}
          sub="In the catalogue"
        />
        <StatCard
          icon={Sparkles}
          label="Accessories"
          value={data.accessoriesCount}
          sub={`${data.outStock} out · ${data.lowStock} low stock`}
        />
        <StatCard
          icon={Wallet}
          label="Avg. per rental"
          value={data.avgPerRental != null ? peso(data.avgPerRental) : "—"}
          sub="Across verified + logged"
        />
      </div>
    </div>
  );
}
