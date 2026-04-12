const ALL_ROLES = new Set(["admin", "manager", "cashier", "waiter"]);

export const mobileMenuCatalog = [
  // ── Billing ────────────────────────────────────────────────────────
  {
    key: "sales_billing",
    title: "Take Away Billing",
    icon: "🧾",
    route: "CreateBill",
    perm: { module: "billing", action: "write" },
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "billing_history",
    title: "Billing History",
    icon: "🧾",
    route: "SalesHistory",
    perm: { module: "billing", action: "read" },
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "customers",
    title: "Customer",
    icon: "👥",
    route: "Customers",
    perm: { module: "customers", action: "read" },
    fallbackRoles: ALL_ROLES,
  },
  // ── Hotel-only ─────────────────────────────────────────────────────
  {
    key: "table_billing",
    title: "Table Billing",
    icon: "🍽️",
    route: "TableGrid",
    perm: { module: "billing", action: "write" },
    fallbackRoles: ALL_ROLES,
    hotelOnly: true,
  },
  {
    key: "order_live",
    title: "Order live",
    icon: "🛎️",
    route: "OrderLive",
    perm: { module: "billing", action: "read" },
    fallbackRoles: ALL_ROLES,
    hotelOnly: true,
  },
  {
    key: "kot_management",
    title: "KOT Management",
    icon: "🍳",
    route: "KotManagement",
    perm: { module: "billing", action: "write" },
    fallbackRoles: ALL_ROLES,
    hotelOnly: true,
  },
  {
    key: "qr_order_accept",
    title: "QR Order Accept",
    icon: "📱",
    route: "QrOrdersAccept",
    perm: { module: "qr_orders", action: "write" },
    fallbackRoles: ALL_ROLES,
    hotelOnly: true,
  },
  {
    key: "held_invoices",
    title: "Held Invoices",
    icon: "🔖",
    route: "HeldInvoices",
    perm: { module: "billing", action: "read" },
    fallbackRoles: ALL_ROLES,
    hotelOnly: true,
  },
  {
    key: "online_orders",
    title: "Online Orders",
    icon: "🛵",
    route: "OnlineOrders",
    perm: { module: "billing", action: "read" },
    fallbackRoles: ALL_ROLES,
    hotelOnly: true,
  },
  // ── Operations ─────────────────────────────────────────────────────
  {
    key: "inventory",
    title: "Inventory",
    icon: "📦",
    route: "Inventory",
    perm: { module: "billing", action: "read" },
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "dues",
    title: "Dues & Receivables",
    icon: "💰",
    route: "Dues",
    perm: { module: "billing", action: "read" },
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "returns",
    title: "Returns",
    icon: "↩️",
    route: "Returns",
    perm: { module: "billing", action: "write" },
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "expenses",
    title: "Expenses",
    icon: "💸",
    route: "Expenses",
    perm: { module: "expenses", action: "read" },
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "cash_drawer",
    title: "Cash Drawer",
    icon: "💵",
    route: "CashDrawer",
    perm: { module: "cash_drawer", action: "read" },
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "loyalty",
    title: "Loyalty",
    icon: "⭐",
    route: "Loyalty",
    perm: { module: "loyalty", action: "read" },
    fallbackRoles: ALL_ROLES,
  },
  // ── Management (admin / manager only) ─────────────────────────────
  {
    key: "employees",
    title: "Employees",
    icon: "👤",
    route: "Employees",
    perm: { module: "billing", action: "read" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
  {
    key: "employee_attendance",
    title: "Attendance",
    icon: "📋",
    route: "EmployeeAttendance",
    perm: { module: "billing", action: "write" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
  {
    key: "day_close",
    title: "Day Close",
    icon: "🌙",
    route: "DayClose",
    perm: { module: "billing", action: "write" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
  {
    key: "reports",
    title: "Reports",
    icon: "📊",
    route: "Reports",
    perm: { module: "billing", action: "read" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
  {
    key: "analytics",
    title: "Analytics",
    icon: "📈",
    route: "Analytics",
    perm: { module: "billing", action: "read" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
  // ── Native module shells for desktop parity ───────────────────────
  {
    key: "drafts",
    title: "Draft Bills",
    icon: "📝",
    route: "NativeModule",
    params: { title: "Draft Bills", moduleKey: "drafts" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "deleted_invoices",
    title: "Deleted Invoices",
    icon: "🗑️",
    route: "NativeModule",
    params: { title: "Deleted Invoices", moduleKey: "deleted_invoices" },
    perm: null,
    fallbackRoles: new Set(["admin", "manager"]),
  },
  {
    key: "reorder_alerts",
    title: "Reorder Alerts",
    icon: "🚨",
    route: "NativeModule",
    params: { title: "Reorder Alerts", moduleKey: "reorder_alerts" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "stock_transfers",
    title: "Stock Transfers",
    icon: "🔄",
    route: "NativeModule",
    params: { title: "Stock Transfers", moduleKey: "transfers" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "item_lots",
    title: "Item Lots",
    icon: "📦",
    route: "NativeModule",
    params: { title: "Item Lots", moduleKey: "item_lots" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "labels",
    title: "Labels",
    icon: "🏷️",
    route: "NativeModule",
    params: { title: "Labels", moduleKey: "labels" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "stock_audit",
    title: "Stock Audit",
    icon: "🧮",
    route: "NativeModule",
    params: { title: "Stock Audit", moduleKey: "stock_audit" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "supplier_ledger",
    title: "Supplier Ledger",
    icon: "🚚",
    route: "SupplierLedger",
    perm: { module: "supplier_ledger", action: "read" },
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "gift_cards",
    title: "Gift Cards",
    icon: "🎁",
    route: "NativeModule",
    params: { title: "Gift Cards", moduleKey: "gift_cards" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "coupons",
    title: "Coupons",
    icon: "🎟️",
    route: "NativeModule",
    params: { title: "Coupons", moduleKey: "coupons" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "trends",
    title: "Trends",
    icon: "📉",
    route: "NativeModule",
    params: { title: "Trends", moduleKey: "trends" },
    perm: null,
    fallbackRoles: new Set(["admin", "manager"]),
  },
  {
    key: "feedback_review",
    title: "Feedback Review",
    icon: "🌟",
    route: "NativeModule",
    params: { title: "Feedback Review", moduleKey: "feedback_review" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "alerts",
    title: "Alerts",
    icon: "🔔",
    route: "NativeModule",
    params: { title: "Alerts", moduleKey: "alerts" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "support_tickets",
    title: "Support Tickets",
    icon: "🛟",
    route: "NativeModule",
    params: { title: "Support Tickets", moduleKey: "support_tickets" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "offline_sync",
    title: "Offline Sync",
    icon: "☁️",
    route: "NativeModule",
    params: { title: "Offline Sync", moduleKey: "offline_sync" },
    perm: null,
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "admin_setup",
    title: "Admin Setup",
    icon: "⚙️",
    route: "NativeModule",
    params: { title: "Admin & Setup", moduleKey: "admin" },
    perm: { module: "admin", action: "read" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
];

export function modulesToPermMap(modules) {
  const map = {};
  for (const m of modules || []) {
    if (!m?.key) continue;
    map[String(m.key)] = {
      can_read: Boolean(m.can_read),
      can_write: Boolean(m.can_write),
    };
  }
  return map;
}

export function canAccess(permMap, perm) {
  if (!perm) return true;
  const key = String(perm.module || "");
  const row = permMap?.[key];
  if (!row) return false;
  return perm.action === "write" ? Boolean(row.can_write) : Boolean(row.can_read);
}

/**
 * Build the menu list for the current user.
 * @param {object} opts
 * @param {string} opts.roleLower       - User role in lowercase
 * @param {boolean} opts.permsEnabled   - Whether backend RBAC is on
 * @param {object} opts.permMap         - Module permission map
 * @param {boolean} opts.isHotel        - Whether this shop is a hotel
 */
export function buildMobileMenu({ roleLower, permsEnabled, permMap, isHotel = false }) {
  let catalog = mobileMenuCatalog;

  if (!isHotel) {
    catalog = catalog.filter((m) => !m.hotelOnly);
  }

  if (permsEnabled && permMap) {
    return catalog.filter((m) => canAccess(permMap, m.perm));
  }
  return catalog.filter((m) => m.fallbackRoles.has(roleLower));
}