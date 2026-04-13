import {
  FaHome,
  FaChartLine,
  FaChartBar,
  FaShoppingCart,
  FaFileInvoice,
  FaTools,
  FaBoxes,
  FaUsers,
  FaBell,
  FaLifeRing,
  FaCashRegister,
  FaGift,
  FaTags,
  FaMoneyBillWave,
  FaHistory,
  FaBook,
  FaClipboardCheck,
  FaBarcode,
  FaCloudUploadAlt,
  FaMotorcycle,
  FaCalendarAlt,
  FaUtensils,
  FaConciergeBell,
  FaStar,
  FaClipboardList,
} from "react-icons/fa";
import { MdTableRestaurant } from "react-icons/md";

const MENU_CATALOG = [
  { key: "home", name: "Home", path: "/home", icon: <FaHome /> },
  {
    key: "cash_drawer",
    name: "Cash Drawer",
    path: "/cash-drawer",
    icon: <FaCashRegister />,
    perm: { module: "cash_drawer", action: "read" },
  },
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
    key: "billing_history",
    name: "Billing History",
    path: "/sales/history",
    icon: <FaHistory />,
    perm: { module: "billing", action: "read" },
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
    key: "qr_orders",
    name: "QR Orders",
    path: "/qr-orders",
    icon: <MdTableRestaurant />,
    perm: { module: "qr_orders", action: "read" },
    when: ({ showTableBilling }) => Boolean(showTableBilling),
  },
  {
    key: "reservations",
    name: "Reservations",
    path: "/reservations",
    icon: <FaCalendarAlt />,
    perm: { module: "billing", action: "read" },
  },
  {
    key: "delivery",
    name: "Delivery",
    path: "/delivery",
    icon: <FaMotorcycle />,
    perm: { module: "billing", action: "write" },
    when: ({ showTableBilling }) => Boolean(showTableBilling),
  },
  {
    key: "recipes",
    name: "Recipes",
    path: "/recipes",
    icon: <FaUtensils />,
    perm: { module: "inventory", action: "read" },
    when: ({ showTableBilling }) => Boolean(showTableBilling),
  },
  {
    key: "order_live",
    name: "Order Live",
    path: "/order-live",
    icon: <MdTableRestaurant />,
    perm: { module: "billing", action: "read" },
    when: ({ showTableBilling, orderLiveTrackingEnabled }) =>
      Boolean(showTableBilling) && orderLiveTrackingEnabled !== false,
  },
  {
    key: "kot_management",
    name: "KOT",
    path: "/kot",
    icon: <FaConciergeBell />,
    perm: { module: "billing", action: "write" },
    when: ({ showTableBilling, orderLiveTrackingEnabled }) =>
      Boolean(showTableBilling) && orderLiveTrackingEnabled !== false,
  },
  {
    key: "online_orders",
    name: "Online Orders",
    path: "/online-orders",
    icon: <FaMotorcycle />,
    perm: { module: "online_orders", action: "read" },
  },
  {
    key: "advance_orders",
    name: "Advance Orders",
    path: "/advance-orders",
    icon: <FaClipboardList />,
    perm: { module: "billing", action: "read" },
  },
  {
    key: "offline_sync",
    name: "Offline Sync",
    path: "/offline-sync",
    icon: <FaCloudUploadAlt />,
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
    key: "expenses",
    name: "Expenses",
    path: "/expenses",
    icon: <FaMoneyBillWave />,
    perm: { module: "expenses", action: "read" },
  },
  {
    key: "customers",
    name: "Customers",
    path: "/customers",
    icon: <FaUsers />,
    perm: { module: "customers", action: "read" },
  },
  {
    key: "employees",
    name: "Employees",
    path: "/employees",
    icon: <FaUsers />,
    perm: { module: "employees", action: "read" },
  },
  {
    key: "employee_attendance",
    name: "Employee Attendance",
    path: "/employees/attendance",
    icon: <FaClipboardCheck />,
    perm: { module: "employees", action: "read" },
  },
  {
    key: "employee_onboarding",
    name: "Onboarding Docs",
    path: "/employees/onboarding",
    icon: <FaClipboardCheck />,
    perm: { module: "employees", action: "read" },
  },
  {
    key: "loyalty",
    name: "Loyalty",
    path: "/loyalty",
    icon: <FaGift />,
    perm: { module: "loyalty", action: "read" },
  },
  {
    key: "gift_cards",
    name: "Gift Cards",
    path: "/gift-cards",
    icon: <FaGift />,
    perm: { module: "gift_cards", action: "read" },
  },
  {
    key: "coupons",
    name: "Coupons",
    path: "/coupons",
    icon: <FaTags />,
    perm: { module: "coupons", action: "read" },
  },
  {
    key: "supplier_ledger",
    name: "Supplier Ledger",
    path: "/supplier-ledger",
    icon: <FaBook />,
    perm: { module: "supplier_ledger", action: "read" },
  },
  {
    key: "stock_audit",
    name: "Stock Audit",
    path: "/stock-audit",
    icon: <FaClipboardCheck />,
    perm: { module: "stock_audit", action: "read" },
  },
  {
    key: "item_lots",
    name: "Item Lots",
    path: "/item-lots",
    icon: <FaBarcode />,
    perm: { module: "item_lots", action: "read" },
    when: ({ showTableBilling }) => !Boolean(showTableBilling),
  },
  {
    key: "labels",
    name: "Labels / Barcode",
    path: "/labels",
    icon: <FaBarcode />,
    perm: { module: "items", action: "read" },
    when: ({ showTableBilling }) => !Boolean(showTableBilling),
  },
  {
    key: "transfers",
    name: "Transfers",
    path: "/stock-transfers",
    icon: <FaBoxes />,
    perm: { module: "stock_transfers", action: "read" },
  },
  {
    key: "reports",
    name: "Reports",
    path: "/reports",
    icon: <FaFileInvoice />,
    perm: { module: "reports", action: "read" },
  },
  {
    key: "feedback_review",
    name: "Feedback Review",
    path: "/feedback-review",
    icon: <FaStar />,
    perm: { module: "feedback", action: "read" },
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
    key: "alerts",
    name: "Alerts",
    path: "/alerts",
    icon: <FaBell />,
    perm: { module: "alerts", action: "read" },
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
  "trends",
  "reports",
  "analytics",
  "admin",
]);

const getSalesBillingName = (showTableBilling) =>
  showTableBilling ? "Take Away" : "Billing";

const applyDynamicMenuLabels = (item, { showTableBilling }) => {
  if (item.key === "sales_billing") {
    return { ...item, name: getSalesBillingName(showTableBilling) };
  }
  if (item.key === "inventory" && showTableBilling) {
    return { ...item, name: "Raw Materials" };
  }
  return item;
};

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
  orderLiveTrackingEnabled = true,
}) => {
  let items = MENU_CATALOG.filter((x) =>
    x.when ? x.when({ showTableBilling, orderLiveTrackingEnabled }) : true
  );

  if (isHeadOfficeClosed) {
    items = items.filter((x) => HEAD_OFFICE_CLOSED_KEYS.has(x.key));
  }

  return items
    .filter((x) => canAccess(permMap, x.perm))
    .map((x) => applyDynamicMenuLabels(x, { showTableBilling }));
};

export const buildRoleMenu = ({
  roleLower,
  showTableBilling,
  isHeadOfficeClosed,
  orderLiveTrackingEnabled = true,
}) => {
  let menuItems = [];
  const inventoryName = showTableBilling ? "Raw Materials" : "Inventory";
  const salesBillingName = getSalesBillingName(showTableBilling);
  const showOrderLiveMenus = Boolean(showTableBilling) && orderLiveTrackingEnabled !== false;

  if (roleLower === "cashier") {
    menuItems = [
      { name: "Home", path: "/home", icon: <FaHome /> },
      { name: "Trends", path: "/trends", icon: <FaChartLine /> },
      { name: "Cash Drawer", path: "/cash-drawer", icon: <FaCashRegister /> },
      { name: salesBillingName, path: "/sales/create", icon: <FaShoppingCart /> },
      { name: "Billing History", path: "/sales/history", icon: <FaHistory /> },
      ...(showTableBilling
        ? [
            { name: "Table Billing", path: "/table-billing", icon: <MdTableRestaurant /> },
            { name: "QR Orders", path: "/qr-orders", icon: <MdTableRestaurant /> },
            ...(showOrderLiveMenus
              ? [
                  { name: "Order Live", path: "/order-live", icon: <MdTableRestaurant /> },
                  { name: "KOT", path: "/kot", icon: <FaConciergeBell /> },
                ]
              : []),
            { name: "Delivery", path: "/delivery", icon: <FaMotorcycle /> },
          ]
        : []),
      { name: "Reservations", path: "/reservations", icon: <FaCalendarAlt /> },
      { name: "Online Orders", path: "/online-orders", icon: <FaMotorcycle /> },
      { name: "Offline Sync", path: "/offline-sync", icon: <FaCloudUploadAlt /> },
      { name: "Loyalty", path: "/loyalty", icon: <FaGift /> },
      { name: "Gift Cards", path: "/gift-cards", icon: <FaGift /> },
    ];
  } else if (roleLower === "waiter") {
    menuItems = [
      { name: "Home", path: "/home", icon: <FaHome /> },
      { name: "Trends", path: "/trends", icon: <FaChartLine /> },
      { name: salesBillingName, path: "/sales/create", icon: <FaShoppingCart /> },
      { name: "Billing History", path: "/sales/history", icon: <FaHistory /> },
      ...(showTableBilling
        ? [
            { name: "Table Billing", path: "/table-billing", icon: <MdTableRestaurant /> },
            { name: "QR Orders", path: "/qr-orders", icon: <MdTableRestaurant /> },
            ...(showOrderLiveMenus
              ? [
                  { name: "Order Live", path: "/order-live", icon: <MdTableRestaurant /> },
                  { name: "KOT", path: "/kot", icon: <FaConciergeBell /> },
                ]
              : []),
          ]
        : []),
      { name: "Reservations", path: "/reservations", icon: <FaCalendarAlt /> },
    ];
  } else if (roleLower === "manager") {
    menuItems = [
      { name: "Home", path: "/home", icon: <FaHome /> },
      { name: "Trends", path: "/trends", icon: <FaChartLine /> },
      { name: "Analytics", path: "/analytics", icon: <FaChartBar /> },
      { name: "Cash Drawer", path: "/cash-drawer", icon: <FaCashRegister /> },
      { name: salesBillingName, path: "/sales/create", icon: <FaShoppingCart /> },
      { name: "Billing History", path: "/sales/history", icon: <FaHistory /> },
      { name: "Reservations", path: "/reservations", icon: <FaCalendarAlt /> },
      ...(showTableBilling
        ? [
            { name: "Table Billing", path: "/table-billing", icon: <MdTableRestaurant /> },
            { name: "QR Orders", path: "/qr-orders", icon: <MdTableRestaurant /> },
            ...(showOrderLiveMenus
              ? [
                  { name: "Order Live", path: "/order-live", icon: <MdTableRestaurant /> },
                  { name: "KOT", path: "/kot", icon: <FaConciergeBell /> },
                ]
              : []),
            { name: "Delivery", path: "/delivery", icon: <FaMotorcycle /> },
            { name: "Recipes", path: "/recipes", icon: <FaUtensils /> },
          ]
        : []),
      { name: "Online Orders", path: "/online-orders", icon: <FaMotorcycle /> },
      { name: "Offline Sync", path: "/offline-sync", icon: <FaCloudUploadAlt /> },
      { name: "Draft Bills", path: "/drafts", icon: <FaFileInvoice /> },
      { name: "Returns", path: "/returns", icon: <FaFileInvoice /> },
      { name: "Dues", path: "/dues", icon: <FaFileInvoice /> },
      { name: "Expenses", path: "/expenses", icon: <FaMoneyBillWave /> },
      { name: "Customers", path: "/customers", icon: <FaUsers /> },
      { name: "Employees", path: "/employees", icon: <FaUsers /> },
      { name: "Employee Attendance", path: "/employees/attendance", icon: <FaClipboardCheck /> },
      { name: "Loyalty", path: "/loyalty", icon: <FaGift /> },
      { name: "Gift Cards", path: "/gift-cards", icon: <FaGift /> },
      { name: "Coupons", path: "/coupons", icon: <FaTags /> },
      { name: "Supplier Ledger", path: "/supplier-ledger", icon: <FaBook /> },
      { name: "Stock Audit", path: "/stock-audit", icon: <FaClipboardCheck /> },
      ...(!showTableBilling
        ? [
            { name: "Item Lots", path: "/item-lots", icon: <FaBarcode /> },
            { name: "Labels / Barcode", path: "/labels", icon: <FaBarcode /> },
          ]
        : []),
      { name: "Transfers", path: "/stock-transfers", icon: <FaBoxes /> },
      { name: "Reports", path: "/reports", icon: <FaFileInvoice /> },
      { name: "Feedback Review", path: "/feedback-review", icon: <FaStar /> },
      { name: "Deleted Invoice", path: "/deleted-invoices", icon: <FaFileInvoice /> },
      { name: inventoryName, path: "/inventory", icon: <FaBoxes /> },
      { name: "Alerts", path: "/alerts", icon: <FaBell /> },
      { name: "Support Tickets", path: "/support-tickets", icon: <FaLifeRing /> },
      { name: "Admin", path: "/setup", icon: <FaTools /> },
    ];
  } else if (roleLower === "admin") {
    menuItems = [
      { name: "Home", path: "/home", icon: <FaHome /> },
      { name: "Trends", path: "/trends", icon: <FaChartLine /> },
      { name: "Analytics", path: "/analytics", icon: <FaChartBar /> },
      { name: "Cash Drawer", path: "/cash-drawer", icon: <FaCashRegister /> },
      { name: salesBillingName, path: "/sales/create", icon: <FaShoppingCart /> },
      { name: "Billing History", path: "/sales/history", icon: <FaHistory /> },
      { name: "Reservations", path: "/reservations", icon: <FaCalendarAlt /> },
      ...(showTableBilling
        ? [
            { name: "Table Billing", path: "/table-billing", icon: <MdTableRestaurant /> },
            { name: "QR Orders", path: "/qr-orders", icon: <MdTableRestaurant /> },
            ...(showOrderLiveMenus
              ? [
                  { name: "Order Live", path: "/order-live", icon: <MdTableRestaurant /> },
                  { name: "KOT", path: "/kot", icon: <FaConciergeBell /> },
                ]
              : []),
            { name: "Delivery", path: "/delivery", icon: <FaMotorcycle /> },
            { name: "Recipes", path: "/recipes", icon: <FaUtensils /> },
          ]
        : []),
      { name: "Online Orders", path: "/online-orders", icon: <FaMotorcycle /> },
      { name: "Offline Sync", path: "/offline-sync", icon: <FaCloudUploadAlt /> },
      { name: "Draft Bills", path: "/drafts", icon: <FaFileInvoice /> },
      { name: "Returns", path: "/returns", icon: <FaFileInvoice /> },
      { name: "Dues", path: "/dues", icon: <FaFileInvoice /> },
      { name: "Expenses", path: "/expenses", icon: <FaMoneyBillWave /> },
      { name: "Customers", path: "/customers", icon: <FaUsers /> },
      { name: "Employees", path: "/employees", icon: <FaUsers /> },
      { name: "Employee Attendance", path: "/employees/attendance", icon: <FaClipboardCheck /> },
      { name: "Loyalty", path: "/loyalty", icon: <FaGift /> },
      { name: "Gift Cards", path: "/gift-cards", icon: <FaGift /> },
      { name: "Coupons", path: "/coupons", icon: <FaTags /> },
      { name: "Supplier Ledger", path: "/supplier-ledger", icon: <FaBook /> },
      { name: "Stock Audit", path: "/stock-audit", icon: <FaClipboardCheck /> },
      ...(!showTableBilling
        ? [
            { name: "Item Lots", path: "/item-lots", icon: <FaBarcode /> },
            { name: "Labels / Barcode", path: "/labels", icon: <FaBarcode /> },
          ]
        : []),
      { name: "Transfers", path: "/stock-transfers", icon: <FaBoxes /> },
      { name: "Alerts", path: "/alerts", icon: <FaBell /> },
      { name: "Reports", path: "/reports", icon: <FaFileInvoice /> },
      { name: "Feedback Review", path: "/feedback-review", icon: <FaStar /> },
      { name: "Deleted Invoice", path: "/deleted-invoices", icon: <FaFileInvoice /> },
      { name: inventoryName, path: "/inventory", icon: <FaBoxes /> },
      { name: "Support Tickets", path: "/support-tickets", icon: <FaLifeRing /> },
      { name: "Admin", path: "/setup", icon: <FaTools /> },
    ];
  }

  if (isHeadOfficeClosed) {
    menuItems = [
      { name: "Trends", path: "/trends", icon: <FaChartLine /> },
      { name: "Analytics", path: "/analytics", icon: <FaChartBar /> },
      { name: "Reports", path: "/reports", icon: <FaFileInvoice /> },
      { name: "Admin", path: "/setup", icon: <FaTools /> },
    ];
  }

  return menuItems;
};
