import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import authAxios from "../api/authAxios";
import { getSession } from "../utils/auth";

import {
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

export default function Home() {
  const session = getSession() || {};
  const roleLower = (session?.role || "").toString().toLowerCase();
  const branchId = session?.branch_id ?? null;

  const [shopType, setShopType] = useState("");

  useEffect(() => {
    authAxios
      .get("/shop/details")
      .then((r) => {
        const s = r?.data || {};
        setShopType((s.shop_type || s.billing_type || "").toString().toLowerCase());
      })
      .catch(() => {});
  }, []);

  const showTableBilling = shopType === "hotel";
  const isHeadOfficeClosed =
    Number(branchId) === 1 && String(session?.branch_close || "N").toUpperCase() === "Y";

  const iconFor = (path) => {
    const map = {
      "/dashboard": <FaChartPie />,
      "/trends": <FaChartLine />,
      "/analytics": <FaChartBar />,
      "/sales/create": <FaShoppingCart />,
      "/sales/history": <FaFileInvoice />,
      "/drafts": <FaFileInvoice />,
      "/returns": <FaFileInvoice />,
      "/dues": <FaFileInvoice />,
      "/customers": <FaUsers />,
      "/stock-transfers": <FaBoxes />,
      "/reports": <FaFileInvoice />,
      "/deleted-invoices": <FaFileInvoice />,
      "/inventory": <FaBoxes />,
      "/reorder-alerts": <FaBell />,
      "/support-tickets": <FaLifeRing />,
      "/setup": <FaTools />,
      "/table-billing": <MdTableRestaurant />,
    };
    return map[path] || <FaChartPie />;
  };

  const menus = useMemo(() => {
    let menuItems = [];

    if (roleLower === "cashier") {
      menuItems = [
        { name: "Dashboard", path: "/dashboard" },
        { name: "Trends", path: "/trends" },
        { name: "Sales Billing", path: "/sales/create" },
        ...(showTableBilling ? [{ name: "Table Billing", path: "/table-billing" }] : []),
      ];
    } else if (roleLower === "manager") {
      menuItems = [
        { name: "Dashboard", path: "/dashboard" },
        { name: "Trends", path: "/trends" },
        { name: "Analytics", path: "/analytics" },
        { name: "Sales Billing", path: "/sales/create" },
        { name: "Draft Bills", path: "/drafts" },
        { name: "Returns", path: "/returns" },
        { name: "Dues", path: "/dues" },
        { name: "Customers", path: "/customers" },
        { name: "Transfers", path: "/stock-transfers" },
        ...(showTableBilling ? [{ name: "Table Billing", path: "/table-billing" }] : []),
        { name: "Reports", path: "/reports" },
        { name: "Deleted Invoice", path: "/deleted-invoices" },
        { name: "Inventory", path: "/inventory" },
        { name: "Reorder Alerts", path: "/reorder-alerts" },
      ];
    } else if (roleLower === "admin") {
      menuItems = [
        { name: "Dashboard", path: "/dashboard" },
        { name: "Trends", path: "/trends" },
        { name: "Analytics", path: "/analytics" },
        { name: "Sales Billing", path: "/sales/create" },
        { name: "Draft Bills", path: "/drafts" },
        { name: "Returns", path: "/returns" },
        { name: "Dues", path: "/dues" },
        { name: "Customers", path: "/customers" },
        { name: "Transfers", path: "/stock-transfers" },
        { name: "Reorder Alerts", path: "/reorder-alerts" },
        ...(showTableBilling ? [{ name: "Table Billing", path: "/table-billing" }] : []),
        { name: "Reports", path: "/reports" },
        { name: "Deleted Invoice", path: "/deleted-invoices" },
        { name: "Support Tickets", path: "/support-tickets" },
        { name: "Admin", path: "/setup" },
      ];
    }

    if (isHeadOfficeClosed) {
      menuItems = [
        { name: "Reports", path: "/reports" },
        { name: "Analytics", path: "/analytics" },
        { name: "Admin", path: "/setup" },
      ];
    }

    return menuItems;
  }, [roleLower, showTableBilling, isHeadOfficeClosed]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-gray-700">Home</h2>
      </div>

      <div className="flex flex-wrap gap-3">
        {menus.map((m) => (
          <Link
            key={m.path}
            to={m.path}
            className="
              w-full
              sm:w-[calc(50%-0.75rem)]
              lg:w-[calc(33.333%-0.75rem)]
              flex items-center gap-3
              rounded-lg border bg-white
              px-3 py-3
              hover:bg-gray-50 hover:shadow-sm
              transition
            "
          >
            <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-lg">
              {iconFor(m.path)}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">
                {m.name}
              </div>
              <div className="text-xs text-gray-500 truncate">{m.path}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

