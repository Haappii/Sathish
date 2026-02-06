import { Outlet } from "react-router-dom";

export default function POSLayout() {
  return (
    <div className="w-screen h-screen bg-white overflow-hidden">
      {/* POS has NO sidebar, NO header */}
      <Outlet />
    </div>
  );
}
