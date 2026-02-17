import { matchPath } from "react-router-dom";

const DYNAMIC_RULES = [
  { pattern: "/setup/branches/:branchId/tables", target: "/setup/branches" },
  { pattern: "/sales/edit/:invoiceNumber", target: "/sales/history" },
  { pattern: "/table-order/:orderId", target: "/table-billing" },
];

export function getBackTarget(pathname) {
  const path = String(pathname || "");

  if (!path || path === "/" || path === "/home") return "/home";

  if (path === "/about") return "/";
  if (path === "/setup/onboard") return "/";

  if (path === "/setup" || path === "/reports") return "/home";

  if (path === "/employees/attendance") return "/employees";

  for (const rule of DYNAMIC_RULES) {
    if (matchPath({ path: rule.pattern, end: true }, path)) return rule.target;
  }

  if (path.startsWith("/setup/")) return "/setup";
  if (path.startsWith("/reports/")) return "/reports";

  return "/home";
}

