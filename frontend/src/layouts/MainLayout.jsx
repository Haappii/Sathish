// src/layouts/MainLayout.jsx

import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, NavLink } from "react-router-dom";
import api from "../utils/apiClient";

import {
  getSession,
  setSession,
  clearSession,
  isSessionExpired,
  refreshSessionActivity
} from "../utils/auth";

import defaultLogo from "../assets/logo.png";
import SupportChat from "../components/SupportChat";
import { getShopLogoUrl } from "../utils/shopLogo";

import {
  FaHome,
  FaChartPie,
  FaChartBar,
  FaShoppingCart,
  FaFileInvoice,
  FaTools,
  FaBoxes,
  FaChartLine,
  FaUsers,
  FaBell,
  FaLifeRing
} from "react-icons/fa";
import { MdTableRestaurant } from "react-icons/md";

const BLUE = "#0B3C8C";
const APP_VERSION = "1.0.0";
const BUILD_CODE = "2026.02.04";

export default function MainLayout({ hideSidebar = false }) {
  const navigate = useNavigate();
  const location = useLocation();

  const session = getSession() || {};

  /* ================= USER INFO ================= */
  const userName =
    session?.username ||
    session?.user_name ||
    session?.name ||
    "User";

  const roleLower = (session?.role || "").toString().toLowerCase();
  const isAdmin = roleLower === "admin";

  /* ================= STATE ================= */
  const [shopName, setShopName] = useState("Haappii Billing");
  const [shop, setShop] = useState({});
  const [branches, setBranches] = useState([]);
  const [branchAddress, setBranchAddress] = useState("Loading...");
  const [switching, setSwitching] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState(defaultLogo);

  const branchId = session?.branch_id ?? null;
  const branchName = session?.branch_name ?? null;

  const appDateDisplay = shop?.app_date
    ? new Date(shop.app_date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
    : "Business Date not set";

  /* ================= SESSION CHECK ================= */
  useEffect(() => {
    if (!session?.token || isSessionExpired()) {
      clearSession();
      navigate("/");
      return;
    }
    refreshSessionActivity();
  }, [location.pathname]);

  /* ================= SHOP DETAILS ================= */
  useEffect(() => {
    api.get("/shop/details")
      .then(res => {
        const data = res.data || {};
        if (data.shop_name) setShopName(data.shop_name);
        setShop(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const url = getShopLogoUrl(shop);
    setLogoSrc(url || defaultLogo);
  }, [shop?.shop_id, shop?.shop_name, shop?.logo_url]);

  /* ================= BRANCH LIST (ADMIN) ================= */
  useEffect(() => {
    if (!isAdmin) return;
    api.get("/branch/list")
      .then(res => setBranches(res.data || []))
      .catch(() => {});
  }, [isAdmin]);

  /* ================= BRANCH ADDRESS ================= */
  const loadBranchAddress = async () => {
    try {
      let b = null;

      if (branchId) {
        const res = await api.get(`/branch/${branchId}`);
        b = res?.data || null;
      } else if (branchName) {
        // Fallback: resolve by name from cached list or active branches
        let list = branches;
        if (!list || list.length === 0) {
          const res = await api.get("/branch/active");
          list = res?.data || [];
        }
        b = list.find(x => x.branch_name === branchName) || null;
      }

      if (!b) {
        setBranchAddress("No branch selected");
        return;
      }

      const addr = [
        b.address_line1,
        b.address_line2,
        b.city,
        b.state,
        b.pincode
      ].filter(Boolean).join(", ");
      if (addr) {
        setBranchAddress(addr);
        return;
      }

      const shopAddr = [
        shop.address_line1,
        shop.address_line2,
        shop.address_line3,
        shop.city,
        shop.state,
        shop.pincode
      ].filter(Boolean).join(", ");
      setBranchAddress(shopAddr || "Address not available");
    } catch {
      setBranchAddress("Address not available");
    }
  };

  useEffect(() => {
    loadBranchAddress();
  }, [branchId, branchName, branches, shop]);

  /* ================= SWITCH BRANCH ================= */
  const switchBranch = async id => {
    if (switching) return;
    const b = branches.find(x => x.branch_id === Number(id));
    if (!b) return;

    setSwitching(true);
    setSession({
      ...session,
      branch_id: b.branch_id,
      branch_name: b.branch_name
    });

    try {
      await api.post("/auth/set-branch", { branch_id: b.branch_id });
    } catch {}

    window.location.reload();
  };

  /* ================= SIDEBAR MENU ================= */
  const shopType = (shop?.shop_type || shop?.billing_type || "")
    .toString()
    .toLowerCase();

  const showTableBilling = shopType === "hotel";
  let menuItems = [];
  const isHeadOfficeClosed =
    Number(branchId) === 1 && String(session?.branch_close || "N").toUpperCase() === "Y";

  // ===== CASHIER (❌ Deleted Invoice NOT visible) =====
  if (roleLower === "cashier") {
    menuItems = [
      { name: "Home", path: "/home", icon: <FaHome /> },
      { name: "Dashboard", path: "/dashboard", icon: <FaChartPie /> },
      { name: "Trends", path: "/trends", icon: <FaChartLine /> },
      { name: "Sales Billing", path: "/sales/create", icon: <FaShoppingCart /> },
      ...(showTableBilling
        ? [{ name: "Table Billing", path: "/table-billing", icon: <MdTableRestaurant /> }]
        : [])
    ];
  }

  // ===== MANAGER (✅ Deleted Invoice visible) =====
  else if (roleLower === "manager") {
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
        ? [{ name: "Table Billing", path: "/table-billing", icon: <MdTableRestaurant /> }]
        : []),
      { name: "Reports", path: "/reports", icon: <FaFileInvoice /> },
      { name: "Deleted Invoice", path: "/deleted-invoices", icon: <FaFileInvoice /> },
      { name: "Inventory", path: "/inventory", icon: <FaBoxes /> },
      { name: "Reorder Alerts", path: "/reorder-alerts", icon: <FaBell /> }
    ];
  }

  // ===== ADMIN (✅ Deleted Invoice visible) =====
  else if (roleLower === "admin") {
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
        ? [{ name: "Table Billing", path: "/table-billing", icon: <MdTableRestaurant /> }]
        : []),
      { name: "Reports", path: "/reports", icon: <FaFileInvoice /> },
      { name: "Deleted Invoice", path: "/deleted-invoices", icon: <FaFileInvoice /> },
      { name: "Support Tickets", path: "/support-tickets", icon: <FaLifeRing /> },
      { name: "Admin", path: "/setup", icon: <FaTools /> }
    ];
  }

  if (isHeadOfficeClosed) {
    menuItems = [
      { name: "Home", path: "/home", icon: <FaHome /> },
      { name: "Reports", path: "/reports", icon: <FaFileInvoice /> },
      { name: "Analytics", path: "/analytics", icon: <FaChartBar /> },
      { name: "Admin", path: "/setup", icon: <FaTools /> }
    ];
  }

  return (
    <div className="flex h-screen bg-white">

      {/* ================= SIDEBAR ================= */}
      {!hideSidebar && !location.pathname.startsWith("/sales/create") && (
        <aside className="w-56 flex flex-col shadow-2xl" style={{ background: BLUE }}>
          <div className="pt-10 pb-4 px-6 text-white text-center">
            <p className="text-4xl font-extrabold">HAAPPII</p>
            <p className="text-4xl font-extrabold -mt-1">BILLING</p>
            <div className="w-16 h-[3px] bg-white mx-auto mt-3 rounded-full" />
          </div>

           <nav className="px-3 mt-2 space-y-1 text-white flex-1 min-h-0 overflow-y-auto pb-3">
             {menuItems.map(m => (
               <NavLink
                 key={m.path}
                 to={m.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl font-semibold
                  ${isActive ? "bg-white/25" : "hover:bg-white/10"}`
                }
              >
                <span className="text-lg">{m.icon}</span>
                <span>{m.name}</span>
              </NavLink>
            ))}
          </nav>

          <div className="px-6 py-3 text-xs text-white/90">
            <p>Version {APP_VERSION}</p>
            <p>Build {BUILD_CODE}</p>
          </div>
        </aside>
      )}

      {/* ================= RIGHT SIDE ================= */}
      <div className="flex-1 flex flex-col">

        {/* HEADER */}
        <header className="px-6 py-3 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img
              src={logoSrc}
              alt="Logo"
              className="w-10 h-10"
              onError={() => {
                if (logoSrc !== defaultLogo) setLogoSrc(defaultLogo);
              }}
            />
            <span className="text-3xl font-extrabold" style={{ color: BLUE }}>
              {shopName}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold text-gray-700">{userName}</div>
              <div className="text-xs text-gray-500 capitalize">{roleLower}</div>
            </div>

            {isAdmin && branches.length > 0 && (
              <select
                value={Number(branchId) || ""}
                onChange={e => switchBranch(Number(e.target.value))}
                className="border rounded px-2 py-1"
              >
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            )}

            <span className="border px-2 py-1 rounded">{appDateDisplay}</span>

            <button
              onClick={() => {
                clearSession();
                navigate("/");
              }}
              className="px-4 py-1 rounded text-white"
              style={{ backgroundColor: BLUE }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>

        {/* FOOTER */}
        <footer className="px-4 py-2 flex justify-between" style={{ background: BLUE, color: "white" }}>
          <div>
            <div className="font-bold">{branchName || "No Branch Selected"}</div>
            <div className="text-xs opacity-90">{branchAddress}</div>
          </div>

          <button
            onClick={() => setChatOpen(true)}
            className="bg-white px-2 py-1 rounded text-xs"
            style={{ color: BLUE }}
          >
            Support Chat
          </button>
        </footer>

        <SupportChat
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          session={session}
          shopName={shop?.shop_name || shopName}
          branchName={branchName}
          branchContact={shop?.mobile || ""}
        />
      </div>
    </div>
  );
}
