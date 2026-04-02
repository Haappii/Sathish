/**
 * useOnlineStatus — polls the server every 15 seconds to detect connectivity.
 * Returns { isOnline, lastChecked }.
 * No native dependencies required — uses axios to reach the backend.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { checkOnline } from "../offline/sync";

const POLL_INTERVAL_MS = 15_000;

export default function useOnlineStatus() {
  const [isOnline, setIsOnline]     = useState(true);
  const [lastChecked, setLastChecked] = useState(null);
  const intervalRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const check = useCallback(async () => {
    const online = await checkOnline();
    setIsOnline(online);
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    // Check immediately on mount
    check();

    // Poll regularly
    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);

    // Re-check when app comes to foreground
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        check();
      }
      appStateRef.current = nextState;
    });

    return () => {
      clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [check]);

  return { isOnline, lastChecked };
}
