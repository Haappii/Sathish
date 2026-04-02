/**
 * Mobile RBAC — defines which menu items appear for each role,
 * with hotel-only items gated by isHotel flag.
 */

export const mobileMenuCatalog = [
  {
    key: "dashboard",
    title: "Dashboard",
    icon: "📊",
    route: "Dashboard",
    perm: { module: "billing", action: "read" },
    fallbackRoles: new Set(["admin", "manager", "cashier"]),
  },
  {
    key: "sales_billing",
    title: "Create Bill",
    icon: "🧾",
    route: "CreateBill",
    perm: { module: "billing", action: "write" },
    fallbackRoles: new Set(["admin", "manager", "cashier", "waiter"]),
  },
  {
    key: "billing_history",
    title: "Sales History",
    icon: "📋",
    route: "SalesHistory",
    perm: { module: "billing", action: "read" },
    fallbackRoles: new Set(["admin", "manager", "cashier", "waiter"]),
  },
  {
    key: "cash_drawer",
    title: "Cash Drawer",
    icon: "💰",
    route: "CashDrawer",
    perm: { module: "cash_drawer", action: "read" },
    fallbackRoles: new Set(["admin", "manager", "cashier"]),
  },
  {
    key: "customers",
    title: "Customers",
    icon: "👥",
    route: "Customers",
    perm: { module: "customers", action: "read" },
    fallbackRoles: new Set(["admin", "manager", "cashier"]),
  },
  {
    key: "expenses",
    title: "Expenses",
    icon: "💸",
    route: "Expenses",
    perm: { module: "expenses", action: "read" },
    fallbackRoles: new Set(["admin", "manager"]),
  },
  // ── Hotel-only items ──────────────────────────────────────────────────────
  {
    key: "table_billing",
    title: "Table Billing",
    icon: "🍽️",
    route: "TableGrid",
    perm: { module: "billing", action: "write" },
    fallbackRoles: new Set(["admin", "manager", "cashier", "waiter"]),
    hotelOnly: true,
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
 * @param {string} opts.roleLower       - User's role in lowercase
 * @param {boolean} opts.permsEnabled   - Whether backend RBAC is on
 * @param {object} opts.permMap         - Module permission map
 * @param {boolean} opts.isHotel        - Whether this shop is a hotel
 */
export function buildMobileMenu({ roleLower, permsEnabled, permMap, isHotel = false }) {
  let catalog = mobileMenuCatalog;

  // Remove hotel-only items for non-hotel shops
  if (!isHotel) {
    catalog = catalog.filter((m) => !m.hotelOnly);
  }

  if (permsEnabled && permMap) {
    return catalog.filter((m) => canAccess(permMap, m.perm));
  }
  return catalog.filter((m) => m.fallbackRoles.has(roleLower));
}
