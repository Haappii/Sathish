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

  useEffect(() => {
    api.get("/shop/details")
      .then((r) => {
        const s = r?.data || {};
        setShopType((s.shop_type || s.billing_type || "").toString().toLowerCase());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/permissions/my")
      .then((r) => setPermMap(modulesToPermMap(r?.data?.modules)))
      .catch(() => setPermMap(null));
  }, []);

  const showTableBilling = shopType === "hotel";
  const isHeadOfficeClosed =
    Number(branchId) === 1 && String(session?.branch_close || "N").toUpperCase() === "Y";

  const menus = useMemo(() => {
    const fallback = buildRoleMenu({ roleLower, showTableBilling, isHeadOfficeClosed });
    if (!permMap) return fallback;

    const rbac = buildRbacMenu({ permMap, showTableBilling, isHeadOfficeClosed });
    return rbac && rbac.length ? rbac : fallback;
  }, [permMap, roleLower, showTableBilling, isHeadOfficeClosed]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-gray-700">Home</h2>
      </div>

      <div className="flex flex-wrap gap-3">
        {menus.map((m) => (
          <Link
            key={m.path}
            to={m.path}
            className="
              w-full
              sm:w-[calc(50%-0.75rem)]
              lg:w-[calc(33.333%-0.75rem)]
              flex items-center gap-3
              rounded-lg border bg-white
              px-3 py-3
              hover:bg-gray-50 hover:shadow-sm
              transition
            "
          >
            <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-lg">
              {m.icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">
                {m.name}
              </div>
              <div className="text-xs text-gray-500 truncate">{m.path}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
