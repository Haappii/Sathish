const ALL_ROLES = new Set(["admin", "manager", "cashier", "waiter"]);

export const mobileMenuCatalog = [
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
    title: "KOT mangement",
    icon: "🍳",
    route: "KotManagement",
    perm: { module: "billing", action: "write" },
    fallbackRoles: ALL_ROLES,
    hotelOnly: true,
  },
  {
    key: "qr_order_accept",
    title: "QR order accept",
    icon: "📱",
    route: "QrOrdersAccept",
    perm: { module: "qr_orders", action: "write" },
    fallbackRoles: ALL_ROLES,
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
