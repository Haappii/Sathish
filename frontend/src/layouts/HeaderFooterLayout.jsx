// src/layouts/HeaderFooterLayout.jsx

import { Outlet } from "react-router-dom";
import MainLayout from "./MainLayout";

/**
 * Header + Footer ONLY
 * Sidebar is hidden automatically
 */
export default function HeaderFooterLayout() {
  return (
    <MainLayout hideSidebar>
      <Outlet />
    </MainLayout>
  );
}
