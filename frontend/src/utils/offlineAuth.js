import { writeSharedLocalValue } from "./sharedLocalState";

const OFFLINE_AUTH_KEY = "hb_offline_auth_v1";

const toHex = (buf) => Array.from(new Uint8Array(buf))
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("");

const normalizeInput = (value) => String(value || "").trim();

const hashSecret = async ({ shop_id, username, password, branch_id }) => {
  const encoder = new TextEncoder();
  const text = `${normalizeInput(shop_id)}::${normalizeInput(username)}::${normalizeInput(password)}::${normalizeInput(branch_id)}`;
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
};

const readOfflineAuth = () => {
  try {
    const raw = localStorage.getItem(OFFLINE_AUTH_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const rememberOfflineAuth = async ({
  shop_id,
  username,
  password,
  branch_id,
  session,
}) => {
  if (!password || !username || !shop_id) return;
  try {
    const hash = await hashSecret({ shop_id, username, password, branch_id });
    const payload = {
      shop_id,
      username,
      branch_id,
      hash,
      session,
      savedAt: Date.now(),
    };
    writeSharedLocalValue(OFFLINE_AUTH_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

export const tryOfflineAuth = async ({
  shop_id,
  username,
  password,
  branch_id,
}) => {
  const saved = readOfflineAuth();
  if (!saved) return null;
  if (String(saved.shop_id || "") !== String(shop_id || "")) return null;
  if (String(saved.username || "") !== String(username || "")) return null;

  const hash = await hashSecret({
    shop_id,
    username,
    password,
    branch_id: branch_id || saved.branch_id || "",
  });

  if (hash !== saved.hash) return null;
  return saved.session || null;
};
