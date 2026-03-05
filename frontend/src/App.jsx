// src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";

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
import ReorderAlerts from "./pages/ReorderAlerts";
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
import SetupOnboard from "./pages/SetupOnboard";
import About from "./pages/About";

import PlatformLogin from "./pages/platform/PlatformLogin";
import PlatformDashboard from "./pages/platform/PlatformDashboard";
import SupportDesk from "./pages/platform/SupportDesk";

import Reports from "./pages/reports/Reports";

import DeletedInvoices from "./pages/DeletedInvoices"; // ✅ OUTSIDE REPORTS

import { ToastProvider } from "./components/Toast";
import { startActivityTracking } from "./utils/auth";

export default function App() {
  useEffect(() => {
    startActivityTracking();
  }, []);

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>

          {/* LOGIN */}
          <Route path="/" element={<Login />} />
          <Route path="/about" element={<About />} />
          <Route path="/setup/onboard" element={<SetupOnboard />} />
          <Route path="/platform/login" element={<PlatformLogin />} />
          <Route path="/platform/dashboard" element={<PlatformDashboard />} />
          <Route path="/platform/support" element={<SupportDesk />} />
          <Route path="/qr/:token" element={<PublicQrMenu />} />

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
            <Route path="/reorder-alerts" element={<ReorderAlerts />} />
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
            <Route
              path="/setup/branches/:branchId/tables"
              element={<ManageTables />}
            />

            {/* TABLE BILLING */}
            <Route path="/table-billing" element={<TableGrid />} />
            <Route path="/qr-orders" element={<QrOrders />} />
          </Route>

          {/* NO SIDEBAR LAYOUT */}
          <Route element={<MainLayout hideSidebar />}>
            <Route path="/setup/items" element={<Items />} />
            <Route path="/table-order/:orderId" element={<TableOrder />} />
          </Route>

        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
