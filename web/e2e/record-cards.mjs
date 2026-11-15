// Records the trailer title cards (static HTML with CSS animation) to video.
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
const dir = path.resolve("../video/cards");
const cards = JSON.parse(process.argv[2] || "{\"rain\":4200,\"title\":1800,\"end\":4500}");
const b = await chromium.launch();
for (const [n, ms] of Object.entries(cards)) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir, size: { width: 1920, height: 1080 } } });
  const p = await ctx.newPage();
  await p.goto("file://" + path.join(dir, n + ".html"));
  await p.waitForTimeout(ms);
  const v = p.video();
  await ctx.close();
  fs.renameSync(await v.path(), path.join(dir, n + ".webm"));
  console.log(n);
}
await b.close();
