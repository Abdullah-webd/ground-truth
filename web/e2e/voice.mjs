// Opens a live voice session with a simulated microphone and checks the WebRTC link to OpenAI comes up.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:5179";
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, permissions: ["microphone"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(base, { waitUntil: "load" });
await page.waitForTimeout(3000);
await page.getByRole("button", { name: "Talk" }).click();
const t0 = Date.now();
await page.waitForSelector('button[aria-pressed="true"]:has-text("Listening")', { timeout: 20000 });
console.log(`voice session live in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await page.waitForTimeout(1500);
await page.screenshot({ path: "../.verify/walkthrough/voice-listening.png" });
const alerts = await page.locator('[role="alert"]').allInnerTexts();
console.log("alerts:", alerts.length ? alerts : "none", "| page errors:", errors.length ? errors : "none");
await page.getByRole("button", { name: /Listening|Working|Speaking/ }).click();
await page.waitForSelector('button:has-text("Talk")', { timeout: 5000 });
console.log("hung up cleanly");
await browser.close();
