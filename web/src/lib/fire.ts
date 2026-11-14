export function fireSize(frp: number): { title: string; label: string; scale: number } {
  if (frp >= 100) return { title: "Large fire", label: "Large, very intense fire", scale: 1 };
  if (frp >= 20) return { title: "Medium fire", label: "Medium fire", scale: 0.72 };
  return { title: "Small fire", label: "Small fire, like burning fields or grass", scale: 0.5 };
}

export function hoursAgo(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3.6e6;
  if (!Number.isFinite(h)) return "";
  if (h < 1) return "less than an hour ago";
  return `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"} ago`;
}

