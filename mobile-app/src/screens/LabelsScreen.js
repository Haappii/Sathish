import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import api from "../api/client";

const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function LabelsScreen() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [count, setCount] = useState("1");
  const [showPrice, setShowPrice] = useState(true);
  const [showMrp, setShowMrp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    api.get("/items/").then((r) => setItems(Array.isArray(r.data) ? r.data : [])).catch((err) => {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to load items");
    }).finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((it) => it.item_name?.toLowerCase().includes(search.toLowerCase()));

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const printLabels = async () => {
    if (selected.size === 0) return Alert.alert("Validation", "Select at least one item");
    setPrinting(true);
    try {
      const chosen = items.filter((it) => selected.has(it.item_id));
      const reps = Math.max(1, Number(count) || 1);
      const cells = [];
      chosen.forEach((it) => {
        for (let i = 0; i < reps; i++) cells.push(it);
      });
      const cellsHtml = cells.map((it) => `
        <div style="width:180px;border:1px dashed #999;border-radius:4px;padding:8px;margin:4px;display:inline-block;vertical-align:top;">
          <div style="font-size:11px;font-weight:700;">${escapeHtml(it.item_name)}</div>
          ${showPrice ? `<div style="font-size:13px;font-weight:900;margin-top:2px;">₹${Number(it.selling_price ?? it.price ?? 0).toFixed(2)}</div>` : ""}
          ${showMrp && it.mrp_price ? `<div style="font-size:10px;color:#666;">MRP ₹${Number(it.mrp_price).toFixed(2)}</div>` : ""}
          <div style="font-size:9px;letter-spacing:2px;margin-top:4px;font-family:monospace;">*${String(it.item_id).padStart(6, "0")}*</div>
        </div>`).join("");
      const html = `<html><head><meta charset="utf-8" /></head><body style="padding:12px;">${cellsHtml}</body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Item Labels" });
      } else {
        Alert.alert("Saved", `Labels saved to:\n${uri}`);
      }
    } catch (err) {
      Alert.alert("Export failed", err?.message || "Could not generate labels");
    } finally {
      setPrinting(false);
    }
  };

  const renderItem = ({ item }) => {
    const active = selected.has(item.item_id);
    return (
      <Pressable style={[st.row, active && st.rowActive]} onPress={() => toggle(item.item_id)}>
        <View style={[st.checkbox, active && st.checkboxActive]}>{active && <Text style={st.checkMark}>✓</Text>}</View>
        <View style={{ flex: 1 }}>
          <Text style={st.itemName} numberOfLines={1}>{item.item_name}</Text>
          <Text style={st.meta}>₹{Number(item.selling_price ?? item.price ?? 0).toFixed(2)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.note}>
        <Text style={st.noteText}>Prints item name, price &amp; a text code per label. Scannable barcode images aren't supported in this app build yet.</Text>
      </View>
      <View style={st.filterCard}>
        <TextInput style={st.searchInput} placeholder="Search item..." placeholderTextColor="#94a3b8" value={search} onChangeText={setSearch} />
        <View style={st.optRow}>
          <Pressable style={[st.chip, showPrice && st.chipActive]} onPress={() => setShowPrice((p) => !p)}>
            <Text style={[st.chipText, showPrice && st.chipTextActive]}>Show Price</Text>
          </Pressable>
          <Pressable style={[st.chip, showMrp && st.chipActive]} onPress={() => setShowMrp((p) => !p)}>
            <Text style={[st.chipText, showMrp && st.chipTextActive]}>Show MRP</Text>
          </Pressable>
          <TextInput style={st.countInput} placeholder="Copies" placeholderTextColor="#94a3b8" keyboardType="numeric" value={count} onChangeText={setCount} />
        </View>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r, i) => String(r.item_id || i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
        />
      )}

      <Pressable style={st.fab} disabled={printing} onPress={printLabels}>
        {printing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.fabText}>Print {selected.size} Label{selected.size === 1 ? "" : "s"}</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  note: { backgroundColor: "#fffbeb", borderBottomWidth: 1, borderBottomColor: "#fde68a", padding: 10 },
  noteText: { fontSize: 11, color: "#92400e" },
  filterCard: { backgroundColor: "#fff", margin: 14, marginBottom: 6, borderRadius: 16, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 12, gap: 8 },
  searchInput: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: "#0a0f1e" },
  optRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  countInput: { width: 60, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, textAlign: "center" },
  list: { paddingHorizontal: 14, paddingBottom: 90, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 10 },
  rowActive: { borderColor: "#6366f1", backgroundColor: "#eef2ff" },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: "#d1d5db", alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  checkMark: { color: "#fff", fontSize: 12, fontWeight: "900" },
  itemName: { fontSize: 13, fontWeight: "700", color: "#0a0f1e" },
  meta: { fontSize: 11, color: "#6b7280" },
  fab: { position: "absolute", left: 16, right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 14, paddingVertical: 14, alignItems: "center", elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
