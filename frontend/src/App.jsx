// src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";

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
import About from "./pages/About";
import Login from "./pages/Login";
import SetupOnboard from "./pages/SetupOnboard";

const Home = lazy(() => import("./pages/Home"));
const Trends = lazy(() => import("./pages/Trends"));
const Analytics = lazy(() => import("./pages/Analytics"));
const DayClose = lazy(() => import("./pages/DayClose"));
const CreateBill = lazy(() => import("./pages/CreateBill"));
const SalesHistory = lazy(() => import("./pages/SalesHistory"));
const EditBill = lazy(() => import("./pages/EditBill"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Dues = lazy(() => import("./pages/Dues"));
const Returns = lazy(() => import("./pages/Returns"));
const StockTransfers = lazy(() => import("./pages/StockTransfers"));
const Drafts = lazy(() => import("./pages/Drafts"));
const Customers = lazy(() => import("./pages/Customers"));

const SupportTickets = lazy(() => import("./pages/SupportTickets"));
const Alerts = lazy(() => import("./pages/Alerts"));
const CashDrawer = lazy(() => import("./pages/CashDrawer"));
const Loyalty = lazy(() => import("./pages/Loyalty"));
const GiftCards = lazy(() => import("./pages/GiftCards"));
const Labels = lazy(() => import("./pages/Labels"));
const Coupons = lazy(() => import("./pages/Coupons"));
const SupplierLedger = lazy(() => import("./pages/SupplierLedger"));
const StockAudit = lazy(() => import("./pages/StockAudit"));
const ItemLots = lazy(() => import("./pages/ItemLots"));
const OfflineSync = lazy(() => import("./pages/OfflineSync"));
const Expenses = lazy(() => import("./pages/Expenses"));
const OnlineOrders = lazy(() => import("./pages/OnlineOrders"));
const Employees = lazy(() => import("./pages/Employees"));
const EmployeeAttendance = lazy(() => import("./pages/EmployeeAttendance"));

const TableGrid = lazy(() => import("./pages/TableGrid"));
const TableOrder = lazy(() => import("./pages/TableOrder"));
const QrOrders = lazy(() => import("./pages/QrOrders"));
const PublicQrMenu = lazy(() => import("./pages/PublicQrMenu"));
const PublicBranchMenu = lazy(() => import("./pages/PublicBranchMenu"));
const OrderLiveTracking = lazy(() => import("./pages/OrderLiveTracking"));

const KitchenDisplay = lazy(() => import("./pages/KitchenDisplay"));
const Reservations = lazy(() => import("./pages/Reservations"));
const RecipeManagement = lazy(() => import("./pages/RecipeManagement"));
const DeliveryManagement = lazy(() => import("./pages/DeliveryManagement"));

const Setup = lazy(() => import("./pages/Setup"));
const Categories = lazy(() => import("./pages/setup/Categories"));
const Items = lazy(() => import("./pages/setup/Items"));
const ShopDetails = lazy(() => import("./pages/setup/ShopDetails"));
const Users = lazy(() => import("./pages/setup/Users"));
const Branches = lazy(() => import("./pages/setup/Branches"));
const ManageTables = lazy(() => import("./pages/setup/ManageTables"));
const Suppliers = lazy(() => import("./pages/setup/Suppliers"));
const PurchaseOrders = lazy(() => import("./pages/setup/PurchaseOrders"));
const Permissions = lazy(() => import("./pages/setup/Permissions"));
const OnlineOrderSetup = lazy(() => import("./pages/setup/OnlineOrderSetup"));
const ExcelUpload = lazy(() => import("./pages/setup/ExcelUpload"));
const MailScheduler = lazy(() => import("./pages/setup/MailScheduler"));
const CashDenominationSetup = lazy(() => import("./pages/setup/CashDenominationSetup"));

const PlatformLogin = lazy(() => import("./pages/platform/PlatformLogin"));
const PlatformDashboard = lazy(() => import("./pages/platform/PlatformDashboard"));
const SupportDesk = lazy(() => import("./pages/platform/SupportDesk"));

const Reports = lazy(() => import("./pages/reports/Reports"));
const PublicReservation = lazy(() => import("./pages/PublicReservation"));
const PublicPayment = lazy(() => import("./pages/PublicPayment"));

const DeletedInvoices = lazy(() => import("./pages/DeletedInvoices"));
const PublicFeedback = lazy(() => import("./pages/PublicFeedback"));
const PublicInvoice = lazy(() => import("./pages/PublicInvoice"));
const FeedbackReview = lazy(() => import("./pages/FeedbackReview"));

const AdvanceOrders = lazy(() => import("./pages/AdvanceOrders"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
        <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#94a3b8",fontSize:"14px"}}>Loading...</div>}>
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
          <Route path="/menu/:slug/:token" element={<PublicBranchMenu />} />
          <Route path="/menu/:token" element={<PublicBranchMenu />} />
          <Route path="/book" element={<PublicReservation />} />
          <Route path="/pay" element={<PublicPayment />} />
          <Route path="/feedback" element={<PublicFeedback />} />
          <Route path="/invoice-view/:token" element={<PublicInvoice />} />

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
            <Route path="/advance-orders" element={<AdvanceOrders />} />
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

          {/* 404 — must be last */}
          <Route path="*" element={<NotFound />} />

        </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}
