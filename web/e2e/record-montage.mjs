// Records short montage clips of the live site for the trailer/demo: fires, the years time-lapse, phone layout.
// Usage: node e2e/record-montage.mjs [clip ...]   (clips: fires years phone)
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const base = "https://ground-truth-production-694ae5bd.up.railway.app";
const outDir = path.resolve("../video/rec");
const want = process.argv.slice(2);
const browser = await chromium.launch({ headless: false, args: ["--window-size=1920,1080"] });

async function clip(name, opts, run) {
  if (want.length && !want.includes(name)) return;
  const t0 = Date.now();
  const ctx = await browser.newContext({ ...opts, recordVideo: { dir: outDir, size: opts.recordSize ?? opts.viewport } });
  const page = await ctx.newPage();
  const marks = {};
  const mark = (k) => (marks[k] = (Date.now() - t0) / 1000);
  await run(page, mark);
  const v = page.video();
  await ctx.close();
  fs.renameSync(await v.path(), path.join(outDir, `${name}.webm`));
  fs.writeFileSync(path.join(outDir, `${name}-marks.json`), JSON.stringify(marks));
  console.log(name, marks);
}

const desk = { viewport: { width: 1920, height: 1080 } };

await clip("fires", desk, async (p, mark) => {
  await p.goto(base + "/explore", { waitUntil: "load" });
  await p.waitForTimeout(9000);
  mark("click");
  await p.getByRole("button", { name: /Fires now/ }).first().click();
  await p.getByRole("button", { name: "Fly to the biggest fire" }).waitFor({ timeout: 60000 });
  mark("flames");
  await p.waitForTimeout(2500);
  mark("fly");
  await p.getByRole("button", { name: "Fly to the biggest fire" }).click();
  await p.waitForTimeout(7000);
});

await clip("years", desk, async (p, mark) => {
  await p.goto(base + "/explore", { waitUntil: "load" });
  await p.waitForTimeout(9000);
  mark("play");
  await p.getByRole("tab", { name: "Play the years" }).first().click();
  await p.waitForTimeout(1500);
  mark("lapse");
  await p.getByRole("button", { name: "Play the time-lapse" }).click();
  await p.waitForTimeout(38000);
});

await clip(
  "phone",
  { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordSize: { width: 780, height: 1688 } },
  async (p, mark) => {
    await p.goto(base + "/", { waitUntil: "load" });
    await p.waitForTimeout(3500);
    mark("explore");
    await p.goto(base + "/explore", { waitUntil: "load" });
    await p.waitForTimeout(9000);
    mark("ask");
    await p.getByRole("button", { name: /Ask Aisha|keyboard|Type/i }).first().click().catch(() => {});
    await p.waitForTimeout(800);
    const box = p.getByRole("textbox").first();
    await box.fill("Is Greenland losing ice?").catch(() => {});
    await box.press("Enter").catch(() => {});
    await p.waitForTimeout(25000);
  },
);

await browser.close();
