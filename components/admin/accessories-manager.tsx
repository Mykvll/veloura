"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AccessoryEditorModal } from "./accessory-editor-modal";
import { deleteAccessory } from "@/app/admin/(protected)/accessory-actions";
import type { AdminAccessory } from "./types";

/** Peso formatter, matching the rest of the admin UI. */
function peso(n: number) {
  return `₱${n.toLocaleString("en-PH")}`;
}

/**
 * The "Accessories" management grid (client component).
 *
 * One card per accessory (image, name, rental price, unit cost, stock badge)
 * plus an "Add accessory" tile. Each card has Edit and Remove; Remove asks for
 * an inline confirm step first (business rule 4). The editor modal's open/close
 * state lives here.
 *
 * `editing` is: an AdminAccessory (edit it) | "new" (create) | null (closed).
 */
export function AccessoriesManager({
  accessories,
}: {
  accessories: AdminAccessory[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminAccessory | "new" | null>(null);
  // Which card is mid-delete-confirm (accessory id), and the pending remove.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteAccessory(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div>
      {/* Header — title + count */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-display-lg uppercase tracking-display text-text-accent">
            Accessories
          </h1>
          <p className="mt-1 text-body-sm text-text-secondary">
            Limited stock — customers can add these to a rental until they run
            out.
          </p>
        </div>
        <span className="rounded-pill border border-border-strong px-3 py-1 text-label-sm uppercase tracking-label text-text-secondary">
          {accessories.length}{" "}
          {accessories.length === 1 ? "accessory" : "accessories"}
        </span>
      </div>

      {error ? (
        <p className="mt-4 text-body-sm text-state-error">{error}</p>
      ) : null}

      {/* Grid: accessory cards + the Add tile. */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accessories.map((a) => {
          const out = a.stock <= 0;
          const low = a.stock > 0 && a.stock <= 2;
          // Stock badge: red when out, gold when low (≤2), green otherwise.
          const badgeClass = out
            ? "bg-state-error text-text-on-primary"
            : low
              ? "bg-brand-primary text-text-on-primary"
              : "bg-state-success text-text-on-primary";
          return (
            <div
              key={a.id}
              className="flex flex-col gap-3 rounded-lg border border-border-soft bg-background-card p-4 shadow-card"
            >
              {/* Top row: image + name/price/stock */}
              <div className="flex items-start gap-3">
                {a.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.imageUrl}
                    alt={a.name}
                    className="h-16 w-16 flex-none rounded-sm border border-border-soft object-cover"
                  />
                ) : (
                  <span className="flex h-16 w-16 flex-none items-center justify-center rounded-sm border border-border-soft bg-background-panel text-label-sm uppercase tracking-label text-text-secondary">
                    No photo
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-label-base uppercase tracking-wide text-text-heading">
                      {a.name}
                    </span>
                    {/* Rental price — gold, per the title/accent colour rule. */}
                    <span className="flex-none text-price-base text-text-accent">
                      +{peso(a.price)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-pill px-2 py-0.5 text-label-sm uppercase tracking-label ${badgeClass}`}
                    >
                      {out ? "Out of stock" : `${a.stock} in stock`}
                    </span>
                    <span className="text-body-sm text-text-secondary">
                      unit cost {peso(a.cost)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions — Edit / Remove, with an inline confirm on Remove. */}
              <div className="flex flex-wrap gap-2">
                {confirmId === a.id ? (
                  <>
                    <span className="w-full text-body-sm text-text-primary">
                      Remove <b>{a.name}</b>? This can&apos;t be undone.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      disabled={isPending}
                      className="rounded-pill bg-state-error px-4 py-1.5 text-label-sm uppercase tracking-label text-text-on-primary transition-colors disabled:opacity-60"
                    >
                      {isPending ? "Removing…" : "Yes, remove"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      disabled={isPending}
                      className="rounded-pill border border-border-strong px-4 py-1.5 text-label-sm uppercase tracking-label text-text-secondary transition-colors hover:bg-background-panel disabled:opacity-60"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      className="rounded-pill border border-border-strong px-4 py-1.5 text-label-sm uppercase tracking-label text-text-primary transition-colors hover:bg-background-panel"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setConfirmId(a.id);
                      }}
                      className="rounded-pill px-4 py-1.5 text-label-sm uppercase tracking-label text-state-error transition-colors hover:bg-background-panel"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Add accessory tile */}
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-background-card text-text-secondary transition duration-fast ease-soft hover:border-brand-primary hover:text-text-heading focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-brand-primary text-2xl leading-none text-text-on-primary">
            +
          </span>
          <span className="text-label-base uppercase tracking-label">
            Add accessory
          </span>
        </button>
      </div>

      {/* Editor modal — fresh instance per accessory / for "new". */}
      {editing ? (
        <AccessoryEditorModal
          key={editing === "new" ? "new" : editing.id}
          accessory={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
