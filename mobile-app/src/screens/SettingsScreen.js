import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

const OPTIONS = [
  { value: "light", label: "Light", icon: "☀️", desc: "Always use light mode" },
  { value: "dark", label: "Dark", icon: "🌙", desc: "Always use dark mode" },
  { value: "system", label: "System", icon: "📱", desc: "Follow device setting" },
];

export default function SettingsScreen() {
  const { theme, preference, setPreference } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
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
});
