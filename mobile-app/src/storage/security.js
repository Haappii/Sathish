import AsyncStorage from "@react-native-async-storage/async-storage";

const PIN_KEY = "hb_security_pin";
const SECURITY_SETTINGS_KEY = "hb_security_settings_v1";

function getBiometricClient() {
  try {
    const mod = require("react-native-biometrics");
    const BiometricClient = mod?.default || mod;
    if (!BiometricClient) return null;
    return new BiometricClient();
  } catch {
    return null;
  }
}

export const DEFAULT_SECURITY_SETTINGS = {
  pinEnabled: false,
  biometricEnabled: false,
  biometricRegisteredAt: "",
};

function sanitizeSettings(input = {}) {
  return {
    pinEnabled: Boolean(input?.pinEnabled),
    biometricEnabled: Boolean(input?.biometricEnabled),
    biometricRegisteredAt: String(input?.biometricRegisteredAt || ""),
  };
}

export async function getSecuritySettings() {
  try {
    const raw = await AsyncStorage.getItem(SECURITY_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SECURITY_SETTINGS };
    const parsed = JSON.parse(raw);
    return sanitizeSettings({ ...DEFAULT_SECURITY_SETTINGS, ...parsed });
  } catch {
    return { ...DEFAULT_SECURITY_SETTINGS };
  }
}

export async function saveSecuritySettings(next = {}) {
  const clean = sanitizeSettings(next);
  await AsyncStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify(clean));
  return clean;
}

export async function hasSecurityPin() {
  try {
    const pin = await AsyncStorage.getItem(PIN_KEY);
    return Boolean(pin && String(pin).trim());
  } catch {
    return false;
  }
}

export async function saveSecurityPin(pin) {
  const normalized = String(pin || "").trim();
  await AsyncStorage.setItem(PIN_KEY, normalized);
  return true;
}

export async function verifySecurityPin(pin) {
  const normalized = String(pin || "").trim();
  if (!normalized) return false;
  const current = await AsyncStorage.getItem(PIN_KEY);
  return String(current || "") === normalized;
}

export async function clearSecurityPin() {
  await AsyncStorage.removeItem(PIN_KEY);
  return true;
}

export async function canUseBiometric() {
  const client = getBiometricClient();
  if (!client) return { available: false, reason: "Biometric module unavailable in this build" };
  try {
    const result = await client.isSensorAvailable();
    if (!result?.available) {
      return { available: false, reason: String(result?.error || "No biometric sensor available") };
    }
    return { available: true, biometryType: result?.biometryType || "Biometric" };
  } catch {
    return { available: false, reason: "Unable to check biometric availability" };
  }
}

export async function promptBiometric(promptMessage = "Authenticate") {
  const client = getBiometricClient();
  if (!client) return { success: false, reason: "Biometric module unavailable in this build" };
  try {
    const result = await client.simplePrompt({ promptMessage: String(promptMessage || "Authenticate") });
    if (!result?.success) return { success: false, reason: "Biometric authentication failed" };
    return { success: true };
  } catch {
    return { success: false, reason: "Biometric authentication cancelled or failed" };
  }
}
