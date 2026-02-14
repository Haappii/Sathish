export const mobileMenuCatalog = [
  {
    key: "sales_billing",
    title: "Create Bill",
    route: "CreateBill",
    perm: { module: "billing", action: "write" },
    fallbackRoles: new Set(["admin", "manager", "cashier", "waiter"]),
  },
  {
    key: "billing_history",
    title: "Sales History",
    route: "SalesHistory",
    perm: { module: "billing", action: "read" },
    fallbackRoles: new Set(["admin", "manager", "cashier", "waiter"]),
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

export function buildMobileMenu({ roleLower, permsEnabled, permMap }) {
  if (permsEnabled && permMap) {
    return mobileMenuCatalog.filter((m) => canAccess(permMap, m.perm));
  }
  return mobileMenuCatalog.filter((m) => m.fallbackRoles.has(roleLower));
}
