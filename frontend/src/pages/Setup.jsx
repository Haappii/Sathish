import { Link, useNavigate } from "react-router-dom";
import {
  FaList,
  FaStore,
  FaUsersCog,
  FaSitemap,
  FaBoxes,
  FaCalendarAlt,
  FaTruck,
  FaClipboardList
} from "react-icons/fa";
import { getSession } from "../utils/auth";

export default function Setup() {
  const navigate = useNavigate();
  const session = getSession();
  const isHeadOffice =
    (session?.branch_type || "").toLowerCase().includes("head") ||
    (session?.branch_name || "").toLowerCase().includes("head") ||
    Number(session?.branch_id) === 1;

  // 🚫 Not Admin → kick out
  if (session?.role !== "Admin") {
    return (
      <div className="mt-10 text-center text-sm font-medium text-red-600">
        You are not authorized to access this page
      </div>
    );
  }

  const menus = [
    {
      title: "Category Management",
      link: "/setup/categories",
      desc: "Add / Edit / Delete categories",
      icon: FaSitemap,
      color: "text-blue-600"
    },
    {
      title: "Item Management",
      link: "/setup/items",
      desc: "Manage items under categories",
      icon: FaList,
      color: "text-emerald-600"
    },
    {
      title: "Shop Details",
      link: "/setup/shop",
      desc: "Business profile & GST info",
      icon: FaStore,
      color: "text-amber-600"
    },
    {
      title: "User Management",
      link: "/setup/users",
      desc: "Create & manage users",
      icon: FaUsersCog,
      color: "text-teal-600"
    },
    {
      title: "Branch Management",
      link: "/setup/branches",
      desc: "Manage branches",
      icon: FaStore,
      color: "text-rose-600"
    },
    {
      title: "Inventory",
      link: "/inventory",
      desc: "Stock & adjustments",
      icon: FaBoxes,
      color: "text-indigo-600"
    },
    {
      title: "Suppliers",
      link: "/setup/suppliers",
      desc: "Manage supplier profiles",
      icon: FaTruck,
      color: "text-sky-600"
    },
    {
      title: "Purchase Orders",
      link: "/setup/purchase-orders",
      desc: "Create and receive POs",
      icon: FaClipboardList,
      color: "text-purple-600"
    },
    {
      title: "Day Close",
      link: "/day-close",
      desc: "Daily closing process",
      icon: FaCalendarAlt,
      color: "text-emerald-700"
    }
  ];

  const visibleMenus = isHeadOffice
    ? menus
    : menus.filter(m => m.link === "/inventory" || m.link === "/day-close");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="px-3 py-1.5 rounded-lg border bg-white text-[12px] hover:bg-gray-100"
        >
          ← Back
        </button>

        <h2 className="text-lg font-semibold text-gray-700">
          Admin & Configuration
        </h2>
      </div>

      {/* Menu cards (content-sized, no stretch) */}
      <div className="flex flex-wrap gap-3">
        {visibleMenus.map((m, i) => {
          const Icon = m.icon;
          return (
            <Link
              key={i}
              to={m.link}
              className="
                w-full
                sm:w-[calc(50%-0.75rem)]
                lg:w-[calc(33.333%-0.75rem)]
                flex items-center gap-3
                rounded-lg border bg-white
                px-3 py-2
                hover:bg-gray-50 hover:shadow-sm
                transition
              "
            >
              <div
                className={`h-8 w-8 flex items-center justify-center
                            rounded-md bg-gray-100 ${m.color}`}
              >
                <Icon className="text-sm" />
              </div>

              <div className="leading-tight">
                <div className="text-sm font-semibold text-gray-800">
                  {m.title}
                </div>
                <div className="text-xs text-gray-500">
                  {m.desc}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
