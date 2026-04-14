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
    icon: "👨‍💼",
    route: "Employees",
    params: { initialTab: "employees" },
    perm: { module: "employees", action: "read" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
  {
    key: "employee_settlements",
    title: "Employee Settlements",
    icon: "💵",
    route: "Employees",
    params: { initialTab: "settlements" },
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
    key: "advance_orders",
    title: "Advance Orders",
    icon: "📋",
    route: "AdvanceOrders",
    perm: { module: "billing", action: "read" },
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
    key: "deleted_invoices",
    title: "Deleted Invoices",
    icon: "🗑️",
    route: "DeletedInvoices",
    perm: { module: "billing", action: "read" },
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

// Keys always visible regardless of platform module restrictions.
const MOBILE_CORE_KEYS = new Set(["sales_billing", "inventory"]);

/**
 * Build the menu list for the current user.
 * @param {object} opts
 * @param {string}  opts.roleLower      - User role in lowercase
 * @param {boolean} opts.permsEnabled   - Whether backend RBAC is on
 * @param {object}  opts.permMap        - Module permission map
 * @param {boolean} opts.isHotel        - Whether this shop is a hotel
 * @param {Set|null} opts.enabledModules - Platform-configured module set, or null for unrestricted
 */
export function buildMobileMenu({ roleLower, permsEnabled, permMap, isHotel = false, enabledModules = null }) {
  let catalog = mobileMenuCatalog;

  if (!isHotel) {
    catalog = catalog.filter((m) => !m.hotelOnly);
  }

  // Apply platform module restrictions when configured.
  if (enabledModules !== null) {
    catalog = catalog.filter(
      (m) => MOBILE_CORE_KEYS.has(m.key) || enabledModules.has(m.key)
    );
  }

  if (!permMap || typeof permMap !== "object") {
    return [];
  }

  return catalog.filter((m) => canAccess(permMap, m.perm));
}