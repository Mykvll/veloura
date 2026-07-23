import "server-only";

/**
 * OWNER TELEGRAM PINGS
 * --------------------
 * A tiny fire-and-forget notifier so the shop owner hears about a new online
 * booking on Telegram the moment it lands. It is deliberately best-effort:
 *
 *  - If the two env vars aren't set (e.g. local dev), it is a silent no-op — a
 *    missing bot must never make bookings fail or log noise.
 *  - Any error (network, bad token, Telegram down) is caught and logged, never
 *    thrown. Sending a booking notification is NEVER allowed to break or slow
 *    the actual booking, so callers `void notifyOwner(...)` without awaiting.
 *  - A 5-second timeout guards against Telegram hanging the request.
 *
 * SETUP (one time):
 *  1. Message @BotFather → /newbot → copy the bot token.
 *  2. Send your new bot any message (tap Start).
 *  3. Open https://api.telegram.org/bot<TOKEN>/getUpdates and read the
 *     chat.id — that's TELEGRAM_CHAT_ID.
 *  Put both in .env.local and in the Vercel project env (Production + Preview).
 *
 * We send PLAIN text (no parse_mode) on purpose: the message interpolates
 * customer-supplied names/contacts, and plain text needs no escaping and can't
 * be broken by a stray "*" or "_" the way Markdown/HTML would.
 */
export async function notifyOwner(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // not configured — silently skip

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(
        "notifyOwner: Telegram sendMessage failed",
        res.status,
        await res.text().catch(() => ""),
      );
    }
  } catch (err) {
    // Best-effort: log and move on so the booking result is unaffected.
    console.error("notifyOwner: Telegram request errored", err);
  }
}
