// src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";

import MainLayout from "./layouts/MainLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Trends from "./pages/Trends";
import DayClose from "./pages/DayClose";
import CreateBill from "./pages/CreateBill";
import SalesHistory from "./pages/SalesHistory";
import EditBill from "./pages/EditBill";
import Inventory from "./pages/Inventory";

import TableGrid from "./pages/TableGrid";
import TableOrder from "./pages/TableOrder";

import Setup from "./pages/Setup";
import Categories from "./pages/setup/Categories";
import Items from "./pages/setup/Items";
import ShopDetails from "./pages/setup/ShopDetails";
import Users from "./pages/setup/Users";
import Branches from "./pages/setup/Branches";
import ManageTables from "./pages/setup/ManageTables";
import Suppliers from "./pages/setup/Suppliers";
import PurchaseOrders from "./pages/setup/PurchaseOrders";
import SetupOnboard from "./pages/SetupOnboard";
import About from "./pages/About";

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

          {/* MAIN LAYOUT */}
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/day-close" element={<DayClose />} />
            <Route path="/home" element={<Navigate to="/dashboard" replace />} />

            {/* SALES */}
            <Route path="/sales/create" element={<CreateBill />} />
            <Route path="/sales/history" element={<SalesHistory />} />
            <Route path="/sales/edit/:invoiceNumber" element={<EditBill />} />

            {/* INVENTORY */}
            <Route path="/inventory" element={<Inventory />} />

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
            <Route
              path="/setup/branches/:branchId/tables"
              element={<ManageTables />}
            />

            {/* TABLE BILLING */}
            <Route path="/table-billing" element={<TableGrid />} />
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
