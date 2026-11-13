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

await page.goto(base, { waitUntil: "load" });
await page.waitForTimeout(600); await shot("01-intro-600ms");
await page.waitForTimeout(3500); await shot("02-loaded");

await page.fill("#place-search", "Lagos, Nigeria");
await page.press("#place-search", "Enter");
await page.waitForTimeout(700); await shot("03-atlas-label");
await page.waitForTimeout(3500); await shot("04-lagos-case-file");

await page.getByRole("button", { name: "Detect change" }).click();
await page.waitForSelector("text=hotspots", { timeout: 60000 });
await page.waitForTimeout(4000); await shot("05-change-hotspots");

await page.getByRole("button", { name: "Vegetation greenness", exact: true }).click();
await page.getByRole("tab", { name: "Year by year" }).click();
await page.waitForTimeout(2500); await shot("06-vegetation-year");

await page.getByRole("button", { name: "Find divergence" }).click();
await page.waitForTimeout(5000); await shot("07-divergence");

await page.getByRole("button", { name: "How we test" }).click();
await page.waitForTimeout(1500); await shot("08-checks");

console.log("console errors:", errors.length ? errors.slice(0, 10) : "none");
await browser.close();
