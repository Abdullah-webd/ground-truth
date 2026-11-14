// Zooms into a city and checks the photorealistic 3D city (Google tiles via Cesium ion) appears.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4179";
const place = process.argv[3] ?? "San Jose, California";
const name = process.argv[4] ?? "city3d";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => (m.type() === "error" || m.text().includes("3D tiles")) && errors.push(m.text().slice(0, 200)));
await page.goto(base + "/explore", { waitUntil: "load" });
await page.waitForTimeout(5000);
await page.screenshot({ path: `../.verify/walkthrough/${name}-0-globe.png` });
await page.fill("#place-search", place);
await page.press("#place-search", "Enter");
await page.waitForTimeout(7000);
await page.screenshot({ path: `../.verify/walkthrough/${name}-1-city.png` });
await page.mouse.move(800, 450);
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -600); await page.waitForTimeout(250); }
await page.waitForTimeout(15000);
await page.screenshot({ path: `../.verify/walkthrough/${name}-2-street.png` });
console.log("errors:", errors.length ? errors.slice(0, 8) : "none");
await browser.close();
