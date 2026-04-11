import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@haappii_printer_settings_v1";

export const DEFAULT_PRINTER_SETTINGS = {
  directThermalEnabled: false,
  target: "",
  deviceName: "TM-T88V",
  printerUrl: "",
};

function sanitizeSettings(input = {}) {
  return {
    directThermalEnabled: Boolean(input?.directThermalEnabled),
    target: String(input?.target || "").trim(),
    deviceName: String(input?.deviceName || DEFAULT_PRINTER_SETTINGS.deviceName).trim() || DEFAULT_PRINTER_SETTINGS.deviceName,
    printerUrl: String(input?.printerUrl || "").trim(),
  };
}

export async function getPrinterSettings() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRINTER_SETTINGS };
    const parsed = JSON.parse(raw);
    return sanitizeSettings({ ...DEFAULT_PRINTER_SETTINGS, ...parsed });
  } catch {
    return { ...DEFAULT_PRINTER_SETTINGS };
  }
}

export async function savePrinterSettings(nextSettings = {}) {
  const clean = sanitizeSettings(nextSettings);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  return clean;
}
