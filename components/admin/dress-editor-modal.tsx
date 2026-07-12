"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { createClient } from "@/lib/supabase/client";
import { saveDress, deleteDress } from "@/app/admin/(protected)/dress-actions";
import { SIZE_OPTIONS, PHOTO_LABELS, type AdminDress } from "./types";

/* ------------------------------------------------------------------ */
/* Small brand-token field primitives, local to the editor.          */
/* ------------------------------------------------------------------ */

function FieldLabel({
  children,
  required,
  hint,
}: {
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
      <span className="text-label-sm uppercase tracking-label text-text-heading">
        {children}
        {required ? <span className="text-text-accent"> *</span> : null}
      </span>
      {hint ? <span className="text-body-sm text-text-secondary">{hint}</span> : null}
    </div>
  );
}

const inputClass =
  "min-h-tap w-full rounded-sm border border-border-soft bg-white px-4 py-2 text-body-base text-text-primary outline-none placeholder:text-text-secondary focus:border-border-accent focus:shadow-focus";

/* ------------------------------------------------------------------ */
/* Editor state types (mirror DressInput, but photos/reviews hold the */
/* already-uploaded URL).                                             */
/* ------------------------------------------------------------------ */

type PhotoDraft = { url: string; label: string };
type SizeDraft = {
  size: string;
  bust: number | null;
  waist: number | null;
  length: number | null;
};
type ReviewDraft = { name: string; body: string; photoUrl: string | null };

/**
 * Create / edit a dress in a modal.
 *
 * UPLOAD FLOW (important): image files never pass through the server action.
 * When the admin picks a file, THIS client component uploads it straight to the
 * public `dress-photos` Storage bucket (allowed by the "admin upload
 * dress-photos" RLS policy because they're logged in), gets back a public URL,
 * and keeps only that URL in state. On Save we send the URLs (not the bytes) to
 * the `saveDress` server action, which writes the DB rows. New dresses get a
 * client-side uuid up front so photos can be filed under that id before the
 * dress row exists.
 */
export function DressEditorModal({
  dress,
  onClose,
}: {
  dress: AdminDress | null;
  onClose: () => void;
}) {
  const isNew = dress === null;
  const router = useRouter();
  const supabase = createClient();

  // A stable id for this edit session. New dresses need one before upload so
  // files can be stored under `${id}/…`.
  const [id] = useState(() => dress?.id ?? crypto.randomUUID());

  const [name, setName] = useState(dress?.name ?? "");
  const [styleName, setStyleName] = useState(dress?.styleName ?? "");
  // Price has no field in the editor design yet — carry the existing value
  // through on save (new dresses use the DB default of ₱500).
  const price = dress?.price ?? 500;
  const [cost, setCost] = useState<number>(dress?.cost ?? 0);
  const [photos, setPhotos] = useState<PhotoDraft[]>(dress?.photos ?? []);
  const [sizes, setSizes] = useState<SizeDraft[]>(dress?.sizes ?? []);
  const [reviews, setReviews] = useState<ReviewDraft[]>(dress?.reviews ?? []);

  // Review draft fields (the "add a review" form).
  const [revName, setRevName] = useState("");
  const [revText, setRevText] = useState("");
  const [revPhoto, setRevPhoto] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* --------------------------- uploads --------------------------- */

  // Upload one file to dress-photos and return its public URL.
  async function uploadToBucket(file: File, prefix: string): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${id}/${prefix}${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("dress-photos")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (upErr) throw new Error(upErr.message);
    return supabase.storage.from("dress-photos").getPublicUrl(path).data
      .publicUrl;
  }

  async function addProductPhoto(file: File) {
    setError(null);
    setUploading(true);
    try {
      const url = await uploadToBucket(file, "");
      setPhotos((prev) => [...prev, { url, label: "Front" }]);
    } catch (e) {
      console.error("Dress photo upload failed", e);
      setError("Couldn't upload the photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function pickReviewPhoto(file: File) {
    setError(null);
    setUploading(true);
    try {
      setRevPhoto(await uploadToBucket(file, "reviews/"));
    } catch (e) {
      console.error("Dress photo upload failed", e);
      setError("Couldn't upload the photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  /* --------------------------- sizes ----------------------------- */

  function toggleSize(size: string) {
    setSizes((prev) =>
      prev.some((s) => s.size === size)
        ? prev.filter((s) => s.size !== size)
        : [...prev, { size, bust: null, waist: null, length: null }],
    );
  }

  function setMeasurement(
    size: string,
    key: "bust" | "waist" | "length",
    value: string,
  ) {
    const n = value === "" ? null : Number(value);
    setSizes((prev) =>
      prev.map((s) => (s.size === size ? { ...s, [key]: n } : s)),
    );
  }

  // Keep the measurement panels in the canonical size order.
  const selectedSizes = SIZE_OPTIONS.filter((opt) =>
    sizes.some((s) => s.size === opt),
  );

  /* --------------------------- reviews --------------------------- */

  function addReview() {
    if (!revName.trim() || !revText.trim()) return;
    setReviews((prev) => [
      ...prev,
      { name: revName.trim(), body: revText.trim(), photoUrl: revPhoto },
    ]);
    setRevName("");
    setRevText("");
    setRevPhoto(null);
  }

  /* --------------------------- save/delete ----------------------- */

  const canSave = name.trim().length > 0 && photos.length > 0 && !uploading;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveDress({
        id,
        name,
        styleName,
        price,
        cost,
        status: dress?.status ?? "live",
        photos,
        sizes,
        reviews,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteDress(id);
      if (res.error) {
        setError(res.error);
        setConfirmDel(false);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  /* ----------------------------- UI ------------------------------ */

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay-scrim" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(920px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border-soft bg-background-card shadow-float"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-4">
            <div>
              <Dialog.Title className="font-display text-display-md uppercase tracking-display text-text-accent">
                {isNew ? "New dress" : name || "Edit dress"}
              </Dialog.Title>
              <p className="text-body-sm text-text-secondary">
                {isNew ? "Add to the collection" : "Edit dress"}
              </p>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="min-h-tap min-w-tap rounded-sm text-2xl leading-none text-text-secondary hover:text-text-heading focus-visible:shadow-focus"
            >
              ✕
            </Dialog.Close>
          </div>

          {/* Body — two columns on desktop, stacked on mobile */}
          <div className="grid flex-1 gap-8 overflow-y-auto px-6 py-6 md:grid-cols-2">
            {/* LEFT: photos + reviews */}
            <div className="flex flex-col gap-6">
              {/* Product photos */}
              <div>
                <FieldLabel
                  required
                  hint="first photo is the cover shown on the landing page"
                >
                  Product photos
                </FieldLabel>
                <div className="grid grid-cols-3 gap-2.5">
                  {photos.map((p, i) => (
                    <div key={p.url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={p.label || `Photo ${i + 1}`}
                        className={`h-28 w-full rounded-sm object-cover object-top ${
                          i === 0
                            ? "border-2 border-brand-primary"
                            : "border border-border-soft"
                        }`}
                      />
                      {i === 0 ? (
                        <span className="absolute left-1.5 top-1.5 rounded-tag bg-brand-primary px-2 py-0.5 text-label-sm uppercase tracking-label text-text-on-primary">
                          Cover
                        </span>
                      ) : null}
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() =>
                          setPhotos((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-pill bg-background-inverse/75 text-xs text-text-on-primary"
                      >
                        ✕
                      </button>
                      <select
                        value={p.label}
                        onChange={(e) =>
                          setPhotos((prev) =>
                            prev.map((q, j) =>
                              j === i ? { ...q, label: e.target.value } : q,
                            ),
                          )
                        }
                        className="mt-1.5 min-h-9 w-full rounded-sm border border-border-soft bg-white px-2 text-body-sm text-text-primary outline-none focus:border-border-accent"
                      >
                        {PHOTO_LABELS.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {/* Add-photo tile */}
                  <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border-strong bg-white px-2 text-center text-body-sm text-text-secondary hover:border-brand-primary">
                    <span className="text-xl leading-none text-brand-primary">
                      +
                    </span>
                    {uploading ? "Uploading…" : "Add photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) addProductPhoto(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Renter reviews */}
              <div>
                <FieldLabel hint="shown inside the dress details">
                  Renter reviews
                </FieldLabel>
                <div className="flex flex-col gap-2">
                  {reviews.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 rounded-md bg-background-panel p-2.5"
                    >
                      {r.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.photoUrl}
                          alt={`Photo from ${r.name}`}
                          className="h-10 w-10 shrink-0 rounded-sm border border-border-accent object-cover object-top"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-background-card text-text-secondary">
                          ♦
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-label-sm uppercase tracking-label text-text-accent">
                          {r.name}
                        </div>
                        <p className="mt-0.5 text-body-sm text-text-primary">
                          {r.body}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove review"
                        onClick={() =>
                          setReviews((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border border-border-soft bg-background-card text-xs text-text-secondary hover:text-text-heading"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {/* Add-review form */}
                  <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-strong p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className={inputClass}
                        placeholder="Renter's name"
                        value={revName}
                        onChange={(e) => setRevName(e.target.value)}
                      />
                      <label className="flex min-h-tap cursor-pointer items-center gap-2 rounded-sm border border-dashed border-border-strong bg-white px-3 text-body-sm text-text-secondary hover:border-brand-primary">
                        {revPhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={revPhoto}
                            alt="Review photo"
                            className="h-6 w-6 rounded-tag object-cover"
                          />
                        ) : (
                          <span className="text-brand-primary">▣</span>
                        )}
                        {revPhoto ? "Replace photo" : "Photo (worn)"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) pickReviewPhoto(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <textarea
                      rows={2}
                      className={inputClass}
                      placeholder="What did they say about the dress?"
                      value={revText}
                      onChange={(e) => setRevText(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={addReview}
                      disabled={!revName.trim() || !revText.trim()}
                      className="self-start rounded-pill border border-border-strong inline-flex min-h-tap items-center justify-center px-4 text-label-sm uppercase tracking-label text-text-primary transition-colors hover:bg-background-panel disabled:opacity-50"
                    >
                      Add review
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: details, sizes, measurements */}
            <div className="flex flex-col gap-4">
              <div>
                <FieldLabel required>Dress name</FieldLabel>
                <input
                  className={inputClass}
                  placeholder="e.g. Serafina"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Style</FieldLabel>
                <input
                  className={inputClass}
                  placeholder="e.g. Satin Mermaid Dress"
                  value={styleName}
                  onChange={(e) => setStyleName(e.target.value)}
                />
              </div>
              {/* Price has no visible field in the editor design yet. Keep it
                  as a hidden field (default ₱500, or the dress's existing
                  value) so it's wired for when a real control is designed. */}
              <input type="hidden" name="price" value={price} readOnly />

              <div>
                <FieldLabel hint="what you paid — feeds Analytics">
                  Acquisition cost (₱)
                </FieldLabel>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={cost}
                  onChange={(e) => setCost(Number(e.target.value))}
                />
              </div>

              {/* Sizes — tap to toggle */}
              <div>
                <FieldLabel required hint="tap to toggle">
                  Available sizes
                </FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {SIZE_OPTIONS.map((s) => {
                    const sel = sizes.some((x) => x.size === s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSize(s)}
                        aria-pressed={sel}
                        className={`min-h-10 min-w-11 rounded-pill border px-3 text-label-sm uppercase tracking-wide transition-colors ${
                          sel
                            ? "border-brand-primary bg-brand-primary text-text-on-primary"
                            : "border-border-soft bg-white text-text-primary hover:bg-background-panel"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Per-size measurements */}
              <div>
                <FieldLabel hint="centimeters, per size">
                  Measurements
                </FieldLabel>
                {selectedSizes.length === 0 ? (
                  <p className="text-body-sm text-text-secondary">
                    Select at least one size to enter its measurements.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {selectedSizes.map((size) => {
                      const s = sizes.find((x) => x.size === size)!;
                      return (
                        <div
                          key={size}
                          className="rounded-md bg-background-panel p-2.5"
                        >
                          <div className="mb-1.5 text-label-sm uppercase tracking-label text-text-accent">
                            Size {size}
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {(["bust", "waist", "length"] as const).map((k) => (
                              <div key={k}>
                                <div className="mb-1 text-label-sm uppercase tracking-wide text-text-secondary">
                                  {k}
                                </div>
                                <input
                                  type="number"
                                  min={0}
                                  placeholder="cm"
                                  className={inputClass}
                                  value={s[k] ?? ""}
                                  onChange={(e) =>
                                    setMeasurement(size, k, e.target.value)
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {error ? (
                <p className="text-body-sm text-state-error">{error}</p>
              ) : null}

              {/* Save */}
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || isPending}
                className="min-h-tap rounded-pill bg-brand-primary px-5 text-label-base uppercase tracking-label text-text-on-primary transition-colors hover:bg-brand-primary-hover disabled:opacity-50 focus-visible:shadow-focus"
              >
                {isPending
                  ? "Saving…"
                  : isNew
                    ? "Add to collection"
                    : "Save changes"}
              </button>

              {/* Delete (edit only) — required confirm step */}
              {!isNew ? (
                confirmDel ? (
                  <div className="flex flex-col gap-2.5 rounded-md border border-state-error bg-background-panel p-3.5">
                    <p className="text-body-sm text-text-primary">
                      Remove <b>{name || "this dress"}</b>? This can&apos;t be
                      undone.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isPending}
                        className="rounded-pill bg-state-error inline-flex min-h-tap items-center justify-center px-4 text-label-sm uppercase tracking-label text-text-on-primary transition-colors disabled:opacity-60"
                      >
                        {isPending ? "Removing…" : "Yes, remove"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDel(false)}
                        disabled={isPending}
                        className="rounded-pill border border-border-strong inline-flex min-h-tap items-center justify-center px-4 text-label-sm uppercase tracking-label text-text-secondary transition-colors hover:bg-background-panel disabled:opacity-60"
                      >
                        Keep dress
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDel(true)}
                    className="self-start text-label-sm uppercase tracking-label text-state-error hover:underline"
                  >
                    Remove this dress
                  </button>
                )
              ) : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
