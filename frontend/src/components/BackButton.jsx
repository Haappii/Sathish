import { useLocation, useNavigate } from "react-router-dom";

import { getBackTarget } from "../utils/backNavigation";

export default function BackButton({
  to,
  label = "← Back",
  className = "",
  replace = true,
  ...rest
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const target = to || getBackTarget(location?.pathname);
  const btnClass =
    className ||
    "px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px] hover:bg-gray-50";

  return (
    <button
      type="button"
      onClick={() => navigate(target, { replace })}
      className={btnClass}
      aria-label="Back"
      {...rest}
    >
      {label}
    </button>
  );
}

