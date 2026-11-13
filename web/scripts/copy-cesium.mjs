// Copies Cesium's runtime assets (workers, textures, widgets) into public/cesium so Vite serves
// them at /cesium in dev and copies them into the build. Runs after `npm install`.
import fs from "node:fs";
import path from "node:path";
const src = path.resolve("node_modules/cesium/Build/Cesium");
const dest = path.resolve("public/cesium");
fs.rmSync(dest, { recursive: true, force: true });
for (const dir of ["Workers", "ThirdParty", "Assets", "Widgets"]) {
  fs.cpSync(path.join(src, dir), path.join(dest, dir), { recursive: true });
}
console.log("Cesium assets copied to public/cesium");
