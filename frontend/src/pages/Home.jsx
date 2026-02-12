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
    <div className="p-4">
      <div className="flex flex-wrap gap-4">
        {menus.map((m) => (
          <Link
            key={m.path}
            to={m.path}
            className="
              group
              inline-flex
              items-center
              gap-3
              h-14
              px-6
              rounded-xl
              bg-white
              border border-gray-200
              shadow-sm
              hover:shadow-lg
              hover:border-purple-400
              transition-all
              duration-300
              relative
              overflow-hidden
            "
          >
            {/* Fancy SaaS Glow Effect */}
            <span className="
              absolute inset-0 
              bg-gradient-to-r 
              from-green-100 
              via-purple-100 
              to-green-100 
              opacity-0 
              group-hover:opacity-100 
              transition-opacity 
              duration-300
            " />

            {/* Content */}
            <div className="relative flex items-center gap-3 z-10">
              {/* Icon */}
              <div className="
                text-xl 
                text-green-600 
                group-hover:text-purple-600 
                transition-colors
              ">
                {m.icon}
              </div>

              {/* Name */}
              <div className="
                text-sm 
                font-semibold 
                text-gray-800 
                whitespace-nowrap
              ">
                {m.name}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
