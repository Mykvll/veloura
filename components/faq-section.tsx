import {
  MapPin,
  ClipboardList,
  Tag,
  Ruler,
  CalendarCheck,
  PackageCheck,
  Wallet,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { SectionTitle } from "./section-title";
import { FITTING_LOCATION } from "@/lib/reserve";

/**
 * The FAQ SECTION of the customer one-pager (design/index.html → <Faq />).
 *
 * The prototype keeps FAQ as a stacked section on "/" (reached by the nav's
 * smooth scroll), NOT a separate route — content lifted verbatim from its FAQS
 * list. Each question is an InfoBox-style cream card: gold icon chip +
 * uppercase question label (brown — labels are body-coloured, only serif
 * titles are gold), then the answer. Static content, so a server component.
 */
const FAQS: { Icon: LucideIcon; q: string; a: string }[] = [
  {
    Icon: MapPin,
    q: "Where are you located?",
    a: "Harbour Park Residences, Mandaluyong City. No physical shop — we operate by appointment, with delivery and meet-ups (Near Harbour, Muñoz QC, SM North EDSA, SM Megamall).",
  },
  {
    Icon: ClipboardList,
    q: "How do I rent?",
    a: "Pick a dress, choose Reserve this dress, select your date, and pay the full rental fee. Only paid reservations secure the rental date.",
  },
  {
    Icon: Tag,
    q: "Rental rates",
    a: "1 day ₱300 · 2 days ₱500 · additional day ₱300. Security deposit ₱1,500 — refundable if everything is returned in good condition.",
  },
  {
    Icon: Ruler,
    q: "What sizes are available?",
    a: "Only the sizes indicated in the catalogue. Please check each dress's measurements before booking. No tailoring, cutting, resizing, or alterations.",
  },
  {
    Icon: CalendarCheck,
    q: "Is fitting available?",
    a: `Yes, by appointment only — ₱200 per session for the fitting day at ${FITTING_LOCATION}. Weekdays 4:00 & 7:00 PM; weekends 1:00, 3:00, 5:00, 7:00 & 9:00 PM. Bring one (1) valid ID.`,
  },
  {
    Icon: PackageCheck,
    q: "Return policy",
    a: "Return the dress, hanger, and garment bag clean and in good condition. Missing, stained, torn, or damaged items are deducted from the security deposit. Late returns count as an additional rental day.",
  },
  {
    Icon: Wallet,
    q: "Payment options",
    a: "GCash, Maya, GoTyme, MariBank (0976-522-6455), or bank transfer via UnionBank / BPI. QR codes are shown at the payment step.",
  },
  {
    Icon: MessageCircle,
    q: "Prefer to book on Messenger?",
    a: "No problem — DM Veloura by CM on Facebook and we'll handle the reservation for you.",
  },
];

export function FaqSection() {
  return (
    <section
      id="faq"
      className="mx-auto w-full max-w-page-max scroll-mt-24 px-6 pb-14 pt-2"
    >
      <SectionTitle subtitle="Everything you need to know before renting">
        Frequently Asked Questions
      </SectionTitle>

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FAQS.map(({ Icon, q, a }) => (
          <div
            key={q}
            className="flex flex-col gap-2.5 rounded-md border border-border-soft bg-background-card p-4 shadow-card"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-primary text-text-on-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              {/* Question = a label, so brown (text-heading), not gold. */}
              <h3 className="text-label-base uppercase tracking-[0.12em] text-text-heading">
                {q}
              </h3>
            </div>
            <p className="text-body-sm text-text-primary">{a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
