export const ORDER_LIVE_STAGES = [
  { key: "ORDER_PLACED", label: "Order Placed" },
  { key: "ORDER_PREPARING", label: "Order Preparing" },
  { key: "FOOD_PREPARED", label: "Food Prepared" },
  { key: "MOVED_TO_TABLE", label: "Moved To Table" },
];

export const ORDER_LIVE_STAGE_MAP = Object.fromEntries(
  ORDER_LIVE_STAGES.map((stage, index) => [stage.key, { ...stage, index }])
);

export function getNextOrderLiveAction(status) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "ORDER_PLACED") {
    return { status: "ORDER_PREPARING", label: "Start Preparing" };
  }
  if (normalized === "ORDER_PREPARING") {
    return { status: "FOOD_PREPARED", label: "Mark Food Prepared" };
  }
  if (normalized === "FOOD_PREPARED") {
    return { status: "MOVED_TO_TABLE", label: "Move To Table" };
  }
  return null;
}

export function formatOrderLiveAge(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
