import { useEffect, useState } from "react";

import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

const steps = ["Business", "Branch", "Contact"];

export default function SetupOnboard() {
  const { showToast } = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({
    shop_name: "",
    owner_name: "",
    mobile: "",
    mailid: "",
    city: "",
    state: "",
    billing_type: "store",

    branch_name: "",
    branch_city: "",
    branch_state: "",
    branch_pincode: "",

    requester_name: "",
    requester_email: "",
    requester_phone: "",
    business: "",
    message: "",
  });

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setLogoFile(null);
      return;
    }

    const okType =
      file.type === "image/png" ||
      file.type === "image/jpeg" ||
      /\.(png|jpe?g)$/i.test(file.name || "");

    if (!okType) {
      showToast("Logo must be PNG or JPG/JPEG", "error");
      e.target.value = "";
      setLogoFile(null);
      return;
    }

    setLogoFile(file);
  };

  const validateStep = () => {
    if (step === 0 && !form.shop_name.trim()) return "Shop name required";
    if (step === 0 && !["store", "hotel"].includes(String(form.billing_type || "").toLowerCase())) {
      return "Business type required";
    }
    if (step === 1 && !form.branch_name.trim()) return "Branch name required";
    if (step === 2 && !form.business.trim()) return "Business type required";
    if (step === 2 && !String(form.requester_email || "").includes("@")) return "Valid email required";
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) return showToast(err, "error");
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    const err = validateStep();
    if (err) return showToast(err, "error");

    try {
      setLoading(true);

      // Backend currently accepts JSON for platform onboarding requests.
      // If logo is needed, we can extend backend later; for now send JSON.
      const res = await api.post("/platform/onboard/requests", {
        ...form,
        shop_name: form.shop_name,
        branch_name: form.branch_name,
        billing_type: String(form.billing_type || "store").toLowerCase(),
      });

      setResult(res.data);
      showToast("Request sent. Admin will review your request.", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Request failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboard-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Inter:wght@400;500;600&display=swap');

        html, body {
          height: auto;
          overflow-y: auto;
        }

        .onboard-root {
          min-height: 100vh;
          background:
            radial-gradient(900px 400px at 10% -10%, rgba(91,124,255,0.25), transparent 60%),
            radial-gradient(600px 300px at 90% 10%, rgba(0,229,192,0.2), transparent 50%),
            #050b1e;
          padding: 60px 16px;
          color: #f8fafc;
          font-family: Inter, system-ui, sans-serif;
        }

        .card {
          max-width: 860px;
          margin: auto;
          background: linear-gradient(180deg, rgba(255,255,255,0.10), transparent);
          backdrop-filter: blur(20px);
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,0.15);
          padding: 36px;
          box-shadow: 0 40px 100px rgba(0,0,0,0.45);
        }

        .title {
          font-family: Fraunces, serif;
          font-size: 34px;
          margin-bottom: 6px;
        }

        .subtitle {
          color: #9aa4c7;
          margin-bottom: 32px;
        }

        .stepper {
          display: flex;
          align-items: center;
          margin-bottom: 36px;
        }

        .step {
          flex: 1;
          display: flex;
          align-items: center;
        }

        .step-circle {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.25);
        }

        .step.active .step-circle {
          background: rgba(0,229,192,0.15);
          border-color: rgba(0,229,192,0.5);
          color: #a7f3d0;
        }

        .step-line {
          flex: 1;
          height: 2px;
          background: rgba(255,255,255,0.12);
          margin: 0 12px;
        }

        .step.active .step-line {
          background: rgba(0,229,192,0.45);
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        input, textarea {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.15);
          color: #f8fafc;
          padding: 12px 12px;
          border-radius: 14px;
          outline: none;
          font-size: 14px;
        }

        textarea { grid-column: 1 / -1; min-height: 110px; resize: vertical; }

        input::placeholder, textarea::placeholder { color: rgba(248,250,252,0.55); }

        .section-title { margin: 10px 0 14px; font-weight: 600; color: #e5e7eb; }

        .info {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          color: #cbd5e1;
          font-size: 13px;
        }

        .footer {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-top: 22px;
        }

        .btn {
          border-radius: 16px;
          padding: 12px 16px;
          font-weight: 600;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.06);
          color: #f8fafc;
          cursor: pointer;
        }

        .btn-primary {
          background: rgba(91,124,255,0.25);
          border-color: rgba(91,124,255,0.45);
        }

        .btn-success {
          background: rgba(0,229,192,0.18);
          border-color: rgba(0,229,192,0.45);
        }

        .btn:disabled { opacity: 0.6; cursor: not-allowed; }

        @media (max-width: 720px) {
          .grid { grid-template-columns: 1fr; }
          .card { padding: 22px; }
        }
      `}</style>

      <div className="card">
        <h1 className="title">Request Onboarding</h1>
        <p className="subtitle">No verification code. Submit request and we will activate your shop.</p>

        <div className="stepper">
          {steps.map((_, i) => (
            <div className={`step ${step >= i ? "active" : ""}`} key={i}>
              <div className="step-circle">{i + 1}</div>
              {i < steps.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>

        {result?.request_id ? (
          <div className="info">
            Request created: #{result.request_id}. Admin will review the request. Check your registered email for updates.
          </div>
        ) : null}

        {step === 0 && (
          <>
            <div className="section-title">Business</div>
            <div className="grid">
              <input placeholder="Shop Name *" value={form.shop_name} onChange={(e) => update("shop_name", e.target.value)} />
              <input placeholder="Owner Name" value={form.owner_name} onChange={(e) => update("owner_name", e.target.value)} />
              <input placeholder="Mobile" value={form.mobile} onChange={(e) => update("mobile", e.target.value)} />
              <input placeholder="Email" value={form.mailid} onChange={(e) => update("mailid", e.target.value)} />
              <input placeholder="City" value={form.city} onChange={(e) => update("city", e.target.value)} />
              <input placeholder="State" value={form.state} onChange={(e) => update("state", e.target.value)} />
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="billing_type"
                    value="store"
                    checked={String(form.billing_type || "").toLowerCase() === "store"}
                    onChange={(e) => update("billing_type", e.target.value)}
                  />
                  Store / Retail
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="billing_type"
                    value="hotel"
                    checked={String(form.billing_type || "").toLowerCase() === "hotel"}
                    onChange={(e) => update("billing_type", e.target.value)}
                  />
                  Hotel / Restaurant
                </label>
              </div>
              <input type="file" accept="image/png,image/jpeg" onChange={handleLogoChange} />
            </div>

            <div className="info">
              {logoPreviewUrl ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <img
                    src={logoPreviewUrl}
                    alt="Logo Preview"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      objectFit: "cover",
                      background: "rgba(255,255,255,0.10)",
                    }}
                  />
                  <div>Logo selected{logoFile?.name ? `: ${logoFile.name}` : ""}</div>
                </div>
              ) : (
                <span>Optional: Upload a logo (PNG/JPG/JPEG)</span>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="section-title">Branch</div>
            <div className="grid">
              <input placeholder="Branch Name *" value={form.branch_name} onChange={(e) => update("branch_name", e.target.value)} />
              <input placeholder="City" value={form.branch_city} onChange={(e) => update("branch_city", e.target.value)} />
              <input placeholder="State" value={form.branch_state} onChange={(e) => update("branch_state", e.target.value)} />
              <input placeholder="Pincode" value={form.branch_pincode} onChange={(e) => update("branch_pincode", e.target.value)} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="section-title">Contact</div>
            <div className="grid">
              <input placeholder="Your Name" value={form.requester_name} onChange={(e) => update("requester_name", e.target.value)} />
              <input placeholder="Your Email *" value={form.requester_email} onChange={(e) => update("requester_email", e.target.value)} />
              <input placeholder="Your Phone" value={form.requester_phone} onChange={(e) => update("requester_phone", e.target.value)} />
              <input placeholder="Business Type *" value={form.business} onChange={(e) => update("business", e.target.value)} />
              <textarea placeholder="Message (optional)" value={form.message} onChange={(e) => update("message", e.target.value)} />
            </div>
            <div className="info">
              After approval, you will receive Shop ID and admin credentials from the platform owner.
            </div>
          </>
        )}

        <div className="footer">
          <button className="btn" onClick={back} disabled={step === 0}>
            Back
          </button>

          {step < steps.length - 1 ? (
            <button className="btn btn-primary" onClick={next}>
              Next
            </button>
          ) : (
            <button className="btn btn-success" onClick={submit} disabled={loading}>
              {loading ? "Sending..." : "Send Request"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
