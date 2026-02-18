import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import authAxios from "../api/authAxios";
import { useToast } from "../components/Toast";
import { modulesToPermMap } from "../utils/navigationMenu";

export default function Pricing() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [allowed, setAllowed] = useState(null);
  const [canWrite, setCanWrite] = useState(false);

  const [items, setItems] = useState([]);
  const [levels, setLevels] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [prices, setPrices] = useState([]);

  const [form, setForm] = useState({ level: "RETAIL", price: "" });

  useEffect(() => {
    authAxios
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        setAllowed(Boolean(map?.pricing?.can_read));
        setCanWrite(Boolean(map?.pricing?.can_write));
      })
      .catch(() => {
        setAllowed(false);
        setCanWrite(false);
      });
  }, []);

  const loadItems = async () => {
    try {
      const res = await authAxios.get("/items/");
      setItems((res.data || []).filter((it) => !it?.is_raw_material));
    } catch {
      setItems([]);
      showToast("Failed to load items", "error");
    }
  };

  const loadLevels = async () => {
    try {
      const res = await authAxios.get("/pricing/levels");
      setLevels(res.data || []);
    } catch {
      setLevels([]);
    }
  };

  const loadPrices = async (itemId) => {
    if (!itemId) return setPrices([]);
    try {
      const res = await authAxios.get(`/pricing/item/${itemId}`);
      setPrices(res.data || []);
    } catch (e) {
      setPrices([]);
      showToast(e?.response?.data?.detail || "Failed to load prices", "error");
    }
  };

  useEffect(() => {
    if (!allowed) return;
    loadItems();
    loadLevels();
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    loadPrices(selectedItemId);
  }, [selectedItemId, allowed]);

  const selectedItem = useMemo(
    () => items.find((i) => Number(i.item_id) === Number(selectedItemId)) || null,
    [items, selectedItemId]
  );

  const upsert = async () => {
    if (!canWrite) return showToast("Not allowed", "error");
    if (!selectedItemId) return showToast("Select item", "error");
    if (!form.level.trim()) return showToast("Enter level", "error");
    const p = Number(form.price || 0);
    if (!p || p < 0) return showToast("Enter price", "error");
    try {
      await authAxios.post("/pricing/upsert", {
        item_id: Number(selectedItemId),
        level: form.level.trim().toUpperCase(),
        price: p,
      });
      setForm({ level: form.level, price: "" });
      showToast("Saved", "success");
      loadLevels();
      loadPrices(selectedItemId);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Save failed", "error");
    }
  };

  if (allowed === null) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-gray-600">
        Loading...
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-red-600">
        You are not authorized to access this page
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/home", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          &larr; Back
        </button>
        <h2 className="text-lg font-bold text-slate-800">Pricing / Price Levels</h2>
        <button
          onClick={() => {
            loadItems();
            loadLevels();
            loadPrices(selectedItemId);
          }}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Select Item</div>
          <select
            className="border rounded-lg px-2 py-2 text-[12px] w-full"
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
          >
            <option value="">Choose item</option>
            {items.map((i) => (
              <option key={i.item_id} value={i.item_id}>
                {i.item_name}
              </option>
            ))}
          </select>
          {selectedItem && (
            <div className="text-[12px] text-slate-700">
              Base price:{" "}
              <span className="font-bold">Rs. {Number(selectedItem.price || 0).toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Upsert Price</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded-lg px-2 py-2 text-[12px]"
              placeholder="Level (e.g., WHOLESALE)"
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
            />
            <input
              type="number"
              className="border rounded-lg px-2 py-2 text-[12px]"
              placeholder="Price"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <button
            onClick={upsert}
            disabled={!canWrite}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
          >
            Save
          </button>
          {levels.length > 0 && (
            <div className="text-[11px] text-slate-500">
              Existing levels:{" "}
              {levels.map((l) => l.level).slice(0, 6).join(", ")}
              {levels.length > 6 ? " ..." : ""}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Item Prices</div>
          {prices.length === 0 ? (
            <div className="text-[12px] text-slate-500">No custom prices</div>
          ) : (
            <div className="space-y-1 text-[12px]">
              {prices.map((p) => (
                <div
                  key={p.price_id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="font-semibold">{p.level}</div>
                  <div className="font-bold">Rs. {Number(p.price || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
