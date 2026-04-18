import { useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import PrinterSettingsModal from "../components/PrinterSettingsModal";
import { useTheme } from "../context/ThemeContext";

const OPTIONS = [
  { value: "light", label: "Light", icon: "☀️", desc: "Always use light mode" },
  { value: "dark", label: "Dark", icon: "🌙", desc: "Always use dark mode" },
  { value: "system", label: "System", icon: "📱", desc: "Follow device setting" },
];

export default function SettingsScreen() {
  const { theme, preference, setPreference } = useTheme();
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Printing</Text>
        <Text style={[styles.sectionSub, { color: theme.textSub }]}>Manage printer discovery and thermal settings</Text>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
          onPress={() => setShowPrinterSettings(true)}
        >
          <Text style={[styles.actionBtnText, { color: theme.text }]}>Open Printer Settings</Text>
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
    margin: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    gap: 6,
    shadowColor: "#1a2463", shadowOpacity: 0.07, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800" },
  sectionSub: { fontSize: 12, marginBottom: 10 },
  optionList: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  optionIcon: { fontSize: 22 },
  optionLabel: { fontSize: 14, fontWeight: "700" },
  optionDesc: { fontSize: 11, marginTop: 2 },
  checkCircle: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  checkMark: { color: "#fff", fontSize: 13, fontWeight: "900" },
  actionBtn: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  actionBtnText: { fontWeight: "800", fontSize: 13 },
});
