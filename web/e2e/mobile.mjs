// Phone, tablet and desktop layouts of the globe screen: real taps through the main flows.
// Usage: node e2e/mobile.mjs [baseUrl] [outDir] [--ask]   (--ask also runs one analyst question per layout)
import { chromium, devices } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:4179";
const out = process.argv[3] ?? "../.verify/mobile";
const withAsk = process.argv.includes("--ask");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
};

async function open(device) {
  const ctx = await browser.newContext({ ...device });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(base + "/explore", { waitUntil: "load" });
  await page.waitForTimeout(7000);
  return { ctx, page, errors };
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------------------------------------------------------------- phone
for (const [name, device] of [["iphone", devices["iPhone 14"]], ["pixel", devices["Pixel 7"]]]) {
  console.log(`\n${name}`);
  const { ctx, page, errors } = await open(device);
  const shot = (n) => page.screenshot({ path: `${out}/${name}-${n}.png` });
  await shot("01-open");
  check(await noOverflow(page), "no sideways scrolling");
  check(await page.getByRole("textbox", { name: /ask the analyst/i }).isVisible(), "the analyst text box is visible straight away");
  check(await page.getByRole("button", { name: /talk/i }).first().isVisible(), "Talk (voice) is visible straight away");
  check(await page.locator("canvas").first().isVisible(), "the map is visible");
  check(await page.evaluate(() => window.__groundTruthGlobe?.isFlat === true), "phones start on the flat map");

  await page.getByRole("button", { name: "Rainfall", exact: true }).tap();
  await page.waitForTimeout(1500);
  await shot("02-rainfall-chip");

  await page.getByRole("button", { name: /layers and map options/i }).tap();
  await page.waitForTimeout(700);
  await shot("03-layers");
  await page.getByRole("radio", { name: "Globe" }).tap();
  await page.getByRole("button", { name: "Done" }).tap();
  await page.waitForTimeout(2500);
  check(await page.evaluate(() => window.__groundTruthGlobe?.isFlat === false), "Layers → Globe switches to the 3D globe");
  await shot("04-globe-mode");
  await page.getByRole("button", { name: /layers and map options/i }).tap();
  await page.getByRole("radio", { name: "Map" }).tap();
  await page.getByRole("button", { name: "Done" }).tap();
  await page.waitForTimeout(2000);

  // Go to a place: open the sheet, search, get the plain-English case file.
  await page.getByRole("button", { name: /resize the panel/i }).tap();
  await page.waitForTimeout(600);
  await page.fill("#place-search", "Lagos, Nigeria");
  await page.getByRole("button", { name: "Go", exact: true }).tap();
  // Go briefs the analyst: its answer stays on screen, with a button for the place's details.
  const details = page.getByRole("button", { name: /see details for lagos/i });
  await details.waitFor({ timeout: 30000 });
  await page.waitForTimeout(4000);
  await shot("05-briefing");
  check(await page.locator('section[aria-label="Ask the analyst"] article').first().isVisible(), "the analyst's briefing is on screen after Go");
  await details.tap();
  await page.waitForSelector('section[aria-label="The short answer"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  check(await page.getByRole("button", { name: /back to the analyst/i }).isVisible(), "See details opens the case file, with a way back to the analyst");
  await page.getByRole("button", { name: /resize the panel/i }).tap();
  await page.waitForTimeout(800);
  await shot("06-place-full");
  await page.getByRole("button", { name: /back to the analyst/i }).tap();
  await page.waitForTimeout(800);

  // Fires from Layers.
  await page.getByRole("button", { name: /layers and map options/i }).tap();
  await page.getByRole("button", { name: /fires now/i }).tap();
  await page.getByRole("button", { name: "Done" }).tap();
  await page.waitForSelector("text=fires seen burning", { timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot("07-fires");
  check(await noOverflow(page), "still no sideways scrolling with fires on");

  if (withAsk) {
    await page.getByRole("textbox", { name: /ask the analyst/i }).fill("Is Greenland losing ice?");
    await page.getByRole("button", { name: "Ask", exact: true }).tap();
    await page.waitForTimeout(2500);
    await shot("08-ask-flying");
    await page.waitForFunction(() => !document.body.innerText.includes("Investigating…"), null, { timeout: 120000 });
    await page.waitForTimeout(3500);
    await shot("09-ask-answer");
    const answer = page.locator('section[aria-label="Ask the analyst"] article').last();
    check(await answer.isVisible(), "the analyst's answer stays visible (not replaced by a case file)");
  }
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 2).join(" | ")}` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------- tablet
for (const [name, viewport] of [["ipad-portrait", { width: 820, height: 1180 }], ["ipad-landscape", { width: 1180, height: 820 }]]) {
  console.log(`\n${name}`);
  const { ctx, page, errors } = await open({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.screenshot({ path: `${out}/${name}-01-open.png` });
  check(await noOverflow(page), "no sideways scrolling");
  if (name === "ipad-landscape") {
    check(await page.getByRole("tab", { name: "Ask the analyst" }).isVisible(), "Ask | Details tabs are visible");
    await page.fill("#place-search", "Abuja, Nigeria");
    await page.getByRole("button", { name: "Go", exact: true }).tap();
    await page.waitForTimeout(3500);
    check(await page.getByRole("tab", { name: "Ask the analyst" }).getAttribute("aria-selected") === "true", "Go shows the analyst's briefing first");
    await page.getByRole("tab", { name: "Details" }).tap();
    await page.waitForSelector('section[aria-label="The short answer"]', { timeout: 30000 });
    await page.waitForTimeout(1500);
    check(await page.getByRole("tab", { name: "Details" }).getAttribute("aria-selected") === "true", "the Details tab shows the place");
    await page.screenshot({ path: `${out}/${name}-02-details.png` });
    // Tapping the globe yourself opens details straight away.
    await page.getByRole("tab", { name: "Ask the analyst" }).tap();
    await page.mouse.click(300, 380);
    await page.waitForTimeout(2500);
    check(await page.getByRole("tab", { name: "Details" }).getAttribute("aria-selected") === "true", "tapping the globe opens Details");
  } else {
    check(await page.getByRole("textbox", { name: /ask the analyst/i }).isVisible(), "portrait tablets use the phone layout");
  }
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 2).join(" | ")}` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------- desktop
console.log("\ndesktop");
{
  const { ctx, page, errors } = await open({ viewport: { width: 1600, height: 900 } });
  await page.screenshot({ path: `${out}/desktop-01-open.png` });
  check(await page.evaluate(() => getComputedStyle(document.querySelector(".theme-space")).backgroundColor) === "rgb(5, 7, 11)", "globe screen sits on dark space");
  check(await page.evaluate(() => window.__groundTruthGlobe?.isFlat === false), "desktop keeps the 3D globe");
  await page.mouse.click(820, 380);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/desktop-02-case.png` });
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 2).join(" | ")}` : ""}`);
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall layout checks passed");
process.exit(failures.length ? 1 : 0);
