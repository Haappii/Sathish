import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../api/client";

const asId = (value) => String(value || "");
const errorDetail = (err, fallback) => err?.response?.data?.detail || fallback;

// Module keys here MUST match the unique perm.module values in navigationMenu.jsx
// so that toggling a menu row only affects that specific menu and nothing else.
// Kept identical to frontend/src/pages/setup/Permissions.jsx MENU_ACCESS_CATALOG.
const MENU_ACCESS_CATALOG = [
  // Main
  { name: "Home", module: "home", group: "Main" },
  { name: "Trends", module: "trends", group: "Main" },
  { name: "Analytics", module: "analytics", group: "Main" },
  { name: "Cash Drawer", module: "cash_drawer", group: "Main" },
  { name: "Day Close", module: "day_close", group: "Main" },

  // Billing
  { name: "Sales Billing / Take Away", module: "sales_billing", group: "Billing" },
  { name: "Billing History", module: "billing_history", group: "Billing" },
  { name: "Table Billing", module: "table_billing", group: "Billing" },
  { name: "QR Orders", module: "qr_orders", group: "Billing" },
  { name: "Order Live", module: "order_live", group: "Billing" },
  { name: "KOT", module: "kot_management", group: "Billing" },
  { name: "Delivery", module: "delivery", group: "Billing" },
  { name: "Reservations", module: "reservations", group: "Billing" },
  { name: "Recipes", module: "recipes", group: "Billing" },
  { name: "Online Orders", module: "online_orders", group: "Billing" },
  { name: "Advance Orders", module: "advance_orders", group: "Billing" },
  { name: "Offline Sync", module: "offline_sync", group: "Billing" },
  { name: "Draft Bills", module: "drafts", group: "Billing" },
  { name: "Returns", module: "returns", group: "Billing" },
  { name: "Dues", module: "dues", group: "Billing" },

  // Finance
  { name: "Expenses", module: "expenses", group: "Finance" },
  { name: "Supplier Ledger", module: "supplier_ledger", group: "Finance" },

  // CRM
  { name: "Customers", module: "customers", group: "CRM" },
  { name: "Loyalty", module: "loyalty", group: "CRM" },
  { name: "Gift Cards", module: "gift_cards", group: "CRM" },
  { name: "Coupons", module: "coupons", group: "CRM" },

  // HR
  { name: "Employees", module: "employees", group: "HR" },
  { name: "Employee Attendance", module: "employee_attendance", group: "HR" },
  { name: "Onboarding Docs", module: "employee_onboarding", group: "HR" },

  // Inventory
  { name: "Inventory / Raw Materials", module: "inventory", group: "Inventory" },
  { name: "Stock Audit", module: "stock_audit", group: "Inventory" },
  { name: "Item Lots", module: "item_lots", group: "Inventory" },
  { name: "Labels / Barcode", module: "labels", group: "Inventory" },
  { name: "Transfers", module: "transfers", group: "Inventory" },

  // Reports
  { name: "Reports", module: "reports", group: "Reports" },
  { name: "Deleted Invoice", module: "deleted_invoices", group: "Reports" },
  { name: "Feedback Review", module: "feedback_review", group: "Reports" },
  { name: "Alerts", module: "alerts", group: "Reports" },
  { name: "Support Tickets", module: "support_tickets", group: "Support" },

  // Setup sub menus (use backend module names — controlled by Setup.jsx internally)
  { name: "Setup > Category Management", module: "categories", group: "Setup" },
  { name: "Setup > Item Management", module: "items", group: "Setup" },
  { name: "Setup > Item Pricing", module: "pricing", group: "Setup" },
  { name: "Setup > Shop Details", module: "setup", group: "Setup" },
  { name: "Setup > User Management", module: "users", group: "Setup" },
  { name: "Setup > Role Management", module: "roles", group: "Setup" },
  { name: "Setup > Permissions", module: "roles", group: "Setup" },
  { name: "Setup > Branch Management", module: "setup", group: "Setup" },
  { name: "Setup > Suppliers", module: "suppliers", group: "Setup" },
  { name: "Setup > Purchase Orders", module: "purchase_orders", group: "Setup" },
  { name: "Setup > Online Order Setup", module: "online_orders", group: "Setup" },
  { name: "Setup > Excel Upload", module: "setup", group: "Setup" },
  { name: "Setup > Mail Scheduler", module: "setup", group: "Setup" },
  { name: "Setup > Cash Denominations", module: "cash_drawer", group: "Setup" },
  { name: "Admin (Setup Hub)", module: "admin", group: "Setup" },

  // Mobile-specific
  { name: "Mobile > QR Order Accept", module: "qr_orders", group: "Mobile" },
  { name: "Mobile > KOT Management", module: "kot_management", group: "Mobile" },
  { name: "Mobile > Supplier Ledger", module: "supplier_ledger", group: "Mobile" },
  { name: "Mobile > Advance Orders", module: "advance_orders", group: "Mobile" },
  { name: "Mobile > Analytics", module: "analytics", group: "Mobile" },
  { name: "Mobile > Dues & Receivables", module: "dues", group: "Mobile" },
];

export default function PermissionsScreen() {
  const [modules, setModules] = useState([]);
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [editRoleName, setEditRoleName] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [roleBusy, setRoleBusy] = useState(false);
  const [savingKey, setSavingKey] = useState("");

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const enabledRes = await api.get("/permissions/enabled").catch(() => null);
      if (enabledRes && enabledRes.data?.enabled === false) {
        try {
          await api.post("/permissions/bootstrap");
        } catch (err) {
          const msg = String(err?.response?.data?.detail || "").toLowerCase();
          if (!msg.includes("already enabled")) throw err;
        }
      }
      const [modRes, roleRes, permRes] = await Promise.all([
        api.get("/permissions/modules"),
        api.get("/roles/"),
        api.get("/permissions/"),
      ]);
      const mods = Array.isArray(modRes.data) ? modRes.data : [];
      const rls = (Array.isArray(roleRes.data) ? roleRes.data : []).filter((r) => Boolean(r?.status));
      const permRows = Array.isArray(permRes.data) ? permRes.data : [];
      setModules(mods);
      setRoles(rls);
      setPerms(permRows);
      setSelectedRoleId((prev) => {
        const keep = rls.some((r) => asId(r.role_id) === asId(prev));
        const nextId = keep ? asId(prev) : asId(rls?.[0]?.role_id || "");
        const nextRole = rls.find((r) => asId(r.role_id) === nextId);
        setEditRoleName(nextRole?.role_name || "");
        return nextId;
      });
    } catch (err) {
      Alert.alert("Error", errorDetail(err, "Failed to load permissions setup"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const permMap = useMemo(() => {
    const map = {};
    for (const row of perms || []) {
      const roleId = asId(row.role_id);
      map[roleId] = map[roleId] || {};
      map[roleId][row.module] = row;
    }
    return map;
  }, [perms]);

  const selectedRole = useMemo(
    () => roles.find((r) => asId(r.role_id) === asId(selectedRoleId)),
    [roles, selectedRoleId]
  );

  const filteredModules = useMemo(() => {
    const query = String(menuSearch || "").trim().toLowerCase();
    const backendModules = (modules || []).map((m) => ({ name: m.label || m.key, module: m.key, group: "Module" }));
    const byKey = new Map();

    [...MENU_ACCESS_CATALOG, ...backendModules].forEach((entry) => {
      const moduleKey = String(entry.module || "").trim().toLowerCase();
      if (!moduleKey) return;
      const uniqueKey = `${entry.group || "Menu"}|${entry.name}|${moduleKey}`;
      byKey.set(uniqueKey, {
        key: uniqueKey,
        name: entry.name,
        module: moduleKey,
        group: entry.group || "Menu",
      });
    });

    const rows = Array.from(byKey.values());
    const filtered = query
      ? rows.filter((m) => `${m.name || ""} ${m.module || ""} ${m.group || ""}`.toLowerCase().includes(query))
      : rows;

    const byGroup = new Map();
    filtered.forEach((m) => {
      if (!byGroup.has(m.group)) byGroup.set(m.group, []);
      byGroup.get(m.group).push(m);
    });
    return Array.from(byGroup.entries()).map(([group, data]) => ({ title: group, data }));
  }, [modules, menuSearch]);

  const flatFilteredModules = useMemo(
    () => filteredModules.flatMap((s) => s.data),
    [filteredModules]
  );

  const mappedCount = useMemo(
    () =>
      flatFilteredModules.filter((m) => {
        const p = permMap?.[asId(selectedRoleId)]?.[m.module];
        return Boolean(p?.can_read || p?.can_write);
      }).length,
    [flatFilteredModules, permMap, selectedRoleId]
  );

  const selectRole = (roleId) => {
    const id = asId(roleId);
    setSelectedRoleId(id);
    const row = roles.find((r) => asId(r.role_id) === id);
    setEditRoleName(row?.role_name || "");
  };

  const upsertAccess = async (moduleKey, nextAccess) => {
    const roleIdNum = Number(selectedRoleId);
    if (!roleIdNum || !moduleKey) return;
    try {
      setSavingKey(`${selectedRoleId}:${moduleKey}`);
      const res = await api.post("/permissions/upsert", {
        role_id: roleIdNum,
        module: moduleKey,
        can_read: Boolean(nextAccess),
        can_write: Boolean(nextAccess),
      });
      const row = res.data;
      setPerms((prev) => {
        const next = Array.isArray(prev) ? prev.slice() : [];
        const idx = next.findIndex((x) => asId(x.role_id) === asId(row.role_id) && x.module === row.module);
        if (idx >= 0) next[idx] = row; else next.push(row);
        return next;
      });
    } catch (err) {
      Alert.alert("Error", errorDetail(err, "Failed to update menu access"));
    } finally {
      setSavingKey("");
    }
  };

  const toggleAccess = (moduleKey) => {
    const current = permMap?.[asId(selectedRoleId)]?.[moduleKey];
    upsertAccess(moduleKey, !Boolean(current?.can_read || current?.can_write));
  };

  const setVisibleModuleAccess = async (nextAccess) => {
    const roleIdNum = Number(selectedRoleId);
    if (!roleIdNum || !flatFilteredModules.length) return;
    try {
      setRoleBusy(true);
      const moduleKeys = [...new Set(flatFilteredModules.map((m) => m.module))];
      await Promise.all(
        moduleKeys.map((moduleKey) =>
          api.post("/permissions/upsert", {
            role_id: roleIdNum,
            module: moduleKey,
            can_read: Boolean(nextAccess),
            can_write: Boolean(nextAccess),
          })
        )
      );
      await load();
    } catch (err) {
      Alert.alert("Error", errorDetail(err, "Failed to update menu mapping"));
    } finally {
      setRoleBusy(false);
    }
  };

  const createRole = async () => {
    const roleName = newRoleName.trim();
    if (!roleName) return Alert.alert("Validation", "Role name is required");
    setSavingRole(true);
    try {
      const res = await api.post("/roles/", { role_name: roleName, status: true });
      const created = res?.data;
      setRoleModalOpen(false);
      setNewRoleName("");
      await load();
      if (created?.role_id) {
        setSelectedRoleId(asId(created.role_id));
        setEditRoleName(created.role_name || "");
      }
    } catch (err) {
      Alert.alert("Error", errorDetail(err, "Failed to create role"));
    } finally {
      setSavingRole(false);
    }
  };

  const renameRole = async () => {
    if (!selectedRoleId) return;
    const nextName = editRoleName.trim();
    if (!nextName) return Alert.alert("Validation", "Role name is required");
    if (nextName === String(selectedRole?.role_name || "")) {
      return Alert.alert("No Changes", "No changes to update");
    }
    setRoleBusy(true);
    try {
      await api.put(`/roles/${selectedRoleId}`, { role_name: nextName });
      await load();
    } catch (err) {
      Alert.alert("Error", errorDetail(err, "Failed to update role"));
    } finally {
      setRoleBusy(false);
    }
  };

  const deleteRole = () => {
    if (!selectedRoleId || !selectedRole) return;
    Alert.alert(
      "Delete Role",
      `Delete role "${selectedRole.role_name}"? This is allowed only when no active users are assigned.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setRoleBusy(true);
            try {
              await api.delete(`/roles/${selectedRoleId}`);
              await load();
            } catch (err) {
              Alert.alert("Error", errorDetail(err, "Failed to delete role"));
            } finally {
              setRoleBusy(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <SectionList
        sections={filteredModules}
        keyExtractor={(m) => m.key}
        stickySectionHeadersEnabled
        contentContainerStyle={st.list}
        ListHeaderComponent={
          <View>
            <View style={st.roleBarRow}>
              <View style={st.roleChipsWrap}>
                {roles.map((r) => (
                  <Pressable
                    key={r.role_id}
                    style={[st.roleChip, asId(selectedRoleId) === asId(r.role_id) && st.roleChipActive]}
                    onPress={() => selectRole(r.role_id)}
                  >
                    <Text style={[st.roleChipText, asId(selectedRoleId) === asId(r.role_id) && st.roleChipTextActive]}>
                      {r.role_name}
                    </Text>
                  </Pressable>
                ))}
                <Pressable style={st.addRoleChip} onPress={() => setRoleModalOpen(true)}>
                  <Text style={st.addRoleChipText}>+ Role</Text>
                </Pressable>
              </View>
            </View>

            <View style={st.manageCard}>
              <Text style={st.manageTitle}>Manage Role</Text>
              <TextInput
                style={st.input}
                placeholder="Rename role"
                placeholderTextColor="#94a3b8"
                value={editRoleName}
                onChangeText={setEditRoleName}
                editable={!!selectedRoleId}
              />
              <View style={st.manageActions}>
                <Pressable
                  style={[st.renameBtn, (!selectedRoleId || roleBusy) && st.btnDisabled]}
                  disabled={!selectedRoleId || roleBusy}
                  onPress={renameRole}
                >
                  <Text style={st.renameBtnText}>Rename</Text>
                </Pressable>
                <Pressable
                  style={[st.deleteBtn, (!selectedRoleId || roleBusy) && st.btnDisabled]}
                  disabled={!selectedRoleId || roleBusy}
                  onPress={deleteRole}
                >
                  <Text style={st.deleteBtnText}>Delete</Text>
                </Pressable>
              </View>
            </View>

            <View style={st.menuHeaderRow}>
              <Text style={st.menuHeaderTitle}>
                {selectedRole?.role_name ? `Managing: ${selectedRole.role_name}` : "Select a role above"}
              </Text>
              <Text style={st.mappedCount}>{mappedCount} mapped</Text>
            </View>

            <TextInput
              style={st.searchInput}
              placeholder="Search menus…"
              placeholderTextColor="#94a3b8"
              value={menuSearch}
              onChangeText={setMenuSearch}
            />

            <View style={st.bulkRow}>
              <Pressable
                style={[st.mapAllBtn, (!selectedRoleId || roleBusy || !flatFilteredModules.length) && st.btnDisabled]}
                disabled={!selectedRoleId || roleBusy || !flatFilteredModules.length}
                onPress={() => setVisibleModuleAccess(true)}
              >
                <Text style={st.mapAllBtnText}>Map All Visible</Text>
              </Pressable>
              <Pressable
                style={[st.unmapAllBtn, (!selectedRoleId || roleBusy || !flatFilteredModules.length) && st.btnDisabled]}
                disabled={!selectedRoleId || roleBusy || !flatFilteredModules.length}
                onPress={() => setVisibleModuleAccess(false)}
              >
                <Text style={st.unmapAllBtnText}>Unmap All Visible</Text>
              </Pressable>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={st.sectionHeader}>
            <Text style={st.sectionHeaderText}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const p = permMap?.[asId(selectedRoleId)]?.[item.module] || {};
          const hasAccess = Boolean(p.can_read || p.can_write);
          const busy = savingKey === `${selectedRoleId}:${item.module}`;
          return (
            <View style={st.moduleRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={st.moduleLabel}>{item.name}</Text>
                <Text style={st.moduleSub}>module: {item.module}</Text>
              </View>
              <Switch
                value={hasAccess}
                onValueChange={() => !busy && selectedRoleId && toggleAccess(item.module)}
                trackColor={{ true: "#6366f1" }}
                disabled={busy || !selectedRoleId}
              />
            </View>
          );
        }}
        ListEmptyComponent={<View style={st.center}><Text style={st.emptyTitle}>No menus found</Text></View>}
      />

      <Modal visible={roleModalOpen} animationType="slide" transparent onRequestClose={() => setRoleModalOpen(false)}>
        <Pressable style={st.modalBackdrop} onPress={() => setRoleModalOpen(false)}>
          <Pressable style={st.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.modalTitle}>New Role</Text>
            <TextInput style={st.input} placeholder="Role name" placeholderTextColor="#94a3b8" value={newRoleName} onChangeText={setNewRoleName} />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setRoleModalOpen(false)}><Text style={st.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={st.saveBtn} disabled={savingRole} onPress={createRole}>
                {savingRole ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>Create</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f6fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  list: { paddingHorizontal: 14, paddingBottom: 24 },
  roleBarRow: { paddingVertical: 12 },
  roleChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#fff" },
  roleChipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  roleChipText: { fontSize: 12, fontWeight: "700", color: "#4b5563" },
  roleChipTextActive: { color: "#fff" },
  addRoleChip: { borderWidth: 1.5, borderColor: "#6366f1", borderStyle: "dashed", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  addRoleChipText: { fontSize: 12, fontWeight: "700", color: "#6366f1" },
  manageCard: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1.5, borderColor: "#e4e9f2", padding: 14, gap: 10, marginBottom: 14 },
  manageTitle: { fontSize: 13, fontWeight: "800", color: "#0a0f1e" },
  manageActions: { flexDirection: "row", gap: 10 },
  renameBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", alignItems: "center", backgroundColor: "#fff" },
  renameBtnText: { color: "#374151", fontWeight: "700", fontSize: 13 },
  deleteBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center", backgroundColor: "#fee2e2" },
  deleteBtnText: { color: "#dc2626", fontWeight: "700", fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
  menuHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  menuHeaderTitle: { fontSize: 13, fontWeight: "800", color: "#0a0f1e", flex: 1, marginRight: 8 },
  mappedCount: { fontSize: 11, fontWeight: "700", color: "#6b7280" },
  searchInput: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e", marginBottom: 10 },
  bulkRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  mapAllBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#d1fae5", alignItems: "center" },
  mapAllBtnText: { color: "#047857", fontWeight: "700", fontSize: 12 },
  unmapAllBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#fee2e2", alignItems: "center" },
  unmapAllBtnText: { color: "#dc2626", fontWeight: "700", fontSize: 12 },
  sectionHeader: { backgroundColor: "#f4f6fb", paddingVertical: 6 },
  sectionHeaderText: { fontSize: 11, fontWeight: "800", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  moduleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1.5, borderColor: "#e4e9f2", paddingHorizontal: 14, paddingVertical: 12, marginBottom: 6 },
  moduleLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },
  moduleSub: { fontSize: 10, fontWeight: "500", color: "#9ca3af", marginTop: 2 },
  emptyTitle: { color: "#9ca3af", fontSize: 14, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0a0f1e" },
  input: { borderWidth: 1.5, borderColor: "#e4e9f2", borderRadius: 12, backgroundColor: "#f8f9fd", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#0a0f1e" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f3f9", alignItems: "center" },
  cancelBtnText: { color: "#4b5563", fontWeight: "700", fontSize: 13 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
