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
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex flex-wrap gap-4">
        {menus.map((m) => (
          <Link
            key={m.path}
            to={m.path}
            className="
              inline-flex
              items-center
              gap-3
              h-12
              px-5
              rounded-lg
              bg-white
              border border-gray-200
              text-gray-700
              text-sm
              font-medium
              shadow-sm
              hover:bg-gray-100
              hover:border-gray-300
              transition
              whitespace-nowrap
            "
          >
            {/* Icon */}
            <span className="text-lg text-gray-600">
              {m.icon}
            </span>

            {/* Name */}
            <span>{m.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
