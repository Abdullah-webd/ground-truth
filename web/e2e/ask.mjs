// Asks the analyst a question through the real UI and screenshots the result.
// Usage: node e2e/ask.mjs "question" [outName] [baseUrl]
import { chromium } from "playwright";
import fs from "node:fs";
const q = process.argv[2] ?? "What changed around Lagos since 2018, and is it significant?";
const name = process.argv[3] ?? "ask";
const base = process.argv[4] ?? "http://localhost:5179";
const out = "../.verify/walkthrough";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !m.text().includes("status of 500") && errors.push(m.text()));
await page.goto(base, { waitUntil: "load" });
await page.waitForTimeout(3500);
const t0 = Date.now();
await page.fill("#ask", q);
await page.press("#ask", "Enter");
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/${name}-midway.png` });
await page.waitForFunction(() => !document.body.innerText.includes("Investigating…"), null, { timeout: 150000 });
console.log(`answered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/${name}-done.png` });
const answer = await page.locator('section[aria-label="Ask the analyst"] article').last().innerText();
console.log(answer);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
