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
import { useToast } from "../components/Toast";

import defaultLogo from "../assets/logo.png";
import SupportChat from "../components/SupportChat";
import { getShopLogoUrl } from "../utils/shopLogo";
import {
  hasPendingOfflineBills,
  syncOfflineBills,
} from "../utils/offlineBills";

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
  const { showToast } = useToast();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [offlineSyncing, setOfflineSyncing] = useState(false);

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

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const attemptSync = async () => {
      if (!navigator.onLine) return;
      if (!hasPendingOfflineBills()) return;
      setOfflineSyncing(true);
      showToast("Syncing offline bills...", "info");
      const res = await syncOfflineBills({ showToast });
      if (res.synced > 0) showToast(`Synced ${res.synced} offline bills`, "success");
      if (res.failed > 0) showToast(`${res.failed} offline bills failed to sync`, "error");
      setOfflineSyncing(false);
    };

    attemptSync();
    window.addEventListener("online", attemptSync);
    return () => window.removeEventListener("online", attemptSync);
  }, [showToast]);

  /* ================= SHOP DETAILS ================= */
  useEffect(() => {
    api.get("/shop/details")
      .then(res => {
        const data = res.data || {};
        if (data.shop_name) setShopName(data.shop_name);
        localStorage.setItem("billing_type", (data.billing_type || "shop").toLowerCase());
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

  const isCreateBill = location.pathname.startsWith("/sales/create");

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
            className="fixed inset-y-0 left-0 w-3 z-40 cursor-pointer"
            onMouseEnter={openSidebar}
            onClick={togglePin}
          />

          {/* Mobile backdrop */}
          {sidebarVisible && !sidebarPinned && (
            <div
              className="fixed inset-0 bg-black/40 z-30 sm:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <aside
            className={`fixed inset-y-0 left-0 w-60 flex flex-col z-50 transform transition-transform duration-200 ${
              sidebarVisible ? "translate-x-0" : "-translate-x-full"
            }`}
            style={{ background: "linear-gradient(180deg, #0B3C8C 0%, #071f4f 100%)" }}
            onMouseEnter={openSidebar}
            onMouseLeave={closeSidebar}
          >
            {/* Sidebar brand */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-black text-sm">H</div>
                <div>
                  <p className="text-white font-bold text-sm leading-tight">HAAPPII</p>
                  <p className="text-white/50 text-[10px] leading-tight">BILLING</p>
                </div>
              </div>
              <button
                onClick={togglePin}
                className={`p-1.5 rounded-lg transition ${sidebarPinned ? "bg-white/20 text-white" : "text-white/50 hover:bg-white/10 hover:text-white"}`}
                title={sidebarPinned ? "Unpin menu" : "Pin menu"}
                type="button"
              >
                <FaThumbtack className={`text-[11px] ${sidebarPinned ? "rotate-45" : ""}`} />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 min-h-0" style={{ scrollbarWidth: "none" }}>
              {menuItems.map(m => (
                <NavLink
                  key={m.path}
                  to={m.path}
                  onClick={() => { if (!sidebarPinned) setSidebarOpen(false); }}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                      isActive
                        ? "bg-white text-[#0B3C8C] shadow-sm"
                        : "text-white/75 hover:bg-white/10 hover:text-white"
                    }`
                  }
                >
                  <span className="text-base w-5 flex-shrink-0 text-center">{m.icon}</span>
                  <span className="truncate">{m.name}</span>
                </NavLink>
              ))}
            </nav>

            {/* Sidebar footer */}
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
              <div className="text-[10px] text-white/40">
                <p>v{APP_VERSION} · {BUILD_CODE}</p>
              </div>
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
        <header className="bg-white border-b px-3 sm:px-5 py-2 flex items-center justify-between gap-3">
          {/* Left: hamburger + logo + shop name */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {sidebarEnabled && (
              <button
                onClick={togglePin}
                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition flex-shrink-0"
                title={sidebarPinned ? "Hide menu" : "Show menu"}
                type="button"
              >
                <FaBars className="text-[13px]" />
              </button>
            )}
            <img
              src={logoSrc}
              alt="Logo"
              className="w-8 h-8 rounded-lg flex-shrink-0 object-cover"
              onError={() => { if (logoSrc !== defaultLogo) setLogoSrc(defaultLogo); }}
            />
            <span className="text-base sm:text-lg font-extrabold truncate" style={{ color: BLUE }}>
              {shopName}
            </span>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* User pill */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ backgroundColor: BLUE }}>
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="text-[11px] font-semibold text-gray-700">{userName}</div>
                <div className="text-[9px] text-gray-400 capitalize">{roleLower}</div>
              </div>
            </div>

            {/* Branch switcher */}
            {isActualAdmin && branches.length > 0 && (
              <select
                value={Number(branchId) || ""}
                onChange={e => switchBranch(Number(e.target.value))}
                className="border border-gray-200 rounded-xl px-2 py-1.5 text-[11px] bg-gray-50 max-w-[130px] focus:outline-none"
              >
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
                ))}
              </select>
            )}

            {/* Online/Offline */}
            <span className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border ${
              online
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: online ? "#059669" : "#d97706" }} />
              {online ? "Online" : "Offline"}
            </span>

            {offlineSyncing && (
              <span className="hidden sm:inline px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                Syncing…
              </span>
            )}

            {/* Date */}
            <span className="hidden md:inline px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-100 whitespace-nowrap">
              {appDateDisplay}
            </span>

            {/* Low Stock */}
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
                  className="relative w-8 h-8 rounded-xl border border-amber-200 bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100 transition"
                  title="Low stock alerts"
                >
                  <FaExclamationTriangle className="text-[12px]" />
                  {lowStockItems.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {lowStockItems.length}
                    </span>
                  )}
                </button>

                {lowStockOpen && (
                  <div
                    ref={lowStockPopupRef}
                    className="absolute right-0 mt-2 w-[300px] max-w-[calc(100vw-24px)] bg-white border rounded-2xl shadow-xl z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                      <div className="text-[12px] font-bold text-gray-800">Low Stock Items</div>
                      <button type="button" onClick={() => setLowStockOpen(false)} className="text-gray-400 hover:text-gray-700 text-[12px]">✕</button>
                    </div>
                    <div className="max-h-[260px] overflow-auto divide-y">
                      {lowStockLoading ? (
                        <div className="p-4 text-[12px] text-gray-400">Loading...</div>
                      ) : lowStockItems.length === 0 ? (
                        <div className="p-4 text-[12px] text-gray-400">No low stock items</div>
                      ) : (
                        lowStockItems.slice(0, 10).map((r) => (
                          <div key={r.item_id} className="px-4 py-2.5 text-[12px]">
                            <div className="font-semibold text-gray-800 truncate">{r.item_name}</div>
                            <div className="text-[11px] text-gray-400 flex justify-between mt-0.5">
                              <span>Qty: {Number(r.quantity || 0)}</span>
                              <span>Min: {Number(r.min_stock || 0)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="px-4 py-2.5 border-t flex items-center justify-between gap-2">
                      <button type="button" onClick={() => { setLowStockOpen(false); navigate("/reorder-alerts"); }}
                        className="px-3 py-1.5 rounded-xl border text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition">
                        View All
                      </button>
                      <button type="button" onClick={async () => await loadLowStock()}
                        className="px-3 py-1.5 rounded-xl border text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition">
                        ↻ Refresh
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* QR Orders */}
            {canQrOrders && (
              <button
                type="button"
                onClick={() => navigate("/qr-orders")}
                className="relative w-8 h-8 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 flex items-center justify-center hover:bg-gray-100 transition"
                title="QR table orders"
              >
                <MdTableRestaurant className="text-[14px]" />
                {qrPendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {qrPendingCount}
                  </span>
                )}
              </button>
            )}

            {/* Logout */}
            <button
              onClick={() => { clearSession(); navigate("/"); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: BLUE }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <main className={`flex-1 min-h-0 ${isCreateBill ? "overflow-hidden flex flex-col" : "overflow-auto"}`} style={{ paddingLeft: "1cm", paddingRight: "1cm" }}>
          <Outlet />
        </main>

        {/* FOOTER */}
        <footer className="bg-white border-t px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: BLUE }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1.447.894L10 14.118l-4.553 2.776A1 1 0 014 16V4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-gray-800 leading-tight truncate">{branchName || "No Branch Selected"}</p>
              {branchAddress && <p className="text-[10px] text-gray-400 leading-tight truncate">{branchAddress}</p>}
            </div>
          </div>

          <button
            onClick={() => setChatOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition hover:bg-gray-50 flex-shrink-0"
            style={{ color: BLUE, borderColor: "#d1d5db" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
            Support
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
