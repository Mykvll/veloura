// Smoke-drive the Veloura customer app in a headless browser.
//
// Launches Chromium (via the project's `playwright` dev dependency), loads the
// collection page, opens the first dress's detail modal, screenshots each
// state, and reports any console/page errors. Run the dev server FIRST (see
// SKILL.md), then:
//
//   node .claude/skills/run-veloura/smoke.mjs [baseUrl]
//
// baseUrl defaults to http://localhost:3000. Screenshots go to $SHOT_DIR, or a
// temp folder printed at the end.

import { chromium } from "playwright";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const baseUrl = process.argv[2] || "http://localhost:3000";
const shotDir = process.env.SHOT_DIR || path.join(os.tmpdir(), "veloura-shots");
fs.mkdirSync(shotDir, { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  // First paint can be slow — Next compiles the route on demand.
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("text=Our Collection", { timeout: 60000 });
  await page.screenshot({ path: path.join(shotDir, "01-collection.png") });

  // Open the first dress card → detail modal (the reserve flow).
  await page.locator("main button").first().click();
  await page.waitForSelector("[role=dialog]", { timeout: 15000 });
  await page.waitForTimeout(400); // let the dialog settle
  await page.screenshot({ path: path.join(shotDir, "02-detail-modal.png") });

  // The Reserve / Book-a-fitting buttons only render for a dress that has sizes
  // (gated behind dress_sizes). Report whether they showed so a data-less run is
  // obvious rather than a silent pass. (The accessories picker + ID upload now
  // live one step deeper, in the rent form — see doc-drive.mjs to exercise it.)
  const hasReserveButtons = await page
    .getByRole("button", { name: "Reserve this dress" })
    .isVisible()
    .catch(() => false);

  console.log(
    JSON.stringify({ baseUrl, shotDir, hasReserveButtons, errors }, null, 2),
  );
} catch (e) {
  console.error("SMOKE FAILED:", e.message);
  await page.screenshot({ path: path.join(shotDir, "error.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
