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
import { useAuth } from "../context/AuthContext";

const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SIZES = [
  { key: "50x25", label: "50x25 mm" },
  { key: "40x30", label: "40x30 mm" },
  { key: "80x25", label: "80x25 mm" },
];

export default function LabelsScreen() {
  const { session } = useAuth();
  const branchId = session?.branch_id ?? null;

  const [mode, setMode] = useState("item"); // item | lot
  const [size, setSize] = useState("50x25");
  const [columns, setColumns] = useState("2");

  const [items, setItems] = useState([]);
  const [lots, setLots] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [selectedLots, setSelectedLots] = useState(new Set());
  const [count, setCount] = useState("1");
  const [showPrice, setShowPrice] = useState(true);
  const [showMrp, setShowMrp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/items/"),
      branchId ? api.get("/item-lots/", { params: { branch_id: branchId } }) : Promise.resolve({ data: [] }),
    ])
      .then(([itemsRes, lotsRes]) => {
        setItems((Array.isArray(itemsRes.data) ? itemsRes.data : []).filter((it) => !it?.is_raw_material));
        setLots(Array.isArray(lotsRes.data) ? lotsRes.data : []);
      })
      .catch((err) => {
        Alert.alert("Error", err?.response?.data?.detail || "Failed to load items");
      })
      .finally(() => setLoading(false));
  }, [branchId]);

  const filteredItems = items.filter((it) => it.item_name?.toLowerCase().includes(search.toLowerCase()));
  const filteredLots = lots.filter((l) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      String(l.item_name || "").toLowerCase().includes(q) ||
      String(l.batch_no || "").toLowerCase().includes(q) ||
      String(l.serial_no || "").toLowerCase().includes(q)
    );
  });

  const selected = mode === "item" ? selectedItems : selectedLots;
  const setSelected = mode === "item" ? setSelectedItems : setSelectedLots;

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
      const reps = Math.max(1, Number(count) || 1);
      const cols = Math.max(1, Number(columns) || 2);
      const cells = [];
      if (mode === "item") {
        const chosen = items.filter((it) => selected.has(it.item_id));
        chosen.forEach((it) => { for (let i = 0; i < reps; i++) cells.push(it); });
      } else {
        const chosen = lots.filter((l) => selected.has(l.lot_id));
        chosen.forEach((l) => { for (let i = 0; i < reps; i++) cells.push(l); });
      }
      const cellsHtml = cells.map((it) => {
        if (mode === "item") {
          return `
        <div style="width:180px;border:1px dashed #999;border-radius:4px;padding:8px;margin:4px;display:inline-block;vertical-align:top;">
          <div style="font-size:11px;font-weight:700;">${escapeHtml(it.item_name)}</div>
          ${showPrice ? `<div style="font-size:13px;font-weight:900;margin-top:2px;">₹${Number(it.selling_price ?? it.price ?? 0).toFixed(2)}</div>` : ""}
          ${showMrp && it.mrp_price ? `<div style="font-size:10px;color:#666;">MRP ₹${Number(it.mrp_price).toFixed(2)}</div>` : ""}
          <div style="font-size:9px;letter-spacing:2px;margin-top:4px;font-family:monospace;">*${String(it.item_id).padStart(6, "0")}*</div>
        </div>`;
        }
        const sub = [
          it.batch_no ? `Batch: ${escapeHtml(it.batch_no)}` : null,
          it.serial_no ? `SN: ${escapeHtml(it.serial_no)}` : null,
          it.expiry_date ? `Exp: ${escapeHtml(it.expiry_date)}` : null,
        ].filter(Boolean).join(" | ");
        return `
        <div style="width:180px;border:1px dashed #999;border-radius:4px;padding:8px;margin:4px;display:inline-block;vertical-align:top;">
          <div style="font-size:11px;font-weight:700;">${escapeHtml(it.item_name)}</div>
          <div style="font-size:9px;color:#666;margin-top:2px;">${sub}</div>
          <div style="font-size:9px;letter-spacing:2px;margin-top:4px;font-family:monospace;">*${String(it.serial_no || it.batch_no || it.lot_id)}*</div>
        </div>`;
      }).join("");
      const html = `<html><head><meta charset="utf-8" /><style>body{padding:12px;} .grid{display:grid;grid-template-columns:repeat(${cols},auto);}</style></head><body><div class="grid">${cellsHtml}</div></body></html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Labels" });
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
    const active = selected.has(mode === "item" ? item.item_id : item.lot_id);
    return (
      <Pressable style={[st.row, active && st.rowActive]} onPress={() => toggle(mode === "item" ? item.item_id : item.lot_id)}>
        <View style={[st.checkbox, active && st.checkboxActive]}>{active && <Text style={st.checkMark}>✓</Text>}</View>
        <View style={{ flex: 1 }}>
          <Text style={st.itemName} numberOfLines={1}>{item.item_name}</Text>
          {mode === "item" ? (
            <Text style={st.meta}>₹{Number(item.selling_price ?? item.price ?? 0).toFixed(2)}</Text>
          ) : (
            <Text style={st.meta} numberOfLines={1}>
              {[item.batch_no ? `Batch: ${item.batch_no}` : null, item.serial_no ? `SN: ${item.serial_no}` : null, item.expiry_date ? `Exp: ${item.expiry_date}` : null].filter(Boolean).join(" · ") || "—"}
            </Text>
          )}
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
        <View style={st.optRow}>
          <Pressable style={[st.chip, mode === "item" && st.chipActive]} onPress={() => { setMode("item"); setSearch(""); }}>
            <Text style={[st.chipText, mode === "item" && st.chipTextActive]}>Item Labels</Text>
          </Pressable>
          <Pressable style={[st.chip, mode === "lot" && st.chipActive]} onPress={() => { setMode("lot"); setSearch(""); }}>
            <Text style={[st.chipText, mode === "lot" && st.chipTextActive]}>Lot Labels</Text>
          </Pressable>
        </View>

        <TextInput
          style={st.searchInput}
          placeholder={mode === "item" ? "Search item..." : "Search item / batch / serial..."}
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />

        <Text style={st.sectionLabel}>Label Size</Text>
        <View style={st.optRow}>
          {SIZES.map((s) => (
            <Pressable key={s.key} style={[st.chip, size === s.key && st.chipActive]} onPress={() => setSize(s.key)}>
              <Text style={[st.chipText, size === s.key && st.chipTextActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={st.optRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.sectionLabel}>Columns</Text>
            <TextInput style={st.countInputFull} placeholder="Columns" placeholderTextColor="#94a3b8" keyboardType="numeric" value={columns} onChangeText={setColumns} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.sectionLabel}>Copies</Text>
            <TextInput style={st.countInputFull} placeholder="Copies" placeholderTextColor="#94a3b8" keyboardType="numeric" value={count} onChangeText={setCount} />
          </View>
        </View>

        {mode === "item" && (
          <View style={st.optRow}>
            <Pressable style={[st.chip, showPrice && st.chipActive]} onPress={() => setShowPrice((p) => !p)}>
              <Text style={[st.chipText, showPrice && st.chipTextActive]}>Show Price</Text>
            </Pressable>
            <Pressable style={[st.chip, showMrp && st.chipActive]} onPress={() => setShowMrp((p) => !p)}>
              <Text style={[st.chipText, showMrp && st.chipTextActive]}>Show MRP</Text>
            </Pressable>
          </View>
        )}
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          data={mode === "item" ? filteredItems : filteredLots}
          keyExtractor={(r, i) => String(mode === "item" ? r.item_id : r.lot_id ?? i)}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          ListEmptyComponent={
            <View style={st.emptyWrap}>
              <Text style={st.emptyTitle}>{mode === "item" ? "No items found" : "No lots found"}</Text>
            </View>
          }
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
  sectionLabel: { fontSize: 10, fontWeight: "800", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  optRow: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  chip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f8f9fd" },
  chipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  chipTextActive: { color: "#fff" },
  countInput: { width: 60, borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, textAlign: "center" },
  countInputFull: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, textAlign: "center", backgroundColor: "#f8f9fd" },
  list: { paddingHorizontal: 14, paddingBottom: 90, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 10 },
  rowActive: { borderColor: "#6366f1", backgroundColor: "#eef2ff" },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: "#d1d5db", alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  checkMark: { color: "#fff", fontSize: 12, fontWeight: "900" },
  itemName: { fontSize: 13, fontWeight: "700", color: "#0a0f1e" },
  meta: { fontSize: 11, color: "#6b7280" },
  emptyWrap: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyTitle: { color: "#9ca3af", fontSize: 15, fontWeight: "700" },
  fab: { position: "absolute", left: 16, right: 16, bottom: 20, backgroundColor: "#6366f1", borderRadius: 14, paddingVertical: 14, alignItems: "center", elevation: 4 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
