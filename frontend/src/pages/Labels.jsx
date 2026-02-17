import { useEffect, useMemo, useRef, useState } from "react";

import JsBarcode from "jsbarcode";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";
import BackButton from "../components/BackButton";
import { getSession } from "../utils/auth";
import { modulesToPermMap } from "../utils/navigationMenu";

const money = (v) => `Rs. ${Number(v || 0).toFixed(0)}`;

function Barcode({ value, height = 34 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const v = String(value || "").trim();
    if (!v) return;
    try {
      JsBarcode(ref.current, v, {
        format: "CODE128",
        displayValue: false,
        height,
        margin: 0,
      });
    } catch {
      // ignore
    }
  }, [value, height]);

  return <svg ref={ref} />;
}

export default function Labels() {
  const { showToast } = useToast();
  const session = getSession() || {};
  const branchId = session?.branch_id || null;

  const [allowed, setAllowed] = useState(null);
  const [mode, setMode] = useState("item"); // item | lot
  const [size, setSize] = useState("50x25"); // mm
  const [columns, setColumns] = useState(2);
  const [count, setCount] = useState(1);

  const [items, setItems] = useState([]);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedLotId, setSelectedLotId] = useState("");

  const [showPrice, setShowPrice] = useState(true);
  const [showMrp, setShowMrp] = useState(false);

  useEffect(() => {
    api
      .get("/permissions/my")
      .then((r) => {
        const map = modulesToPermMap(r?.data?.modules);
        const ok =
          Boolean(map?.items?.can_read) ||
          Boolean(map?.inventory?.can_read) ||
          Boolean(map?.item_lots?.can_read);
        setAllowed(ok);
      })
      .catch(() => setAllowed(false));
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const res = await api.get("/items/");
      setItems(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setItems([]);
      showToast("Failed to load items", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadLots = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await api.get("/item-lots/", {
        params: { branch_id: branchId, limit: 300 },
      });
      setLots(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setLots([]);
      showToast("Failed to load lots", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    loadItems();
    loadLots();
  }, [allowed]);

  const filteredItems = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) => String(i.item_name || "").toLowerCase().includes(s));
  }, [items, q]);

  const filteredLots = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return lots;
    return lots.filter((l) => {
      return (
        String(l.item_name || "").toLowerCase().includes(s) ||
        String(l.batch_no || "").toLowerCase().includes(s) ||
        String(l.serial_no || "").toLowerCase().includes(s)
      );
    });
  }, [lots, q]);

  const selectedItem = useMemo(
    () => items.find((i) => Number(i.item_id) === Number(selectedItemId)) || null,
    [items, selectedItemId]
  );

  const selectedLot = useMemo(
    () => lots.find((l) => Number(l.lot_id) === Number(selectedLotId)) || null,
    [lots, selectedLotId]
  );

  const labelSpec = useMemo(() => {
    if (size === "50x25") return { w: 50, h: 25 };
    if (size === "40x30") return { w: 40, h: 30 };
    if (size === "80x25") return { w: 80, h: 25 };
    return { w: 50, h: 25 };
  }, [size]);

  const canPrint = mode === "item" ? Boolean(selectedItem) : Boolean(selectedLot);

  const labels = useMemo(() => {
    const n = Math.max(1, Math.min(200, Number(count || 1)));
    const base =
      mode === "item"
        ? {
            title: selectedItem?.item_name,
            price: selectedItem?.price,
            mrp: selectedItem?.mrp_price,
            sub: `ID: ${selectedItem?.item_id}`,
            barcode: String(selectedItem?.item_id || ""),
          }
        : {
            title: selectedLot?.item_name,
            price: null,
            mrp: null,
            sub: [
              selectedLot?.batch_no ? `Batch: ${selectedLot.batch_no}` : null,
              selectedLot?.serial_no ? `SN: ${selectedLot.serial_no}` : null,
              selectedLot?.expiry_date ? `Exp: ${selectedLot.expiry_date}` : null,
              `Lot: ${selectedLot?.lot_id}`,
            ]
              .filter(Boolean)
              .join(" | "),
            barcode: String(
              selectedLot?.serial_no ||
                selectedLot?.batch_no ||
                selectedLot?.lot_id ||
                ""
            ),
          };
    return Array.from({ length: n }, (_, idx) => ({ ...base, _k: idx }));
  }, [mode, count, selectedItem, selectedLot]);

  const print = () => {
    if (!canPrint) return;
    setTimeout(() => window.print(), 100);
  };

  if (allowed === null) {
    return <div className="mt-10 text-center text-sm font-medium text-gray-600">Loading...</div>;
  }
  if (!allowed) {
    return <div className="mt-10 text-center text-sm font-medium text-red-600">You are not authorized to access this page</div>;
  }

  return (
    <div className="space-y-4">
      <style>{`
        #labels-print-area { display: none; }
        @media print {
          body * { visibility: hidden; }
          #labels-print-area, #labels-print-area * { visibility: visible; }
          #labels-print-area {
            display: block !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
          @page { margin: 6mm; }
        }
      `}</style>

      <div id="labels-print-area">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.max(1, Number(columns || 2))}, ${labelSpec.w}mm)`,
            gap: "3mm",
            alignContent: "start",
          }}
        >
          {labels.map((l) => (
            <div
              key={l._k}
              style={{
                width: `${labelSpec.w}mm`,
                height: `${labelSpec.h}mm`,
                border: "1px solid #ddd",
                padding: "2mm",
                boxSizing: "border-box",
                fontFamily: "monospace",
                overflow: "hidden",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: "10px", lineHeight: 1.1 }}>
                {String(l.title || "").slice(0, 28)}
              </div>
              <div style={{ fontSize: "9px", marginTop: "1mm" }}>
                {String(l.sub || "").slice(0, 40)}
              </div>

              {(showPrice || showMrp) && mode === "item" && (
                <div style={{ fontSize: "10px", marginTop: "1mm", display: "flex", justifyContent: "space-between" }}>
                  {showPrice && <span>Price: {money(l.price)}</span>}
                  {showMrp && <span>MRP: {money(l.mrp)}</span>}
                </div>
              )}

              <div style={{ marginTop: "1mm" }}>
                <Barcode value={l.barcode} height={28} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <BackButton />
        <h2 className="text-lg font-bold text-slate-800">Barcode / Labels</h2>
        <button
          onClick={() => (mode === "item" ? loadItems() : loadLots())}
          className="px-3 py-1.5 rounded-lg border bg-white shadow-sm text-[12px]"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4 space-y-3 text-[12px]">
          <div className="text-sm font-semibold">Select</div>
          <div className="grid grid-cols-2 gap-2">
            <select className="border rounded-lg px-2 py-2" value={mode} onChange={(e) => { setMode(e.target.value); setSelectedItemId(""); setSelectedLotId(""); }}>
              <option value="item">Item Labels</option>
              <option value="lot">Lot Labels</option>
            </select>
            <input
              className="border rounded-lg px-2 py-2"
              placeholder="Search..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {mode === "item" ? (
            <select
              className="border rounded-lg px-2 py-2 w-full"
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
            >
              <option value="">Select item</option>
              {filteredItems.map((i) => (
                <option key={i.item_id} value={i.item_id}>
                  {i.item_name}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="border rounded-lg px-2 py-2 w-full"
              value={selectedLotId}
              onChange={(e) => setSelectedLotId(e.target.value)}
            >
              <option value="">Select lot</option>
              {filteredLots.map((l) => (
                <option key={l.lot_id} value={l.lot_id}>
                  {l.item_name} {l.serial_no ? `| SN:${l.serial_no}` : ""} {l.batch_no ? `| B:${l.batch_no}` : ""} {l.expiry_date ? `| Exp:${l.expiry_date}` : ""}
                </option>
              ))}
            </select>
          )}

          {loading && <div className="text-[11px] text-slate-500">Loading...</div>}
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-3 text-[12px]">
          <div className="text-sm font-semibold">Options</div>
          <div className="grid grid-cols-2 gap-2">
            <select className="border rounded-lg px-2 py-2" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="50x25">50x25 mm</option>
              <option value="40x30">40x30 mm</option>
              <option value="80x25">80x25 mm</option>
            </select>
            <input
              type="number"
              className="border rounded-lg px-2 py-2"
              min="1"
              max="6"
              value={columns}
              onChange={(e) => setColumns(e.target.value)}
              placeholder="Columns"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              className="border rounded-lg px-2 py-2"
              min="1"
              max="200"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="Labels"
            />
            <button
              onClick={print}
              disabled={!canPrint}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] disabled:opacity-60"
            >
              Print
            </button>
          </div>

          {mode === "item" && (
            <div className="flex items-center gap-3 text-[12px]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
                Show price
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showMrp} onChange={(e) => setShowMrp(e.target.checked)} />
                Show MRP
              </label>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-2 text-[12px]">
          <div className="text-sm font-semibold">Preview</div>
          {!canPrint ? (
            <div className="text-slate-500">Select an item/lot to preview</div>
          ) : (
            <div className="border rounded-lg p-3">
              <div className="font-semibold">{mode === "item" ? selectedItem?.item_name : selectedLot?.item_name}</div>
              <div className="text-[11px] text-slate-600 mt-1">
                {mode === "item"
                  ? `ID: ${selectedItem?.item_id}`
                  : `${selectedLot?.serial_no ? `SN: ${selectedLot.serial_no} | ` : ""}${selectedLot?.batch_no ? `Batch: ${selectedLot.batch_no} | ` : ""}${selectedLot?.expiry_date ? `Exp: ${selectedLot.expiry_date} | ` : ""}Lot: ${selectedLot?.lot_id}`}
              </div>
              {mode === "item" && showPrice && (
                <div className="mt-1 text-[11px] text-slate-700">Price: {money(selectedItem?.price)}</div>
              )}
              <div className="mt-2">
                <Barcode
                  value={
                    mode === "item"
                      ? String(selectedItem?.item_id || "")
                      : String(selectedLot?.serial_no || selectedLot?.batch_no || selectedLot?.lot_id || "")
                  }
                  height={40}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

