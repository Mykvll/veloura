// Per-tab persistence of the in-progress rent hold, so an accidental page
// refresh can resume the payment step with an uninterrupted countdown.
// See docs/security-enhancement/payment-window-refresh.md.
//
// sessionStorage (not localStorage): survives a refresh, clears when the tab
// closes — the right scope for a 10-minute hold. The countdown itself is always
// derived from the server's hold_expires_at, never from anything stored here.

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
    sessionStorage.setItem(KEY, JSON.stringify(hold));
  } catch {
    // Private-mode / storage-disabled: resume just won't be available. Non-fatal.
  }
}

export function loadHold(): StoredHold | null {
  try {
    const raw = sessionStorage.getItem(KEY);
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
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
