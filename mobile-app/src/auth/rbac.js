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
    perm: { module: "drafts", action: "read" },
    fallbackRoles: ALL_ROLES,
    hotelOnly: true,
  },
  // ── Operations ─────────────────────────────────────────────────────
  {
    key: "inventory",
    title: "Inventory",
    icon: "📦",
    route: "Inventory",
    perm: { module: "inventory", action: "read" },
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "dues",
    title: "Dues & Receivables",
    icon: "💰",
    route: "Dues",
    perm: { module: "dues", action: "read" },
    fallbackRoles: ALL_ROLES,
  },
  {
    key: "returns",
    title: "Returns",
    icon: "↩️",
    route: "Returns",
    perm: { module: "returns", action: "write" },
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
    perm: { module: "employees", action: "read" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
  {
    key: "employee_attendance",
    title: "Attendance",
    icon: "📋",
    route: "EmployeeAttendance",
    perm: { module: "employees", action: "write" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
  {
    key: "analytics",
    title: "Analytics",
    icon: "📈",
    route: "Analytics",
    perm: { module: "analytics", action: "read" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
  {
    key: "supplier_ledger",
    title: "Supplier Ledger",
    icon: "🚚",
    route: "SupplierLedger",
    perm: { module: "supplier_ledger", action: "read" },
    fallbackRoles: ALL_ROLES,
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

  if (!permMap || typeof permMap !== "object") {
    return [];
  }

  return catalog.filter((m) => canAccess(permMap, m.perm));
}