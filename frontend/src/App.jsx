// src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

/** Redirects to /home if the shop's billing_type doesn't match the required type. */
function ShopTypeGuard({ requireHotel, children }) {
  const billingType = (localStorage.getItem("billing_type") || "").toLowerCase();
  const isHotel = billingType === "hotel";
  if (requireHotel && !isHotel) return <Navigate to="/home" replace />;
  if (!requireHotel && isHotel) return <Navigate to="/home" replace />;
  return children;
}

function OrderLiveGuard({ children }) {
  const session = getSession() || {};
  const branchId = session?.branch_id ?? null;
  const [enabled, setEnabled] = useState(() => (branchId ? null : true));

  useEffect(() => {
    let mounted = true;
    if (!branchId) {
      setEnabled(true);
      return () => {
        mounted = false;
      };
    }

    api.get(`/branch/${branchId}`)
      .then((res) => {
        if (!mounted) return;
        setEnabled(res?.data?.order_live_tracking_enabled !== false);
      })
      .catch(() => {
        if (!mounted) return;
        setEnabled(true);
      });

    return () => {
      mounted = false;
    };
  }, [branchId]);

  if (enabled === null) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-gray-600">
        Loading order live tracking...
      </div>
    );
  }

  if (!enabled) return <Navigate to="/home" replace />;
  return children;
}

import MainLayout from "./layouts/MainLayout";

import Login from "./pages/Login";
import Home from "./pages/Home";
import Trends from "./pages/Trends";
import Analytics from "./pages/Analytics";
import DayClose from "./pages/DayClose";
import CreateBill from "./pages/CreateBill";
import SalesHistory from "./pages/SalesHistory";
import EditBill from "./pages/EditBill";
import Inventory from "./pages/Inventory";
import Dues from "./pages/Dues";
import Returns from "./pages/Returns";
import StockTransfers from "./pages/StockTransfers";
import Drafts from "./pages/Drafts";
import Customers from "./pages/Customers";

import SupportTickets from "./pages/SupportTickets";
import Alerts from "./pages/Alerts";
import CashDrawer from "./pages/CashDrawer";
import Loyalty from "./pages/Loyalty";
import GiftCards from "./pages/GiftCards";
import Labels from "./pages/Labels";
import Coupons from "./pages/Coupons";
import SupplierLedger from "./pages/SupplierLedger";
import StockAudit from "./pages/StockAudit";
import ItemLots from "./pages/ItemLots";
import OfflineSync from "./pages/OfflineSync";
import Expenses from "./pages/Expenses";
import OnlineOrders from "./pages/OnlineOrders";
import Employees from "./pages/Employees";
import EmployeeAttendance from "./pages/EmployeeAttendance";

import TableGrid from "./pages/TableGrid";
import TableOrder from "./pages/TableOrder";
import QrOrders from "./pages/QrOrders";
import PublicQrMenu from "./pages/PublicQrMenu";
import OrderLiveTracking from "./pages/OrderLiveTracking";

// ⭐ HOTEL FEATURES
import KitchenDisplay from "./pages/KitchenDisplay";
import Reservations from "./pages/Reservations";
import RecipeManagement from "./pages/RecipeManagement";
import DeliveryManagement from "./pages/DeliveryManagement";

import Setup from "./pages/Setup";
import Categories from "./pages/setup/Categories";
import Items from "./pages/setup/Items";
import ShopDetails from "./pages/setup/ShopDetails";
import Users from "./pages/setup/Users";
import Branches from "./pages/setup/Branches";
import ManageTables from "./pages/setup/ManageTables";
import Suppliers from "./pages/setup/Suppliers";
import PurchaseOrders from "./pages/setup/PurchaseOrders";
import Permissions from "./pages/setup/Permissions";
import OnlineOrderSetup from "./pages/setup/OnlineOrderSetup";
import ExcelUpload from "./pages/setup/ExcelUpload";
import MailScheduler from "./pages/setup/MailScheduler";
import CashDenominationSetup from "./pages/setup/CashDenominationSetup";
import SetupOnboard from "./pages/SetupOnboard";
import About from "./pages/About";

import PlatformLogin from "./pages/platform/PlatformLogin";
import PlatformDashboard from "./pages/platform/PlatformDashboard";
import SupportDesk from "./pages/platform/SupportDesk";

import Reports from "./pages/reports/Reports";
import PublicReservation from "./pages/PublicReservation";
import PublicPayment from "./pages/PublicPayment";

import DeletedInvoices from "./pages/DeletedInvoices"; // ✅ OUTSIDE REPORTS
import PublicFeedback from "./pages/PublicFeedback";
import FeedbackReview from "./pages/FeedbackReview";

import { ToastProvider } from "./components/Toast";
import api from "./utils/apiClient";
import { getSession, startActivityTracking } from "./utils/auth";
import { isDesktopApp } from "./utils/sharedLocalState";

export default function App() {
  useEffect(() => {
    startActivityTracking();
  }, []);

  const desktopApp = isDesktopApp();

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>

          {/* PUBLIC */}
          <Route
            path="/"
            element={desktopApp ? <Navigate to="/login" replace /> : <About />}
          />
          <Route
            path="/about"
            element={desktopApp ? <Navigate to="/login" replace /> : <Navigate to="/" replace />}
          />
          <Route path="/login" element={<Login />} />
          <Route path="/setup/onboard" element={<SetupOnboard />} />
          <Route path="/platform/login" element={<PlatformLogin />} />
          <Route path="/platform/dashboard" element={<PlatformDashboard />} />
          <Route path="/platform/support" element={<SupportDesk />} />
          <Route path="/qr/:token" element={<PublicQrMenu />} />
          <Route path="/book" element={<PublicReservation />} />
          <Route path="/pay" element={<PublicPayment />} />
          <Route path="/feedback" element={<PublicFeedback />} />

          {/* MAIN LAYOUT */}
          <Route element={<MainLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/dashboard" element={<Navigate to="/home" replace />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/day-close" element={<DayClose />} />

            {/* SALES */}
            <Route path="/sales/create" element={<CreateBill />} />
            <Route path="/sales/history" element={<SalesHistory />} />
            <Route path="/sales/edit/:invoiceNumber" element={<EditBill />} />

            {/* INVENTORY */}
            <Route path="/inventory" element={<Inventory />} />

            {/* OPERATIONS */}
            <Route path="/dues" element={<Dues />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/stock-transfers" element={<StockTransfers />} />
            <Route path="/drafts" element={<Drafts />} />
            <Route path="/customers" element={<Customers />} />

            <Route path="/support-tickets" element={<SupportTickets />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/cash-drawer" element={<CashDrawer />} />
            <Route path="/loyalty" element={<Loyalty />} />
            <Route path="/gift-cards" element={<GiftCards />} />
            <Route path="/labels" element={<Labels />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/supplier-ledger" element={<SupplierLedger />} />
            <Route path="/stock-audit" element={<StockAudit />} />
            <Route path="/item-lots" element={<ItemLots />} />
            <Route path="/offline-sync" element={<OfflineSync />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/online-orders" element={<OnlineOrders />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/employees/attendance" element={<EmployeeAttendance />} />
            <Route path="/feedback-review" element={<FeedbackReview />} />

            {/* DELETED INVOICES (🔥 NOT IN REPORTS) */}
            <Route
              path="/deleted-invoices"
              element={<DeletedInvoices />}
            />

            {/* REPORTS */}
            <Route path="/reports" element={<Reports />} />

            {/* SETUP */}
            <Route path="/setup" element={<Setup />} />
            <Route path="/setup/categories" element={<Categories />} />
            <Route path="/setup/shop" element={<ShopDetails />} />
            <Route path="/setup/users" element={<Users />} />
            <Route path="/setup/branches" element={<Branches />} />
            <Route path="/setup/suppliers" element={<Suppliers />} />
            <Route path="/setup/purchase-orders" element={<PurchaseOrders />} />
            <Route path="/setup/permissions" element={<Permissions />} />
            <Route path="/setup/excel-upload" element={<ExcelUpload />} />
            <Route path="/setup/mail-scheduler" element={<MailScheduler />} />
            <Route path="/setup/cash-denominations" element={<CashDenominationSetup />} />
            <Route path="/setup/online-orders" element={<OnlineOrderSetup />} />
            <Route
              path="/setup/branches/:branchId/tables"
              element={<ManageTables />}
            />

            {/* TABLE BILLING */}
            <Route path="/table-billing" element={<TableGrid />} />
            <Route path="/qr-orders" element={<QrOrders />} />
            <Route
              path="/order-live"
              element={
                <ShopTypeGuard requireHotel>
                  <OrderLiveGuard>
                    <OrderLiveTracking />
                  </OrderLiveGuard>
                </ShopTypeGuard>
              }
            />
            <Route
              path="/kot"
              element={
                <ShopTypeGuard requireHotel>
                  <OrderLiveGuard>
                    <KitchenDisplay />
                  </OrderLiveGuard>
                </ShopTypeGuard>
              }
            />

            {/* ⭐ HOTEL-ONLY FEATURES */}
            <Route path="/reservations" element={<Reservations />} />
            <Route path="/recipes" element={<ShopTypeGuard requireHotel><RecipeManagement /></ShopTypeGuard>} />
            <Route path="/delivery" element={<ShopTypeGuard requireHotel><DeliveryManagement /></ShopTypeGuard>} />
          </Route>

          {/* NO SIDEBAR LAYOUT */}
          <Route element={<MainLayout hideSidebar />}>
            <Route path="/setup/items" element={<Items />} />
            <Route path="/table-order/:orderId" element={<ShopTypeGuard requireHotel><TableOrder /></ShopTypeGuard>} />
            <Route
              path="/kitchen-display"
              element={
                <ShopTypeGuard requireHotel>
                  <OrderLiveGuard>
                    <KitchenDisplay />
                  </OrderLiveGuard>
                </ShopTypeGuard>
              }
            />
          </Route>

        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
