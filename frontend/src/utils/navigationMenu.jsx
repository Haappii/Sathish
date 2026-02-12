import {
  FaHome,
  FaChartPie,
  FaChartLine,
  FaChartBar,
  FaShoppingCart,
  FaFileInvoice,
  FaTools,
  FaBoxes,
  FaUsers,
  FaBell,
  FaLifeRing,
} from "react-icons/fa";
import { MdTableRestaurant } from "react-icons/md";

const MENU_CATALOG = [
  { key: "home", name: "Home", path: "/home", icon: <FaHome /> },
  { key: "dashboard", name: "Dashboard", path: "/dashboard", icon: <FaChartPie /> },
  {
    key: "trends",
    name: "Trends",
    path: "/trends",
    icon: <FaChartLine />,
    perm: { module: "billing", action: "read" },
  },
  {
    key: "analytics",
    name: "Analytics",
    path: "/analytics",
    icon: <FaChartBar />,
    perm: { module: "analytics", action: "read" },
  },
  {
    key: "sales_billing",
    name: "Sales Billing",
    path: "/sales/create",
    icon: <FaShoppingCart />,
    perm: { module: "billing", action: "write" },
  },
  {
    key: "drafts",
    name: "Draft Bills",
    path: "/drafts",
    icon: <FaFileInvoice />,
    perm: { module: "drafts", action: "read" },
  },
  {
    key: "returns",
    name: "Returns",
    path: "/returns",
    icon: <FaFileInvoice />,
    perm: { module: "returns", action: "read" },
  },
  {
    key: "dues",
    name: "Dues",
    path: "/dues",
    icon: <FaFileInvoice />,
    perm: { module: "dues", action: "read" },
  },
  {
    key: "customers",
    name: "Customers",
    path: "/customers",
    icon: <FaUsers />,
    perm: { module: "customers", action: "read" },
  },
  {
    key: "transfers",
    name: "Transfers",
    path: "/stock-transfers",
    icon: <FaBoxes />,
    perm: { module: "stock_transfers", action: "read" },
  },
  {
    key: "table_billing",
    name: "Table Billing",
    path: "/table-billing",
    icon: <MdTableRestaurant />,
    perm: { module: "billing", action: "write" },
    when: ({ showTableBilling }) => Boolean(showTableBilling),
  },
  {
    key: "reports",
    name: "Reports",
    path: "/reports",
    icon: <FaFileInvoice />,
    perm: { module: "reports", action: "read" },
  },
  {
    key: "deleted_invoices",
    name: "Deleted Invoice",
    path: "/deleted-invoices",
    icon: <FaFileInvoice />,
    perm: { module: "reports", action: "read" },
  },
  {
    key: "inventory",
    name: "Inventory",
    path: "/inventory",
    icon: <FaBoxes />,
    perm: { module: "inventory", action: "read" },
  },
  {
    key: "reorder_alerts",
    name: "Reorder Alerts",
    path: "/reorder-alerts",
    icon: <FaBell />,
    perm: { module: "inventory", action: "read" },
  },
  {
    key: "support_tickets",
    name: "Support Tickets",
    path: "/support-tickets",
    icon: <FaLifeRing />,
    perm: { module: "support_tickets", action: "read" },
  },
  {
    key: "admin",
    name: "Admin",
    path: "/setup",
    icon: <FaTools />,
    perm: { module: "setup", action: "read" },
  },
];

const HEAD_OFFICE_CLOSED_KEYS = new Set([
  "home",
  "reports",
  "analytics",
  "admin",
]);

export const modulesToPermMap = (modules) => {
  const map = {};
  for (const m of modules || []) {
    if (!m?.key) continue;
    map[String(m.key)] = {
      can_read: Boolean(m.can_read),
      can_write: Boolean(m.can_write),
    };
  }
  return map;
};

export const canAccess = (permMap, perm) => {
  if (!perm) return true;
  const moduleKey = String(perm.module || "");
  if (!moduleKey) return true;
  const p = permMap?.[moduleKey];
  if (!p) return false;
  return perm.action === "write" ? Boolean(p.can_write) : Boolean(p.can_read);
};

export const buildRbacMenu = ({
  permMap,
  showTableBilling,
  isHeadOfficeClosed,
}) => {
  let items = MENU_CATALOG.filter((x) =>
    x.when ? x.when({ showTableBilling }) : true
  );

  if (isHeadOfficeClosed) {
    items = items.filter((x) => HEAD_OFFICE_CLOSED_KEYS.has(x.key));
  }

  return items.filter((x) => canAccess(permMap, x.perm));
};

export const buildRoleMenu = ({
  roleLower,
  showTableBilling,
  isHeadOfficeClosed,
}) => {
  let menuItems = [];

  if (roleLower === "cashier") {
    menuItems = [
      { name: "Home", path: "/home", icon: <FaHome /> },
      { name: "Dashboard", path: "/dashboard", icon: <FaChartPie /> },
      { name: "Trends", path: "/trends", icon: <FaChartLine /> },
      { name: "Sales Billing", path: "/sales/create", icon: <FaShoppingCart /> },
      ...(showTableBilling
        ? [
            {
              name: "Table Billing",
              path: "/table-billing",
              icon: <MdTableRestaurant />,
            },
          ]
        : []),
    ];
  } else if (roleLower === "manager") {
    menuItems = [
      { name: "Home", path: "/home", icon: <FaHome /> },
      { name: "Dashboard", path: "/dashboard", icon: <FaChartPie /> },
      { name: "Trends", path: "/trends", icon: <FaChartLine /> },
      { name: "Analytics", path: "/analytics", icon: <FaChartBar /> },
      { name: "Sales Billing", path: "/sales/create", icon: <FaShoppingCart /> },
      { name: "Draft Bills", path: "/drafts", icon: <FaFileInvoice /> },
      { name: "Returns", path: "/returns", icon: <FaFileInvoice /> },
      { name: "Dues", path: "/dues", icon: <FaFileInvoice /> },
      { name: "Customers", path: "/customers", icon: <FaUsers /> },
      { name: "Transfers", path: "/stock-transfers", icon: <FaBoxes /> },
      ...(showTableBilling
        ? [
            {
              name: "Table Billing",
              path: "/table-billing",
              icon: <MdTableRestaurant />,
            },
          ]
        : []),
      { name: "Reports", path: "/reports", icon: <FaFileInvoice /> },
      {
        name: "Deleted Invoice",
        path: "/deleted-invoices",
        icon: <FaFileInvoice />,
      },
      { name: "Inventory", path: "/inventory", icon: <FaBoxes /> },
      { name: "Reorder Alerts", path: "/reorder-alerts", icon: <FaBell /> },
    ];
  } else if (roleLower === "admin") {
    menuItems = [
      { name: "Home", path: "/home", icon: <FaHome /> },
      { name: "Dashboard", path: "/dashboard", icon: <FaChartPie /> },
      { name: "Trends", path: "/trends", icon: <FaChartLine /> },
      { name: "Analytics", path: "/analytics", icon: <FaChartBar /> },
      { name: "Sales Billing", path: "/sales/create", icon: <FaShoppingCart /> },
      { name: "Draft Bills", path: "/drafts", icon: <FaFileInvoice /> },
      { name: "Returns", path: "/returns", icon: <FaFileInvoice /> },
      { name: "Dues", path: "/dues", icon: <FaFileInvoice /> },
      { name: "Customers", path: "/customers", icon: <FaUsers /> },
      { name: "Transfers", path: "/stock-transfers", icon: <FaBoxes /> },
      { name: "Reorder Alerts", path: "/reorder-alerts", icon: <FaBell /> },
      ...(showTableBilling
        ? [
            {
              name: "Table Billing",
              path: "/table-billing",
              icon: <MdTableRestaurant />,
            },
          ]
        : []),
      { name: "Reports", path: "/reports", icon: <FaFileInvoice /> },
      {
        name: "Deleted Invoice",
        path: "/deleted-invoices",
        icon: <FaFileInvoice />,
      },
      { name: "Support Tickets", path: "/support-tickets", icon: <FaLifeRing /> },
      { name: "Admin", path: "/setup", icon: <FaTools /> },
    ];
  }

  if (isHeadOfficeClosed) {
    menuItems = [
      { name: "Home", path: "/home", icon: <FaHome /> },
      { name: "Reports", path: "/reports", icon: <FaFileInvoice /> },
      { name: "Analytics", path: "/analytics", icon: <FaChartBar /> },
      { name: "Admin", path: "/setup", icon: <FaTools /> },
    ];
  }

  return menuItems;
};

