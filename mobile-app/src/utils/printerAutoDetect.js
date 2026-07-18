import { Platform } from "react-native";
import { getPrinterSettings, savePrinterSettings } from "./printerSettings";

export async function autoDetectPrinter() {
  try {
    const current = await getPrinterSettings();
    if (current.target && current.directThermalEnabled) return;

    if (Platform.OS !== "android") return;

    const { PermissionsAndroid, NativeModules } = require("react-native");
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]).catch(() => {});

    const btModule = NativeModules?.BluetoothPrinterModule;
    if (!btModule?.listPairedDevices) return;

    const devices = await btModule.listPairedDevices();
    if (!Array.isArray(devices) || !devices.length) return;

    const best = devices[0];
    await savePrinterSettings({
      directThermalEnabled: true,
      target: String(best.address || best.target || ""),
      deviceName: String(best.name || best.deviceName || "Thermal Printer"),
      printerUrl: "",
    });
  } catch {
    // Silent fail
  }
}
