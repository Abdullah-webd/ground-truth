/**
 * Lite mode for slow or metered connections (common on 3G/4G across Africa): a smooth Earth without 3D terrain or
 * buildings, fewer and lighter map tiles, and a lower render resolution. On by itself when the browser reports
 * Save-Data or a 2G/3G connection; the user's own choice (saved on this device) always wins.
 */
const KEY = "gt-lite";

type NetInfo = { saveData?: boolean; effectiveType?: string };

export function slowConnection(): boolean {
  const c = (navigator as Navigator & { connection?: NetInfo }).connection;
  return !!c && (c.saveData === true || ["slow-2g", "2g", "3g"].includes(c.effectiveType ?? ""));
}

export function liteChoice(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

export function isLite(): boolean {
  return liteChoice() ?? slowConnection();
}

/** Save the choice and restart the globe with it (the 3D engine is set up once, at start). */
export function setLite(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* storage blocked: the choice lasts for this load only */
  }
  window.location.reload();
}
