import { useState } from "react";
import BackButton from "../components/BackButton";
import { addDocuments, listDocuments, removeDocument } from "../utils/hrmsLocalStore";
import { useToast } from "../components/Toast";

export default function Onboarding() {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    employee_name: "",
    role: "",
    notes: "",
  });
  const [files, setFiles] = useState([]);
  const [docs, setDocs] = useState(listDocuments());

  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    Promise.all(
      picked.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                name: file.name,
                type: file.type || "application/octet-stream",
                size: file.size,
                data: reader.result,
              });
            reader.readAsDataURL(file);
          })
      )
    ).then((res) => setFiles(res));
  };

  const submit = () => {
    if (!form.employee_name.trim()) {
      showToast("Employee name required", "error");
      return;
    }
    if (!files.length) {
      showToast("Attach at least one document", "error");
      return;
    }
    const payload = files.map((f) => ({
      employee_name: form.employee_name.trim(),
      role: form.role.trim(),
      notes: form.notes.trim(),
      ...f,
    }));
    setDocs(addDocuments(payload));
    setFiles([]);
    setForm({ employee_name: "", role: "", notes: "" });
    showToast("Documents stored locally", "success");
  };

  const remove = (id) => {
    setDocs(removeDocument(id));
    showToast("Removed document", "info");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BackButton />
        <h2 className="text-lg font-bold text-slate-800">Onboarding Documents</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-3 space-y-2">
          <div className="text-sm font-semibold">Upload</div>
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Employee name"
            value={form.employee_name}
            onChange={(e) => setForm((p) => ({ ...p, employee_name: e.target.value }))}
          />
          <input
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Role / Department"
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
          />
          <textarea
            className="border rounded-lg px-2 py-1.5 text-[12px] w-full"
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={2}
          />
          <input
            type="file"
            multiple
            onChange={handleFiles}
            className="text-[12px]"
          />
          {files.length > 0 && (
            <div className="text-[12px] text-slate-600">
              Selected: {files.length} file(s)
            </div>
          )}
          <button
            onClick={submit}
            className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-[12px]"
          >
            Save
          </button>
        </div>

        <div className="lg:col-span-2 rounded-xl border bg-white p-3">
          <div className="text-sm font-semibold mb-2">Stored Documents (local)</div>
          <div className="max-h-[520px] overflow-auto space-y-2">
            {docs.length === 0 ? (
              <div className="text-[12px] text-slate-500">No documents saved</div>
            ) : (
              docs.map((d) => (
                <div key={d.id} className="border rounded-lg p-2 text-[12px] bg-gray-50">
                  <div className="flex justify-between gap-2">
                    <div className="font-semibold text-slate-800">{d.employee_name}</div>
                    <button
                      className="px-2 py-1 rounded border text-[11px]"
                      onClick={() => remove(d.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="text-slate-600">
                    {d.role || "Role not set"} • {d.name}
                  </div>
                  {d.notes && <div className="text-slate-500 mt-1">{d.notes}</div>}
                  <a
                    className="text-indigo-600 text-[11px] mt-1 inline-block"
                    href={d.data}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View / Download
                  </a>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
