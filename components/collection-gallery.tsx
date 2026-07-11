"use client";

import { useState } from "react";
import { DressCard } from "./dress-card";
import { DressDetailModal, type DressDetail } from "./dress-detail-modal";
import type { CustomerAccessory } from "./accessory-picker";

/**
 * The collection grid + dress-detail modal, on one page ("/").
 *
 * This is the client half of the collection page. The server page fetches every
 * non-hidden dress (with all the detail the modal needs) and passes them here;
 * this component renders the card grid and owns which dress's modal is open.
 *
 * MODAL STATE: we keep a single `openId` (the dress being viewed) rather than a
 * boolean + a copy of the dress. Tapping a card sets `openId`; the modal reads
 * the matching dress straight out of the `dresses` array we already have. Only
 * one modal exists at a time, and closing just clears `openId`. Because the
 * dress data is already in memory, opening the modal is instant — no navigation,
 * no second fetch.
 */
export function CollectionGallery({
  dresses,
  accessories,
}: {
  dresses: DressDetail[];
  /** Add-on accessories for the reserve flow — the same list for every dress. */
  accessories: CustomerAccessory[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openDress = dresses.find((d) => d.id === openId) ?? null;

  return (
    <>
      {/* Responsive grid: 2 columns on mobile, 3 on tablet, 4 on desktop. */}
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
        {dresses.map((dress) => (
          <DressCard
            key={dress.id}
            dress={{
              id: dress.id,
              name: dress.name,
              styleName: dress.styleName,
              price: dress.price,
              // The gallery photos are pre-sorted (cover first), so photo 0 is
              // the cover to show on the card.
              coverUrl: dress.photos[0]?.url ?? null,
            }}
            onClick={() => setOpenId(dress.id)}
          />
        ))}
      </div>

      {/* Detail modal — rendered only while a dress is open. */}
      {openDress ? (
        <DressDetailModal
          dress={openDress}
          accessories={accessories}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
