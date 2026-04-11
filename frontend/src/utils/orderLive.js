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

export const KOT_STATUS_STAGES = [
  { key: "PENDING", label: "Order Placed" },
  { key: "PREPARING", label: "Order Preparing" },
  { key: "READY", label: "Food Prepared" },
  { key: "SERVED", label: "Moved To Table" },
];

export const KOT_STATUS_STAGE_MAP = Object.fromEntries(
  KOT_STATUS_STAGES.map((stage, index) => [stage.key, { ...stage, index }])
);

export function getNextKotAction(status, orderType) {
  const normalized = String(status || "").trim().toUpperCase();
  const normalizedType = String(orderType || "").trim().toUpperCase();
  if (normalized === "PENDING") {
    return { status: "PREPARING", label: "Start Preparing" };
  }
  if (normalized === "PREPARING") {
    return { status: "READY", label: "Food Prepared" };
  }
  if (normalized === "READY") {
    return {
      status: "SERVED",
      label: normalizedType === "TAKEAWAY" ? "Hand Over" : "Move To Table",
    };
  }
  return null;
}

export function formatKotStatusLabel(status) {
  const normalized = String(status || "").trim().toUpperCase();
  return KOT_STATUS_STAGE_MAP[normalized]?.label || normalized.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatOrderLiveAge(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function getTrackingDisplayTitle({ tableName, orderType, tokenNumber, orderId }) {
  const normalizedType = String(orderType || "").trim().toUpperCase();
  if (normalizedType === "TAKEAWAY") {
    return tokenNumber ? `Take Away ${tokenNumber}` : "Take Away";
  }
  return tableName ? `Table ${tableName}` : `Order #${orderId}`;
}

export function formatTrackingStatusLabel(status, fallbackLabel, orderType) {
  const normalizedType = String(orderType || "").trim().toUpperCase();
  const normalizedStatus = String(status || "").trim().toUpperCase();

  if (normalizedType === "TAKEAWAY" && normalizedStatus === "SERVED") {
    return "";
  }
  if (normalizedType === "TAKEAWAY" && normalizedStatus === "MOVED_TO_TABLE") {
    return "";
  }

  if (fallbackLabel) return fallbackLabel;
  return formatKotStatusLabel(normalizedStatus);
}
