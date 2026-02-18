// src/layouts/MainLayout.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation, NavLink } from "react-router-dom";
import api from "../utils/apiClient";

import {
  getSession,
  setSession as persistSession,
  clearSession,
  isSessionExpired,
  refreshSessionActivity
} from "../utils/auth";

import defaultLogo from "../assets/logo.png";
import SupportChat from "../components/SupportChat";
import { getShopLogoUrl } from "../utils/shopLogo";

import { FaBars, FaExclamationTriangle, FaThumbtack } from "react-icons/fa";
import { MdTableRestaurant } from "react-icons/md";
import {
  buildRbacMenu,
  buildRoleMenu,
  modulesToPermMap,
} from "../utils/navigationMenu";

const BLUE = "#0B3C8C";
const APP_VERSION = "1.0.0";
const BUILD_CODE = "2026.02.04";

export default function MainLayout({ hideSidebar = false }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [session, setSessionState] = useState(() => getSession() || {});

  const setSessionAndRerender = (updater) => {
    const current = getSession() || {};
    const next = typeof updater === "function" ? updater(current) : updater;
    persistSession(next);
    setSessionState(next);
    return next;
  };

  /* ================= USER INFO ================= */
  const userName =
    session?.username ||
    session?.user_name ||
    session?.name ||
    "User";

  const roleLower = (session?.role || "").toString().toLowerCase();
  const isActualAdmin = roleLower === "admin";

  /* ================= STATE ================= */
  const [shopName, setShopName] = useState("Haappii Billing");
  const [shop, setShop] = useState({});
  const [branches, setBranches] = useState([]);
  const [branchAddress, setBranchAddress] = useState("Loading...");
  const [switching, setSwitching] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState(defaultLogo);
  const [permMap, setPermMap] = useState(null);
  const [permsEnabled, setPermsEnabled] = useState(false);

  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [lowStockOpen, setLowStockOpen] = useState(false);
  const [lowStockLoading, setLowStockLoading] = useState(false);
  const [lowStockItems, setLowStockItems] = useState([]);
  const lowStockBtnRef = useRef(null);
  const lowStockPopupRef = useRef(null);

  const [qrPendingCount, setQrPendingCount] = useState(0);

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

  /* ================= PERMISSIONS (RBAC) ================= */
  useEffect(() => {
    api.get("/permissions/my")
      .then(res => {
        setPermsEnabled(Boolean(res?.data?.enabled));
        setPermMap(modulesToPermMap(res?.data?.modules));
      })
      .catch(() => {
        setPermsEnabled(false);
        setPermMap(null);
      });
  }, []);

  useEffect(() => {
    const url = getShopLogoUrl(shop);
    setLogoSrc(url || defaultLogo);
  }, [shop?.shop_id, shop?.shop_name, shop?.logo_url]);

  /* ================= BRANCH LIST (ADMIN) ================= */
  useEffect(() => {
    if (!isActualAdmin) return;
    api.get("/branch/list")
      .then(res => setBranches(res.data || []))
      .catch(() => {});
  }, [isActualAdmin]);

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

  const loadLowStock = async () => {
    if (!shop?.inventory_enabled || !branchId) {
      setLowStockItems([]);
      return;
    }

    setLowStockLoading(true);
    try {
      const res = await api.get("/inventory/list", {
        params: { branch_id: branchId },
      });
      const rows = Array.isArray(res?.data) ? res.data : [];
      const lows = rows
        .filter((r) => Number(r.quantity || 0) <= Number(r.min_stock || 0))
        .sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0));
      setLowStockItems(lows);
    } catch {
      setLowStockItems([]);
    } finally {
      setLowStockLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLowStock();
  }, [shop?.inventory_enabled, branchId]);

  useEffect(() => {
    if (!lowStockOpen) return;

    const onDocClick = (e) => {
      const t = e.target;
      const btn = lowStockBtnRef.current;
      const pop = lowStockPopupRef.current;
      if (btn && btn.contains(t)) return;
      if (pop && pop.contains(t)) return;
      setLowStockOpen(false);
    };

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [lowStockOpen]);

  /* ================= SWITCH BRANCH ================= */
  const switchBranch = async id => {
    if (switching) return;
    const b = branches.find(x => x.branch_id === Number(id));
    if (!b) return;

    setSwitching(true);
    const prev = getSession() || {};
    setSessionAndRerender((cur) => ({
      ...cur,
      branch_id: b.branch_id,
      branch_name: b.branch_name,
    }));

    try {
      await api.post("/auth/set-branch", { branch_id: b.branch_id });

      // Full refresh so every screen re-reads the new branch context.
      window.location.replace("/home");
      return;
    } catch (e) {
      console.error("Failed to switch branch", e);

      // Revert local selection if backend rejects the switch.
      setSessionAndRerender((cur) => ({
        ...cur,
        branch_id: prev?.branch_id ?? cur?.branch_id ?? null,
        branch_name: prev?.branch_name ?? cur?.branch_name ?? null,
      }));
      alert("Failed to switch branch. Please try again.");
    } finally {
      setSwitching(false);
    }
  };

  /* ================= SIDEBAR MENU ================= */
  const sidebarEnabled =
    !hideSidebar && !location.pathname.startsWith("/sales/create");

  const shopType = (shop?.shop_type || shop?.billing_type || "")
    .toString()
    .toLowerCase();

  const showTableBilling = shopType === "hotel";
  const isHeadOfficeClosed =
    Number(branchId) === 1 && String(session?.branch_close || "N").toUpperCase() === "Y";

  const canQrOrders = useMemo(() => {
    if (!showTableBilling) return false;
    if (!permsEnabled || !permMap) {
      return ["admin", "manager", "cashier", "waiter"].includes(roleLower);
    }
    return Boolean(permMap?.qr_orders?.can_read);
  }, [showTableBilling, permsEnabled, permMap, roleLower]);

  const menuItems = useMemo(() => {
    const fallback = buildRoleMenu({
      roleLower,
      showTableBilling,
      isHeadOfficeClosed,
    });

    if (!permsEnabled || !permMap) return fallback;

    const rbac = buildRbacMenu({
      permMap,
      showTableBilling,
      isHeadOfficeClosed,
    });
    return rbac && rbac.length ? rbac : fallback;
  }, [permsEnabled, permMap, roleLower, showTableBilling, isHeadOfficeClosed]);

  const loadQrPending = async () => {
    if (!canQrOrders) {
      setQrPendingCount(0);
      return;
    }
    try {
      const res = await api.get("/qr-orders/pending");
      const list = Array.isArray(res?.data) ? res.data : [];
      setQrPendingCount(list.length);
    } catch {
      setQrPendingCount(0);
    }
  };

  useEffect(() => {
    loadQrPending();
    if (!canQrOrders) return;
    const t = setInterval(loadQrPending, 8000);
    return () => clearInterval(t);
  }, [canQrOrders, branchId]);

  useEffect(() => {
    if (!sidebarEnabled) {
      setSidebarPinned(false);
      setSidebarOpen(false);
    }
  }, [sidebarEnabled]);

  const sidebarVisible = sidebarEnabled && (sidebarOpen || sidebarPinned);
  const openSidebar = () => sidebarEnabled && setSidebarOpen(true);
  const closeSidebar = () => {
    if (!sidebarPinned) setSidebarOpen(false);
  };
  const togglePin = () => {
    if (!sidebarEnabled) return;
    setSidebarPinned(prev => {
      const next = !prev;
      setSidebarOpen(next);
      return next;
    });
  };

  return (
    <div className="h-screen bg-white relative">

      {/* ================= SIDEBAR ================= */}
      {sidebarEnabled && (
        <>
          {/* Hover/click handle */}
          <div
            className="fixed inset-y-0 left-0 w-3 z-40 cursor-pointer bg-gradient-to-r from-black/10 to-transparent"
            onMouseEnter={openSidebar}
            onClick={togglePin}
            title="Menu"
          />

          {/* Mobile backdrop (tap to close) */}
          {sidebarVisible && !sidebarPinned && (
            <div
              className="fixed inset-0 bg-black/30 z-30 sm:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <aside
            className={`fixed inset-y-0 left-0 w-56 flex flex-col shadow-2xl z-50 transform transition-transform duration-200 ${
              sidebarVisible ? "translate-x-0" : "-translate-x-full"
            }`}
            style={{ background: BLUE }}
            onMouseEnter={openSidebar}
            onMouseLeave={closeSidebar}
          >
            <div className="pt-10 pb-4 px-6 text-white text-center relative">
              <button
                onClick={togglePin}
                className={`absolute top-3 right-3 p-2 rounded hover:bg-white/10 ${
                  sidebarPinned ? "bg-white/15" : ""
                }`}
                title={sidebarPinned ? "Unpin menu" : "Pin menu"}
                type="button"
              >
                <FaThumbtack
                  className={`text-white ${sidebarPinned ? "rotate-45" : ""}`}
                />
              </button>

              <p className="text-4xl font-extrabold">HAAPPII</p>
              <p className="text-4xl font-extrabold -mt-1">BILLING</p>
              <div className="w-16 h-[3px] bg-white mx-auto mt-3 rounded-full" />
            </div>

            <nav className="px-3 mt-2 space-y-1 text-white flex-1 min-h-0 overflow-y-auto pb-3">
              {menuItems.map(m => (
                <NavLink
                  key={m.path}
                  to={m.path}
                  onClick={() => {
                    if (!sidebarPinned) setSidebarOpen(false);
                  }}
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
        </>
      )}

      {/* ================= RIGHT SIDE ================= */}
      <div
        className={`h-screen flex flex-col transition-[padding] duration-200 ${
          sidebarEnabled && sidebarPinned ? "pl-56" : ""
        }`}
      >

        {/* HEADER */}
        <header className="px-3 sm:px-6 py-2 sm:py-3 border-b flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3 flex-1">
            {sidebarEnabled && (
              <button
                onClick={togglePin}
                className="border rounded px-2 py-2 hover:bg-gray-50"
                title={sidebarPinned ? "Hide menu" : "Show menu"}
                type="button"
              >
                <FaBars />
              </button>
            )}
            <img
              src={logoSrc}
              alt="Logo"
              className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0"
              onError={() => {
                if (logoSrc !== defaultLogo) setLogoSrc(defaultLogo);
              }}
            />
            <span
              className="text-lg sm:text-2xl lg:text-3xl font-extrabold truncate"
              style={{ color: BLUE }}
            >
              {shopName}
            </span>
          </div>

          <div className="w-full sm:w-auto flex items-center justify-end gap-2 sm:gap-4 flex-wrap">
              <div className="text-right leading-tight min-w-[64px]">
                <div className="text-xs sm:text-sm font-semibold text-gray-700">{userName}</div>
                <div className="text-xs text-gray-500 capitalize">{roleLower}</div>
              </div>

              {isActualAdmin && branches.length > 0 && (
                <select
                  value={Number(branchId) || ""}
                  onChange={e => switchBranch(Number(e.target.value))}
                  className="border rounded px-2 py-1 text-sm max-w-[150px]"
              >
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            )}

            <span className="border px-2 py-1 rounded text-xs sm:text-sm whitespace-nowrap">
              {appDateDisplay}
            </span>

            {shop?.inventory_enabled && (
              <div className="relative">
                <button
                  ref={lowStockBtnRef}
                  type="button"
                  onClick={async () => {
                    const next = !lowStockOpen;
                    setLowStockOpen(next);
                    if (next) await loadLowStock();
                  }}
                  className="relative border rounded px-2 py-1 text-xs sm:text-sm hover:bg-gray-50 flex items-center gap-2"
                  title="Low stock alerts"
                >
                  <FaExclamationTriangle className="text-amber-600" />
                  <span className="hidden sm:inline">Low Stock</span>
                  {lowStockItems.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-rose-600 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                      {lowStockItems.length}
                    </span>
                  )}
                </button>

                {lowStockOpen && (
                  <div
                    ref={lowStockPopupRef}
                    className="absolute right-0 mt-2 w-[320px] max-w-[calc(100vw-24px)] bg-white border rounded-xl shadow-lg z-50 overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b flex items-center justify-between">
                      <div className="text-[12px] font-semibold text-slate-800">
                        Low Stock Items
                      </div>
                      <button
                        type="button"
                        onClick={() => setLowStockOpen(false)}
                        className="text-[12px] text-slate-500 hover:text-slate-800"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="max-h-[280px] overflow-auto">
                      {lowStockLoading ? (
                        <div className="p-3 text-[12px] text-slate-500">Loading...</div>
                      ) : lowStockItems.length === 0 ? (
                        <div className="p-3 text-[12px] text-slate-500">No low stock items</div>
                      ) : (
                        <div className="divide-y">
                          {lowStockItems.slice(0, 10).map((r) => (
                            <div key={r.item_id} className="px-3 py-2 text-[12px]">
                              <div className="font-semibold text-slate-800 truncate">
                                {r.item_name}
                              </div>
                              <div className="text-[11px] text-slate-500 flex justify-between">
                                <span>Qty: {Number(r.quantity || 0)}</span>
                                <span>Min: {Number(r.min_stock || 0)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="px-3 py-2 border-t flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLowStockOpen(false);
                          navigate("/reorder-alerts");
                        }}
                        className="px-3 py-1.5 rounded-lg border text-[12px] hover:bg-gray-50"
                      >
                        Open Alerts
                      </button>
                      <button
                        type="button"
                        onClick={async () => await loadLowStock()}
                        className="px-3 py-1.5 rounded-lg border text-[12px] hover:bg-gray-50"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {canQrOrders && (
              <button
                type="button"
                onClick={() => navigate("/qr-orders")}
                className="relative border rounded px-2 py-1 text-xs sm:text-sm hover:bg-gray-50 flex items-center gap-2"
                title="QR table orders"
              >
                <MdTableRestaurant className="text-slate-700" />
                <span className="hidden sm:inline">QR Orders</span>
                {qrPendingCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-rose-600 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                    {qrPendingCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => {
                clearSession();
                navigate("/");
              }}
              className="px-3 sm:px-4 py-1 rounded text-sm text-white whitespace-nowrap"
              style={{ backgroundColor: BLUE }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <main className="flex-1 overflow-auto p-3 sm:p-8">
          <Outlet />
        </main>

        {/* FOOTER */}
        <footer
          className="px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          style={{ background: BLUE, color: "white" }}
        >
          <div>
            <div className="font-bold">{branchName || "No Branch Selected"}</div>
            <div className="text-xs opacity-90">{branchAddress}</div>
          </div>

          <button
            onClick={() => setChatOpen(true)}
            className="bg-white px-3 py-1 rounded text-xs self-start sm:self-auto"
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
