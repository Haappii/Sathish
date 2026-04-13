import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import PrinterSettingsModal from "../components/PrinterSettingsModal";
import {
  canUseBiometric,
  clearSecurityPin,
  getSecuritySettings,
  hasSecurityPin,
  promptBiometric,
  saveSecurityPin,
  saveSecuritySettings,
  verifySecurityPin,
} from "../storage/security";
import { useTheme } from "../context/ThemeContext";

const OPTIONS = [
  { value: "light", label: "Light", icon: "☀️", desc: "Always use light mode" },
  { value: "dark", label: "Dark", icon: "🌙", desc: "Always use dark mode" },
  { value: "system", label: "System", icon: "📱", desc: "Follow device setting" },
];

export default function SettingsScreen() {
  const { theme, preference, setPreference } = useTheme();
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [securitySettings, setSecuritySettings] = useState({
    pinEnabled: false,
    biometricEnabled: false,
    biometricRegisteredAt: "",
  });
  const [pinExists, setPinExists] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [storedSettings, hasPin] = await Promise.all([getSecuritySettings(), hasSecurityPin()]);
      if (!mounted) return;
      setSecuritySettings(storedSettings);
      setPinExists(hasPin);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const updateSecurity = async (patch) => {
    const next = { ...securitySettings, ...patch };
    const saved = await saveSecuritySettings(next);
    setSecuritySettings(saved);
    return saved;
  };

  const openPinModal = () => {
    setCurrentPin("");
    setPin("");
    setConfirmPin("");
    setPinModalVisible(true);
  };

  const savePin = async () => {
    const nextPin = String(pin || "").trim();
    const nextConfirm = String(confirmPin || "").trim();
    if (!/^\d{4,6}$/.test(nextPin)) {
      Alert.alert("Invalid PIN", "PIN must be 4 to 6 digits.");
      return;
    }
    if (nextPin !== nextConfirm) {
      Alert.alert("Mismatch", "PIN and confirm PIN must match.");
      return;
    }

    if (pinExists) {
      const ok = await verifySecurityPin(currentPin);
      if (!ok) {
        Alert.alert("Invalid Current PIN", "Please enter your current PIN correctly.");
        return;
      }
    }

    await saveSecurityPin(nextPin);
    setPinExists(true);
    await updateSecurity({ pinEnabled: true });
    setPinModalVisible(false);
    Alert.alert("Saved", "Security PIN has been updated.");
  };

  const removePin = async () => {
    if (!pinExists) return;
    if (!currentPin.trim()) {
      Alert.alert("Current PIN Required", "Enter your current PIN to remove it.");
      return;
    }
    const ok = await verifySecurityPin(currentPin);
    if (!ok) {
      Alert.alert("Invalid Current PIN", "Please enter your current PIN correctly.");
      return;
    }
    await clearSecurityPin();
    setPinExists(false);
    await updateSecurity({ pinEnabled: false });
    setCurrentPin("");
    Alert.alert("Removed", "Security PIN has been removed.");
  };

  const togglePinEnabled = async (enabled) => {
    if (enabled && !pinExists) {
      Alert.alert("Set PIN", "Please create a security PIN first.");
      openPinModal();
      return;
    }
    await updateSecurity({ pinEnabled: enabled });
  };

  const registerBiometric = async () => {
    const available = await canUseBiometric();
    if (!available?.available) {
      Alert.alert("Unavailable", String(available?.reason || "Biometric is not available on this device."));
      return false;
    }

    const result = await promptBiometric("Register biometric for Haappii Billing");
    if (!result?.success) {
      Alert.alert("Failed", "Biometric verification was not successful.");
      return false;
    }

    await updateSecurity({
      biometricEnabled: true,
      biometricRegisteredAt: new Date().toISOString(),
    });
    Alert.alert("Registered", "Biometric authentication is enabled.");
    return true;
  };

  const toggleBiometric = async (enabled) => {
    if (!enabled) {
      await updateSecurity({ biometricEnabled: false });
      return;
    }
    await registerBiometric();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Printing</Text>
        <Text style={[styles.sectionSub, { color: theme.textSub }]}>Manage printer discovery and thermal settings</Text>
        <Pressable style={[styles.actionBtn, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]} onPress={() => setShowPrinterSettings(true)}>
          <Text style={[styles.actionBtnText, { color: theme.text }]}>Open Printer Settings</Text>
        </Pressable>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Security</Text>
        <Text style={[styles.sectionSub, { color: theme.textSub }]}>Configure PIN and biometric access</Text>

        <View style={styles.rowBetween}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[styles.switchLabel, { color: theme.text }]}>Enable Security PIN</Text>
            <Text style={[styles.switchSub, { color: theme.textMuted }]}>
              {pinExists ? "PIN created" : "No PIN created"}
            </Text>
          </View>
          <Switch value={Boolean(securitySettings.pinEnabled)} onValueChange={togglePinEnabled} />
        </View>

        <Pressable style={[styles.actionBtn, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]} onPress={openPinModal}>
          <Text style={[styles.actionBtnText, { color: theme.text }]}>{pinExists ? "Change Security PIN" : "Create Security PIN"}</Text>
        </Pressable>

        <View style={styles.rowBetween}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[styles.switchLabel, { color: theme.text }]}>Enable Biometric</Text>
            <Text style={[styles.switchSub, { color: theme.textMuted }]}>Register fingerprint/face and use it in app unlock flows</Text>
          </View>
          <Switch value={Boolean(securitySettings.biometricEnabled)} onValueChange={toggleBiometric} />
        </View>

        <Pressable style={[styles.actionBtn, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]} onPress={registerBiometric}>
          <Text style={[styles.actionBtnText, { color: theme.text }]}>Register / Re-register Biometric</Text>
        </Pressable>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Appearance</Text>
        <Text style={[styles.sectionSub, { color: theme.textSub }]}>Choose how the app looks</Text>

        <View style={styles.optionList}>
          {OPTIONS.map((opt) => {
            const selected = preference === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setPreference(opt.value)}
                style={[
                  styles.option,
                  { borderColor: selected ? theme.accent : theme.cardBorder, backgroundColor: theme.surface },
                  selected && { borderWidth: 2 },
                ]}
              >
                <Text style={styles.optionIcon}>{opt.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, { color: theme.text }]}>{opt.label}</Text>
                  <Text style={[styles.optionDesc, { color: theme.textMuted }]}>{opt.desc}</Text>
                </View>
                {selected && (
                  <View style={[styles.checkCircle, { backgroundColor: theme.accent }]}>
                    <Text style={styles.checkMark}>✓</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Modal visible={pinModalVisible} transparent animationType="fade" onRequestClose={() => setPinModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{pinExists ? "Change Security PIN" : "Create Security PIN"}</Text>

            {pinExists ? (
              <>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Current PIN</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.cardBorder, color: theme.text, backgroundColor: theme.surface }]}
                  value={currentPin}
                  onChangeText={setCurrentPin}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                  placeholder="Current PIN"
                  placeholderTextColor={theme.textSub}
                />
              </>
            ) : null}

            <Text style={[styles.inputLabel, { color: theme.textMuted }]}>New PIN (4-6 digits)</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.cardBorder, color: theme.text, backgroundColor: theme.surface }]}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="New PIN"
              placeholderTextColor={theme.textSub}
            />

            <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Confirm PIN</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.cardBorder, color: theme.text, backgroundColor: theme.surface }]}
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="Confirm PIN"
              placeholderTextColor={theme.textSub}
            />

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, { borderColor: theme.cardBorder }]} onPress={() => setPinModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { borderColor: theme.cardBorder }]} onPress={savePin}>
                <Text style={[styles.modalBtnText, { color: theme.text }]}>Save PIN</Text>
              </Pressable>
            </View>

            {pinExists ? (
              <Pressable style={styles.removeBtn} onPress={removePin}>
                <Text style={styles.removeBtnText}>Remove PIN</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>

      <PrinterSettingsModal
        visible={showPrinterSettings}
        onClose={() => setShowPrinterSettings(false)}
        onSaved={() => Alert.alert("Saved", "Printer settings updated.")}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  section: {
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800" },
  sectionSub: { fontSize: 12, marginBottom: 12 },
  optionList: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  optionIcon: { fontSize: 22 },
  optionLabel: { fontSize: 14, fontWeight: "700" },
  optionDesc: { fontSize: 11, marginTop: 1 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  checkMark: { color: "#fff", fontSize: 12, fontWeight: "800" },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  actionBtnText: { fontWeight: "700", fontSize: 13 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  switchLabel: { fontWeight: "700", fontSize: 13 },
  switchSub: { fontSize: 11, marginTop: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  modalTitle: { fontSize: 15, fontWeight: "800", marginBottom: 8 },
  inputLabel: { fontSize: 12, marginTop: 8, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalBtnText: { fontWeight: "700" },
  removeBtn: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "#fee2e2",
    paddingVertical: 10,
    alignItems: "center",
  },
  removeBtnText: { color: "#b91c1c", fontWeight: "800" },
});
