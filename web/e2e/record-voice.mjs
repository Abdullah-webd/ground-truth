// Records a real voice conversation with Aisha on the live site for the trailer/demo.
// The microphone is a WAV file (Chromium fake capture); Aisha's spoken reply is captured from the WebRTC track.
// Usage: node e2e/record-voice.mjs <mic.wav> <outName> [baseUrl] [--mobile]
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const [mic, name, baseArg] = process.argv.slice(2);
const base = baseArg && !baseArg.startsWith("--") ? baseArg : "https://ground-truth-production-694ae5bd.up.railway.app";
const outDir = path.resolve("../video/rec");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${path.resolve(mic)}%noloop`,
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1920,1080",
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
  permissions: ["microphone"],
});
const t0 = Date.now();
await ctx.addInitScript(() => {
  // Mix the mic and Aisha's voice into one recording, timestamped against page load.
  const w = window;
  w.__chunks = [];
  w.__recStart = null;
  let ac, dest, rec;
  const ensure = () => {
    if (ac) return;
    ac = new AudioContext({ sampleRate: 48000 });
    dest = ac.createMediaStreamDestination();
    rec = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=opus" });
    rec.ondataavailable = (e) => e.data.size && w.__chunks.push(e.data);
    rec.start(250);
    w.__recStart = Date.now();
  };
  const add = (stream, gain) => {
    ensure();
    const src = ac.createMediaStreamSource(stream);
    const g = ac.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
  };
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    const s = await gum(c);
    add(s, 1);
    return s;
  };
  const Orig = w.RTCPeerConnection;
  w.RTCPeerConnection = function (...a) {
    const pc = new Orig(...a);
    pc.addEventListener("track", (e) => add(e.streams[0], 1));
    return pc;
  };
  w.RTCPeerConnection.prototype = Orig.prototype;
  w.__stopRec = () =>
    new Promise((res) => {
      if (!rec) return res(null);
      rec.onstop = async () => {
        const b = new Blob(w.__chunks, { type: "audio/webm" });
        const buf = new Uint8Array(await b.arrayBuffer());
        let s = "";
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        res({ b64: btoa(s), start: w.__recStart });
      };
      rec.stop();
    });
});

const page = await ctx.newPage();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
await page.goto(base + "/explore", { waitUntil: "load" });
log("loaded");
await page.waitForTimeout(9000); // globe settles
const talk = page.getByRole("button", { name: /Talk to Aisha/ }).first();
await talk.click();
log("talk pressed");
// Wait for the answer to finish: the "numbers checked" line appears when the spoken answer is done.
await page.getByText(/numbers? checked against the data/).first().waitFor({ timeout: 120000 });
log("answer text done");
// The text finishes before the audio does: wait until she stops speaking (button returns to "Listening").
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Listening, tap to end/ }).first().waitFor({ timeout: 90000 });
log("speech finished");
await page.waitForTimeout(3000);
await page.getByRole("button", { name: /tap to end/ }).first().click().catch(() => {});
await page.waitForTimeout(1500);
const audio = await page.evaluate(() => window.__stopRec());
if (audio) {
  fs.writeFileSync(path.join(outDir, `${name}-audio.webm`), Buffer.from(audio.b64, "base64"));
  fs.writeFileSync(path.join(outDir, `${name}-meta.json`), JSON.stringify({ audioStartMs: audio.start - t0 }));
  log(`audio saved, starts ${(audio.start - t0) / 1000}s after context`);
}
const video = page.video();
await ctx.close();
await browser.close();
fs.renameSync(await video.path(), path.join(outDir, `${name}-screen.webm`));
log("done");
