// Place names at every height: whole Earth, country, city, neighbourhood, streets, 3D city.
// Usage: node e2e/labels.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import fs from "node:fs";
const base = process.argv[2] ?? "http://localhost:4179";
const out = process.argv[3] ?? "../.verify/labels";
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1512, height: 900 } });
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await p.goto(base + "/explore"); await p.waitForTimeout(7000);
const views = [
  ["01-earth", 8, 14, 2.0e7],
  ["02-west-africa", 8, 6, 2.2e6],
  ["03-lagos-city", 6.55, 3.38, 1.2e5],
  ["04-ikeja-neighbourhoods", 6.6, 3.34, 2.2e4],
  ["05-ikeja-streets", 6.596, 3.345, 2.5e3],
  ["06-sf-soma-3d", 37.7765, -122.4063, 900],
];
for (const [name, lat, lon, h] of views) {
  await p.evaluate(([lat, lon, h]) => window.__groundTruthGlobe.flyToPoint(lat, lon, h, 0), [lat, lon, h]);
  await p.waitForTimeout(h < 5000 ? 22000 : 12000);
  await p.screenshot({ path: `${out}/${name}.png`, clip: { x: 380, y: 60, width: 760, height: 690 } });
  const n = await p.evaluate(() => window.__groundTruthGlobe.places["placed"].size);
  console.log(name, "labels loaded:", n);
}
// Tilted 3D city: names must float above the buildings.
await p.evaluate(() => {
  const cam = window.__groundTruthGlobe.viewer.camera;
  const C3 = cam.position.constructor;
  cam.setView({ destination: C3.fromDegrees(-122.4045, 37.7700, 700), orientation: { heading: -0.6, pitch: -0.55, roll: 0 } });
});
await p.waitForTimeout(25000);
await p.screenshot({ path: `${out}/07-sf-tilted-3d.png`, clip: { x: 380, y: 60, width: 760, height: 690 } });
console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await b.close();
