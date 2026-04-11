const pad = (n) => String(n).padStart(2, "0");

export function parseBusinessDate(appDate) {
  if (!appDate || typeof appDate !== "string") return new Date();
  const [y, m, d] = appDate.slice(0, 10).split("-").map((v) => Number(v));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

export function toYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toBusinessYmd(appDate) {
  return toYmd(parseBusinessDate(appDate));
}

export function formatBusinessDateLabel(appDate) {
  const d = parseBusinessDate(appDate);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
