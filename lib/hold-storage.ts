// Per-browser persistence of the in-progress rent hold, so an accidental page
// refresh — OR closing the tab and reopening the site — can resume the payment
// step with an uninterrupted countdown.
// See docs/security-enhancement/payment-window-refresh.md.
//
// localStorage (not localStorage): localStorage is wiped the instant the tab
// closes, which is exactly what happens when a customer leaves for the GCash app
// on mobile and the browser drops the backgrounded tab — they'd lose a live hold
// and their date even though they were mid-payment. localStorage survives that,
// and a stale entry is harmless: the resume path in collection-gallery.tsx always
// re-validates against the server via get_hold_status and clears anything that
// isn't still a live `hold` (and clearHold() runs on submit/cancel/expire). The
// countdown itself is always derived from the server's hold_expires_at, never
// from anything stored here.

const KEY = "veloura.activeHold";

export type StoredHold = {
  bookingId: string;
  dressId: string;
  /** Rental date, ISO "YYYY-MM-DD" — to redraw the payment summary. */
  date: string;
  /** Amount due, to redraw the summary. */
  total: number;
  /** Chosen payment channel id, restored on resume. */
  methodId?: string;
  /** Uploaded proof path, restored on resume (the file is already in storage). */
  proofPath?: string;
};

export function saveHold(hold: StoredHold): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(hold));
  } catch {
    // Private-mode / storage-disabled: resume just won't be available. Non-fatal.
  }
}

export function loadHold(): StoredHold | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredHold) : null;
  } catch {
    return null;
  }
}

export function patchHold(patch: Partial<StoredHold>): void {
  const current = loadHold();
  if (current) saveHold({ ...current, ...patch });
}

export function clearHold(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
