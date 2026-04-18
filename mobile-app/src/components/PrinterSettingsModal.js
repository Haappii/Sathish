import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  DEFAULT_PRINTER_SETTINGS,
  getPrinterSettings,
  savePrinterSettings,
} from "../utils/printerSettings";
import { useTheme } from "../context/ThemeContext";

const printerModule = (() => {
  try {
    return require("react-native-esc-pos-printer");
  } catch {
    return null;
  }
})();

export default function PrinterSettingsModal({ visible, onClose, onSaved }) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(DEFAULT_PRINTER_SETTINGS);
  const discovery = printerModule?.usePrintersDiscovery?.() || {
    printers: [],
    isDiscovering: false,
    start: () => {},
    stop: () => {},
    printerError: null,
  };
  const { printers, isDiscovering, start, stop, printerError } = discovery;
  const autoScanOnceRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      autoScanOnceRef.current = false;
      stop();
      return;
    }

    let mounted = true;
    (async () => {
      setLoading(true);
      const saved = await getPrinterSettings();
      if (mounted) setForm(saved);
      setLoading(false);
    })();

    if (printerModule?.DiscoveryFilterOption && !autoScanOnceRef.current) {
      autoScanOnceRef.current = true;
      start({
        timeout: 12000,
        filterOption: {
          portType: printerModule.DiscoveryFilterOption.PORTTYPE_BLUETOOTH,
          bondedDevices: printerModule.DiscoveryFilterOption.TRUE,
        },
      });
    }

    return () => {
      mounted = false;
      stop();
    };
  }, [visible]);

  const errorText = useMemo(() => {
    if (!printerModule) return "Printer discovery module unavailable in this build.";
    if (!printerError) return "";
    return String(printerError?.message || "Printer discovery failed");
  }, [printerError]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const scanBluetooth = () => {
    if (!printerModule?.DiscoveryFilterOption) return;
    start({
      timeout: 12000,
      filterOption: {
        portType: printerModule.DiscoveryFilterOption.PORTTYPE_BLUETOOTH,
        bondedDevices: printerModule.DiscoveryFilterOption.TRUE,
      },
    });
  };

  const scanLan = () => {
    if (!printerModule?.DiscoveryFilterOption) return;
    start({
      timeout: 12000,
      filterOption: {
        portType: printerModule.DiscoveryFilterOption.PORTTYPE_TCP,
      },
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const clean = await savePrinterSettings(form);
      onSaved?.(clean);
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={[styles.head, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
          <Text style={[styles.title, { color: theme.text }]}>Printer Settings</Text>
          <Pressable onPress={onClose}>
            <Text style={[styles.close, { color: theme.accent }]}>Close</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <View style={[styles.card, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.label, { color: theme.text }]}>Direct Thermal Printing</Text>
                  <Text style={[styles.help, { color: theme.textSub }]}>Enable native no-preview printing on Android.</Text>
                </View>
                <Switch
                  value={Boolean(form.directThermalEnabled)}
                  onValueChange={(v) => update("directThermalEnabled", v)}
                />
              </View>

              <Text style={[styles.label, { color: theme.text }]}>Printer Target</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg, color: theme.text }]}
                placeholder="BT:66:32:8C:CC:78:E3 or TCP:192.168.1.120"
                placeholderTextColor={theme.textSub}
                value={form.target}
                onChangeText={(v) => update("target", v)}
                autoCapitalize="none"
              />
              <Text style={[styles.help, { color: theme.textSub }]}>Use discovered target for best results.</Text>

              <Text style={[styles.label, { color: theme.text }]}>Printer Model Name</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg, color: theme.text }]}
                placeholder="TM-T88V"
                placeholderTextColor={theme.textSub}
                value={form.deviceName}
                onChangeText={(v) => update("deviceName", v)}
                autoCapitalize="none"
              />

              <Text style={[styles.label, { color: theme.text }]}>Fallback Printer URL (Optional)</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg, color: theme.text }]}
                placeholder="ipp://... (used by system print fallback)"
                placeholderTextColor={theme.textSub}
                value={form.printerUrl}
                onChangeText={(v) => update("printerUrl", v)}
                autoCapitalize="none"
              />
            </View>

            <View style={[styles.card, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
              <Text style={[styles.label, { color: theme.text }]}>Discover Printers</Text>
              <View style={styles.actionsRow}>
                <Pressable style={[styles.scanBtn, { backgroundColor: theme.accent }]} onPress={scanBluetooth} disabled={!printerModule || isDiscovering}>
                  <Text style={styles.scanBtnText}>Scan Bluetooth</Text>
                </Pressable>
                <Pressable style={[styles.scanBtn, { backgroundColor: theme.accent }]} onPress={scanLan} disabled={!printerModule || isDiscovering}>
                  <Text style={styles.scanBtnText}>Scan LAN</Text>
                </Pressable>
                <Pressable style={[styles.stopBtn, { backgroundColor: theme.surface }]} onPress={stop}>
                  <Text style={[styles.stopBtnText, { color: theme.textSub }]}>Stop</Text>
                </Pressable>
              </View>

              {isDiscovering ? <Text style={[styles.help, { color: theme.textSub }]}>Scanning...</Text> : null}
              {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

              {(printers || []).map((printer) => (
                <Pressable
                  key={`${printer.target}-${printer.deviceName}`}
                  style={[styles.deviceRow, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]}
                  onPress={() => {
                    update("target", String(printer.target || ""));
                    update("deviceName", String(printer.deviceName || form.deviceName || "TM-T88V"));
                  }}
                >
                  <Text style={[styles.deviceName, { color: theme.text }]}>{printer.deviceName || "Printer"}</Text>
                  <Text style={[styles.deviceMeta, { color: theme.textSub }]}>{printer.target}</Text>
                  {!!printer.ipAddress && <Text style={[styles.deviceMeta, { color: theme.textSub }]}>IP: {printer.ipAddress}</Text>}
                  {!!printer.bdAddress && <Text style={[styles.deviceMeta, { color: theme.textSub }]}>BT: {printer.bdAddress}</Text>}
                </Pressable>
              ))}

              <Text style={[styles.help, { color: theme.textSub }]}>Enter target manually if not discovered. Bluetooth format: BT:66:32:8C:CC:78:E3 — raw MAC (without BT:) is auto-corrected. LAN format: TCP:192.168.1.120</Text>
            </View>

            <Pressable style={[styles.saveBtn, { backgroundColor: theme.success }, saving && styles.disabled]} disabled={saving} onPress={save}>
              <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Printer Settings"}</Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  head: {
    padding: 14,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  close: { color: "#2563eb", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: 12, gap: 10, paddingBottom: 20 },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 12,
    gap: 8,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontWeight: "700", color: "#0f172a" },
  help: { color: "#64748b", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#fff",
  },
  actionsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  scanBtn: {
    backgroundColor: "#1d4ed8",
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scanBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  stopBtn: {
    backgroundColor: "#e2e8f0",
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stopBtnText: { color: "#334155", fontWeight: "700", fontSize: 12 },
  error: { color: "#b91c1c", fontSize: 12, fontWeight: "600" },
  deviceRow: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f8fafc",
    gap: 2,
  },
  deviceName: { fontWeight: "800", color: "#0f172a" },
  deviceMeta: { fontSize: 12, color: "#475569" },
  saveBtn: {
    backgroundColor: "#047857",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.7 },
});
