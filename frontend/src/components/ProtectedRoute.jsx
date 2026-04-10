import { Navigate } from "react-router-dom";
import {
  getSession,
  isSessionExpired,
  refreshSessionActivity,
  clearSession,
} from "../utils/auth";

export default function ProtectedRoute({ children }) {
  const session = getSession();

  // Not logged in → go to login
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Expired → force logout
  if (isSessionExpired()) {
    clearSession();
    return <Navigate to="/login" replace />;
  }

  // Keep session alive
  refreshSessionActivity();

  return children;
}
