import { globe } from "../globe/controller";

interface CardContent {
  title: string;
  subtitle: string;
  finding: string;
  stats: [string, string][];
  source: string;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Render the current globe view and a finding into a 1600x900 PNG and download it. */
export async function exportCaseCard(c: CardContent) {
  const g = globe.get();
  if (!g) throw new Error("The globe is not ready yet.");
  await document.fonts.ready;
  const shot = new Image();
  shot.src = g.snapshot();
  await shot.decode();

  const W = 1600;
  const H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  ctx.fillStyle = "#0a0f16";
  ctx.fillRect(0, 0, W, H);
  // Globe snapshot, cover-fit into the left 900px
  const gw = 900;
  const scale = Math.max(gw / shot.width, H / shot.height);
  const sw = gw / scale;
  const sh = H / scale;
  ctx.drawImage(shot, (shot.width - sw) / 2, (shot.height - sh) / 2, sw, sh, 0, 0, gw, H);

  const x = gw + 64;
  const maxW = W - x - 64;
  ctx.fillStyle = "#f2c14e";
  ctx.fillRect(x, 72, 48, 4);
  ctx.fillStyle = "#8796a8";
  ctx.font = '500 22px "Public Sans Variable", sans-serif';
  ctx.fillText("GROUND TRUTH CASE FILE", x, 120);

  ctx.fillStyle = "#e8edf2";
  ctx.font = '600 72px "Barlow Condensed", sans-serif';
  let y = 200;
  for (const l of wrap(ctx, c.title.toUpperCase(), maxW).slice(0, 2)) {
    ctx.fillText(l, x, y);
    y += 70;
  }
  ctx.fillStyle = "#8796a8";
  ctx.font = '400 24px "Public Sans Variable", sans-serif';
  ctx.fillText(c.subtitle, x, y);
  y += 56;

  ctx.fillStyle = "#e8edf2";
  ctx.font = '500 28px "Public Sans Variable", sans-serif';
  for (const l of wrap(ctx, c.finding, maxW).slice(0, 5)) {
    ctx.fillText(l, x, y);
    y += 40;
  }
  y += 24;
  for (const [k, v] of c.stats) {
    ctx.fillStyle = "#8796a8";
    ctx.font = '400 22px "Public Sans Variable", sans-serif';
    ctx.fillText(k, x, y);
    ctx.fillStyle = "#e8edf2";
    ctx.font = '600 22px "Public Sans Variable", sans-serif';
    ctx.fillText(v, x + 220, y);
    y += 36;
  }
  ctx.fillStyle = "#5a6a7c";
  ctx.font = '400 17px "Public Sans Variable", sans-serif';
  let sy = H - 90;
  for (const l of wrap(ctx, c.source, maxW).slice(0, 3)) {
    ctx.fillText(l, x, sy);
    sy += 24;
  }

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `ground-truth-${c.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  a.click();
}
