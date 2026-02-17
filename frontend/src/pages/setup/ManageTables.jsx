import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/apiClient";
import { useToast } from "../../components/Toast";
import { isHotelShop } from "../../utils/shopType";
import QRCode from "qrcode";
import {
  FaPlus,
  FaTrash,
  FaEdit,
  FaSave,
  FaTimes,
  FaQrcode,
  FaCopy,
  FaSync,
  FaPrint
} from "react-icons/fa";

const BLUE = "#0B3C8C";

export default function ManageTables() {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [tables, setTables] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [hotelAllowed, setHotelAllowed] = useState(null);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState(null); // { table_id, table_name, token, url }
  const [qrImage, setQrImage] = useState("");

  const [form, setForm] = useState({
    table_name: "",
    capacity: 4
  });

  const [editForm, setEditForm] = useState({
    table_name: "",
    capacity: 4
  });

  /* ================= LOAD TABLES ================= */
  const loadTables = async () => {
    try {
      const res = await api.get(`/tables/branch/${branchId}`);
      setTables(res.data || []);
    } catch {
      showToast("Failed to load tables", "error");
    }
  };

  useEffect(() => {
    let mounted = true;
    api
      .get("/shop/details")
      .then((res) => {
        if (!mounted) return;
        setHotelAllowed(isHotelShop(res.data || {}));
      })
      .catch(() => {
        if (!mounted) return;
        setHotelAllowed(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hotelAllowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTables();
  }, [branchId, hotelAllowed]);

  /* ================= ADD TABLE ================= */
  const addTable = async () => {
    if (!form.table_name) {
      showToast("Table name required", "error");
      return;
    }

    try {
      await api.post("/tables/create", {
        table_name: form.table_name,
        capacity: Number(form.capacity),
        branch_id: Number(branchId)
      });

      setForm({ table_name: "", capacity: 4 });
      loadTables();
      showToast("Table added", "success");
    } catch {
      showToast("Failed to add table", "error");
    }
  };

  /* ================= EDIT ================= */
  const startEdit = (t) => {
    setEditingId(t.table_id);
    setEditForm({
      table_name: t.table_name,
      capacity: t.capacity
    });
  };

  const saveEdit = async (id) => {
    if (!editForm.table_name) {
      showToast("Table name required", "error");
      return;
    }

    try {
      await api.put(`/tables/${id}`, {
        table_name: editForm.table_name,
        capacity: Number(editForm.capacity)
      });

      setEditingId(null);
      loadTables();
      showToast("Table updated", "success");
    } catch {
      showToast("Update failed", "error");
    }
  };

  /* ================= DELETE (TOAST CONFIRM) ================= */
  const requestDelete = (id) => {
    if (confirmDeleteId === id) {
      deleteTable(id);
      setConfirmDeleteId(null);
      return;
    }

    setConfirmDeleteId(id);
    showToast("Tap delete again to confirm", "error");

    setTimeout(() => {
      setConfirmDeleteId(null);
    }, 3000);
  };

  const deleteTable = async (id) => {
    try {
      await api.delete(`/tables/${id}`);
      loadTables();
      showToast("Table deleted", "success");
    } catch {
      showToast("Cannot delete occupied table", "error");
    }
  };

  const buildQrUrl = (token) => {
    const origin = window?.location?.origin || "";
    return `${origin}/qr/${token}`;
  };

  const openQr = async (t, regenerate = false) => {
    setQrOpen(true);
    setQrLoading(true);
    setQrData(null);
    setQrImage("");
    try {
      const res = regenerate
        ? await api.post(`/table-qr/token/regenerate/${t.table_id}`)
        : await api.get(`/table-qr/token/by-table/${t.table_id}`);
      const token = res.data?.token;
      if (!token) throw new Error("Missing token");
      const url = buildQrUrl(token);
      const img = await QRCode.toDataURL(url, { margin: 1, width: 280 });
      setQrData({
        table_id: t.table_id,
        table_name: t.table_name,
        token,
        url,
      });
      setQrImage(img);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to generate QR", "error");
      setQrOpen(false);
    } finally {
      setQrLoading(false);
    }
  };

  const copyQrLink = async () => {
    try {
      if (!qrData?.url) return;
      await navigator.clipboard.writeText(qrData.url);
      showToast("QR link copied", "success");
    } catch {
      showToast("Copy failed", "error");
    }
  };

  const printQr = () => {
    if (!qrData?.url || !qrImage) return;
    const w = window.open("", "QR_PRINT");
    if (!w) {
      showToast("Popup blocked. Allow popups to print QR.", "warning");
      return;
    }
    const title = `Table ${qrData.table_name || qrData.table_id}`;
    w.document.write(`
      <div style="font-family: Arial, sans-serif; padding: 12px; text-align:center;">
        <h2 style="margin:0;">${title}</h2>
        <p style="margin:6px 0 12px; font-size:12px;">Scan to view menu & place order</p>
        <img src="${qrImage}" style="width:260px; height:260px;" />
        <div style="margin-top:10px; font-size:12px; word-break:break-all;">${qrData.url}</div>
      </div>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 200);
  };

  if (hotelAllowed === null) {
    return (
      <div className="mt-10 text-center text-sm font-medium text-gray-600">
        Loading table setup...
      </div>
    );
  }

  if (!hotelAllowed) {
    return (
      <div className="mt-10 text-center space-y-3">
        <p className="text-sm font-medium text-red-600">
          Table management is available only for hotel billing type.
        </p>
        <button
          onClick={() => navigate("/setup/branches", { replace: true })}
          className="px-3 py-1.5 rounded-lg border bg-white text-[12px] hover:bg-gray-100"
        >
          Back to Branches
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/setup/branches", { replace: true })}
          className="px-3 py-2 border rounded-lg text-[12px] hover:bg-gray-50"
        >
          ← Back
        </button>

        <span className="text-lg text-slate-800">
          Manage Tables
        </span>
      </div>

      {/* ADD TABLE */}
      <div className="bg-white p-3 rounded-xl shadow flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500">Table Name</label>
          <input
            placeholder="Table 1"
            value={form.table_name}
            onChange={e =>
              setForm({ ...form, table_name: e.target.value })
            }
            className="border rounded-lg px-3 py-2 w-40"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Seats</label>
          <input
            type="number"
            min="1"
            value={form.capacity}
            onChange={e =>
              setForm({ ...form, capacity: e.target.value })
            }
            className="border rounded-lg px-3 py-2 w-20"
          />
        </div>

        <button
          onClick={addTable}
          className="px-4 py-2 rounded-lg text-white flex items-center gap-2"
          style={{ background: BLUE }}
        >
          <FaPlus /> Add
        </button>
      </div>

      {/* TABLE CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {tables.map(t => (
          <div
            key={t.table_id}
            className="bg-white rounded-xl shadow p-3 flex flex-col gap-2"
          >
            {editingId === t.table_id ? (
              <div className="bg-slate-50 border rounded-lg p-2 space-y-2">
                <input
                  value={editForm.table_name}
                  onChange={e =>
                    setEditForm({ ...editForm, table_name: e.target.value })
                  }
                  className="border rounded px-2 py-1 w-full"
                />

                <input
                  type="number"
                  min="1"
                  value={editForm.capacity}
                  onChange={e =>
                    setEditForm({ ...editForm, capacity: e.target.value })
                  }
                  className="border rounded px-2 py-1 w-full"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(t.table_id)}
                    className="flex-1 bg-emerald-600 text-white py-1.5 rounded text-sm"
                  >
                    <FaSave /> Save
                  </button>

                  <button
                    onClick={() => setEditingId(null)}
                    className="flex-1 bg-gray-200 py-1.5 rounded text-sm"
                  >
                    <FaTimes /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* TABLE NAME (HIGHLIGHTED) */}
                <div className="text-[13px] font-medium text-slate-900 truncate">
                  {t.table_name}
                </div>

                <div className="text-xs text-gray-600">
                  Seats: {t.capacity}
                </div>

                <div className="flex justify-end gap-3 pt-1">
                  <button
                    onClick={() => openQr(t, false)}
                    className="text-slate-700 flex items-center gap-1 text-xs"
                    title="Show QR"
                  >
                    <FaQrcode /> QR
                  </button>

                  <button
                    onClick={() => startEdit(t)}
                    className="text-blue-700 flex items-center gap-1 text-xs"
                  >
                    <FaEdit /> Edit
                  </button>

                  <button
                    onClick={() => requestDelete(t.table_id)}
                    className={`flex items-center gap-1 text-xs ${
                      confirmDeleteId === t.table_id
                        ? "text-red-700 font-semibold"
                        : "text-red-600"
                    }`}
                  >
                    <FaTrash /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {!tables.length && (
          <div className="col-span-full text-center text-gray-400 py-8">
            No tables added
          </div>
        )}
      </div>

      {qrOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setQrOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-800">
                {qrData?.table_name ? `Table ${qrData.table_name}` : "Table QR"}
              </div>
              <button
                type="button"
                onClick={() => setQrOpen(false)}
                className="text-slate-500 hover:text-slate-800"
              >
                ✕
              </button>
            </div>

            {qrLoading ? (
              <div className="text-sm text-slate-500">Generating...</div>
            ) : (
              <>
                <div className="flex items-center justify-center">
                  {qrImage ? (
                    <img
                      src={qrImage}
                      alt="QR"
                      className="w-[280px] h-[280px] border rounded-xl"
                    />
                  ) : (
                    <div className="w-[280px] h-[280px] border rounded-xl flex items-center justify-center text-sm text-slate-500">
                      QR not available
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-slate-500">QR Link</label>
                  <input
                    readOnly
                    value={qrData?.url || ""}
                    className="w-full border rounded-lg px-3 py-2 text-xs"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyQrLink}
                    className="px-3 py-2 rounded-lg border text-[12px] hover:bg-gray-50 flex items-center gap-2"
                  >
                    <FaCopy /> Copy Link
                  </button>
                  <button
                    type="button"
                    onClick={() => qrData && openQr({ table_id: qrData.table_id, table_name: qrData.table_name }, true)}
                    className="px-3 py-2 rounded-lg border text-[12px] hover:bg-gray-50 flex items-center gap-2"
                  >
                    <FaSync /> Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={printQr}
                    className="px-3 py-2 rounded-lg border text-[12px] hover:bg-gray-50 flex items-center gap-2"
                  >
                    <FaPrint /> Print
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
