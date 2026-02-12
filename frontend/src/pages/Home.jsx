import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../utils/apiClient";
import { getSession } from "../utils/auth";

import {
  buildRbacMenu,
  buildRoleMenu,
  modulesToPermMap,
} from "../utils/navigationMenu";

export default function Home() {
  const session = getSession() || {};
  const roleLower = (session?.role || "").toString().toLowerCase();
  const branchId = session?.branch_id ?? null;

  const [shopType, setShopType] = useState("");
  const [permMap, setPermMap] = useState(null);
  const [permsEnabled, setPermsEnabled] = useState(false);

  useEffect(() => {
    api.get("/shop/details")
      .then((r) => {
        const s = r?.data || {};
        setShopType(
          (s.shop_type || s.billing_type || "").toString().toLowerCase()
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/permissions/my")
      .then((r) => {
        setPermsEnabled(Boolean(r?.data?.enabled));
        setPermMap(modulesToPermMap(r?.data?.modules));
      })
      .catch(() => {
        setPermsEnabled(false);
        setPermMap(null);
      });
  }, []);

  const showTableBilling = shopType === "hotel";
  const isHeadOfficeClosed =
    Number(branchId) === 1 &&
    String(session?.branch_close || "N").toUpperCase() === "Y";

  const menus = useMemo(() => {
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

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-6 shadow-md">
        <h2 className="text-2xl font-bold">Welcome Back</h2>
        <p className="text-sm opacity-90 mt-1">
          Role: {session?.role || "User"}
        </p>
      </div>

      {/* Menu Grid */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {menus.map((m) => (
          <Link
            key={m.path}
            to={m.path}
            className="
              group
              bg-white
              rounded-2xl
              p-5
              shadow-sm
              border
              hover:shadow-xl
              hover:-translate-y-1
              transition-all
              duration-300
              flex flex-col
              justify-between
            "
          >
            {/* Icon */}
            <div className="w-14 h-14 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl group-hover:scale-110 transition">
              {m.icon}
            </div>

            {/* Text */}
            <div className="mt-4">
              <div className="text-base font-semibold text-gray-800">
                {m.name}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Navigate to {m.name}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
