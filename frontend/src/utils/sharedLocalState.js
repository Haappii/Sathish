const SHARED_LOCAL_STORAGE_KEYS = [
  "hb_session",
  "token",
  "access_token",
  "hb_business_date",
  "hb_offline_auth_v1",
  "hb_offline_cache_v1",
  "offline_bills_v1",
  "billing_type",
];
const REMOVED_SENTINEL = { __deleted: true };

const hasElectronLocalData = () =>
  typeof window !== "undefined" && Boolean(window.electronAPI?.localData);

const getStorage = () =>
  typeof localStorage !== "undefined" ? localStorage : null;

const toSharedFileKey = (key) => `local_storage__${String(key || "")}`;
const isRemovedSentinel = (value) =>
  Boolean(value && typeof value === "object" && value.__deleted === true);

export const isDesktopApp = () => hasElectronLocalData();

export function writeSharedLocalValue(key, value) {
  const storage = getStorage();
  const normalizedKey = String(key || "");

  if (storage) {
    if (value == null) {
      storage.removeItem(normalizedKey);
    } else {
      storage.setItem(normalizedKey, String(value));
    }
  }

  if (hasElectronLocalData()) {
    window.electronAPI.localData
      .write(
        toSharedFileKey(normalizedKey),
        value == null ? REMOVED_SENTINEL : String(value)
      )
      .catch(() => {});
  }

  return value;
}

export function removeSharedLocalValue(key) {
  const storage = getStorage();
  const normalizedKey = String(key || "");

  if (storage) {
    storage.removeItem(normalizedKey);
  }

  if (hasElectronLocalData()) {
    window.electronAPI.localData
      .write(toSharedFileKey(normalizedKey), REMOVED_SENTINEL)
      .catch(() => {});
  }
}

export function setBillingTypeCache(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    removeSharedLocalValue("billing_type");
    return "";
  }

  writeSharedLocalValue("billing_type", normalized);
  return normalized;
}

export async function hydrateSharedLocalState(
  keys = SHARED_LOCAL_STORAGE_KEYS
) {
  if (!hasElectronLocalData()) return;

  const storage = getStorage();
  if (!storage) return;

  await Promise.all(
    keys.map(async (key) => {
      const normalizedKey = String(key || "");
      const localValue = storage.getItem(normalizedKey);

      let sharedValue = null;
      try {
        sharedValue = await window.electronAPI.localData.read(
          toSharedFileKey(normalizedKey)
        );
      } catch {
        sharedValue = null;
      }

      if (isRemovedSentinel(sharedValue)) {
        if (localValue != null) {
          storage.removeItem(normalizedKey);
        }
        return;
      }

      if (sharedValue != null) {
        const nextValue = String(sharedValue);
        if (localValue !== nextValue) {
          storage.setItem(normalizedKey, nextValue);
        }
        return;
      }

      if (localValue != null) {
        try {
          await window.electronAPI.localData.write(
            toSharedFileKey(normalizedKey),
            localValue
          );
        } catch {
          // Ignore background migration errors.
        }
      }
    })
  );
}
