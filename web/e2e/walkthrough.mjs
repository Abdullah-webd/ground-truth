// Drives the real app (backend + web must be running) and saves screenshots.
// Usage: node e2e/walkthrough.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:5179";
const out = process.argv[3] ?? "../.verify/walkthrough";
import fs from "node:fs";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log("shot", name); };

await page.goto(base + "/explore", { waitUntil: "load" });
await page.waitForTimeout(600); await shot("01-intro-600ms");
await page.waitForTimeout(3500); await shot("02-loaded");

await page.fill("#place-search", "Lagos, Nigeria");
await page.press("#place-search", "Enter");
await page.waitForTimeout(700); await shot("03-atlas-label");
await page.waitForTimeout(3500); await shot("04-lagos-case-file");

await page.getByRole("button", { name: "Scan for changes" }).click();
await page.waitForSelector("text=changed patches", { timeout: 60000 });
await page.waitForTimeout(4000); await shot("05-change-hotspots");

await page.getByRole("button", { name: "Plant growth", exact: true }).click();
await page.getByRole("tab", { name: "Play the years" }).click();
await page.waitForTimeout(2500); await shot("06-vegetation-year");

await page.getByRole("button", { name: "Find opposite trends" }).click();
await page.waitForTimeout(5000); await shot("07-divergence");

await page.getByRole("button", { name: "How we know" }).click();
await page.waitForURL(/\/methods$/, { timeout: 10000 });
await page.waitForTimeout(2500); await shot("08-methods");
await page.goBack();
await page.waitForURL(/\/explore$/, { timeout: 10000 });
await page.waitForTimeout(6000);

// Fires: the layer explains itself and a flame opens a details card.
await page.getByRole("button", { name: /Fires now/ }).click();
await page.waitForSelector("text=fires seen burning", { timeout: 60000 });
await page.waitForTimeout(2500); await shot("09-fires");
await page.getByRole("button", { name: "Fly to the biggest fire" }).click();
await page.waitForSelector("text=Fire seen from space", { timeout: 15000 });
await page.waitForTimeout(5000); await shot("10-fire-detail");

// The story page and the route into the globe.
await page.goto(base + "/", { waitUntil: "load" });
await page.waitForTimeout(2500); await shot("11-landing-hero");
await page.getByRole("link", { name: "Open the globe" }).first().click();
await page.waitForURL(/\/explore$/, { timeout: 10000 });
await page.waitForTimeout(3000); await shot("12-landing-to-globe");

console.log("console errors:", errors.length ? errors.slice(0, 10) : "none");
await browser.close();
