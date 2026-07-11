"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PaymentMethodEditorModal } from "./payment-method-editor-modal";
import { deletePaymentMethod } from "@/app/admin/(protected)/payment-actions";
import type { AdminPaymentMethod } from "./types";

/**
 * The "Payments" management grid (client component).
 *
 * One card per payment type (QR thumbnail, name, whether a QR is set) plus an
 * "Add payment type" tile. Each card has Edit and Remove; Remove asks for an
 * inline confirm step first (business rule 4 — destructive admin actions
 * confirm). The customer payment step reads this same list to build its channel
 * picker and show the matching QR. Mirrors <AccessoriesManager>.
 *
 * `editing` is: an AdminPaymentMethod (edit it) | "new" (create) | null (closed).
 */
export function PaymentMethodsManager({
  methods,
}: {
  methods: AdminPaymentMethod[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminPaymentMethod | "new" | null>(
    null,
  );
  // Which card is mid-delete-confirm (method id).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await deletePaymentMethod(id);
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
            Payments
          </h1>
          <p className="mt-1 text-body-sm text-text-secondary">
            The channels customers can pay with. Upload each one&apos;s QR — the
            customer scans it at the payment step.
          </p>
        </div>
        <span className="rounded-pill border border-border-strong px-3 py-1 text-label-sm uppercase tracking-label text-text-secondary">
          {methods.length} {methods.length === 1 ? "type" : "types"}
        </span>
      </div>

      {error ? (
        <p className="mt-4 text-body-sm text-state-error">{error}</p>
      ) : null}

      {/* Grid: payment-type cards + the Add tile. */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {methods.map((m) => (
          <div
            key={m.id}
            className="flex flex-col gap-3 rounded-lg border border-border-soft bg-background-card p-4 shadow-card"
          >
            {/* Top row: QR thumbnail + name/status */}
            <div className="flex items-start gap-3">
              {m.qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.qrUrl}
                  alt={`${m.name} QR code`}
                  className="h-16 w-16 flex-none rounded-sm border border-border-soft bg-white object-contain"
                />
              ) : (
                <span className="flex h-16 w-16 flex-none items-center justify-center rounded-sm border border-border-soft bg-background-panel text-center text-label-sm uppercase tracking-label text-text-secondary">
                  No QR
                </span>
              )}
              <div className="min-w-0 flex-1">
                <span className="block truncate text-label-base uppercase tracking-wide text-text-heading">
                  {m.name}
                </span>
                <span
                  className={`mt-2 inline-block rounded-pill px-2 py-0.5 text-label-sm uppercase tracking-label ${
                    m.qrUrl
                      ? "bg-state-success text-text-on-primary"
                      : "bg-brand-primary text-text-on-primary"
                  }`}
                >
                  {m.qrUrl ? "QR ready" : "QR missing"}
                </span>
              </div>
            </div>

            {/* Actions — Edit / Remove, with an inline confirm on Remove. */}
            <div className="flex flex-wrap gap-2">
              {confirmId === m.id ? (
                <>
                  <span className="w-full text-body-sm text-text-primary">
                    Remove <b>{m.name}</b>? Customers won&apos;t be able to pay
                    with it.
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
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
                    onClick={() => setEditing(m)}
                    className="rounded-pill border border-border-strong px-4 py-1.5 text-label-sm uppercase tracking-label text-text-primary transition-colors hover:bg-background-panel"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirmId(m.id);
                    }}
                    className="rounded-pill px-4 py-1.5 text-label-sm uppercase tracking-label text-state-error transition-colors hover:bg-background-panel"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Add payment type tile */}
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-background-card text-text-secondary transition duration-fast ease-soft hover:border-brand-primary hover:text-text-heading focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-brand-primary text-2xl leading-none text-text-on-primary">
            +
          </span>
          <span className="text-label-base uppercase tracking-label">
            Add payment type
          </span>
        </button>
      </div>

      {/* Editor modal — fresh instance per method / for "new". */}
      {editing ? (
        <PaymentMethodEditorModal
          key={editing === "new" ? "new" : editing.id}
          method={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
