import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

const steps = [
  "Shop Details",
  "Branch Details",
  "User Details",
  "Verification"
];

export default function SetupOnboard() {
  const navigate = useNavigate();
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

    branch_name: "",
    branch_city: "",
    branch_state: "",
    branch_pincode: "",

    admin_name: "",
    admin_username: "",
    admin_password: "",
    verification_code: ""
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

  const update = (k, v) =>
    setForm(prev => ({ ...prev, [k]: v }));

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
    if (step === 0 && !form.shop_name.trim())
      return "Shop name required";
    if (step === 1 && !form.branch_name.trim())
      return "Branch name required";
    if (step === 2 && (!form.admin_username || !form.admin_password))
      return "Admin credentials required";
    if (step === 3 && !form.verification_code)
      return "Verification code required";
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) return showToast(err, "error");
    setStep(s => Math.min(s + 1, steps.length - 1));
  };

  const back = () => setStep(s => Math.max(s - 1, 0));

  const submit = async () => {
    const err = validateStep();
    if (err) return showToast(err, "error");

    try {
      setLoading(true);

      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        fd.append(k, v ?? "");
      });
      if (logoFile) fd.append("logo", logoFile);

      const res = await api.post("/setup/onboard", fd);
      setResult(res.data);
      showToast("Setup completed", "success");
      setTimeout(() => navigate("/"), 1200);
    } catch (e) {
      showToast(e?.response?.data?.detail || "Setup failed", "error");
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
          background: linear-gradient(135deg, #5b7cff, #00e5c0);
          color: #051018;
        }

        .step-line {
          flex: 1;
          height: 2px;
          background: rgba(255,255,255,0.2);
          margin: 0 14px;
        }

        .section-title {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 16px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }

        input {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 14px;
          padding: 12px 14px;
          color: #fff;
          font-size: 14px;
        }

        input::placeholder {
          color: #9aa4c7;
        }

        .info {
          margin-top: 12px;
          padding: 14px;
          border-radius: 14px;
          background: rgba(91,124,255,0.12);
          color: #c7d2ff;
          font-size: 13px;
        }

        .footer {
          display: flex;
          justify-content: space-between;
          margin-top: 36px;
        }

        .btn {
          padding: 12px 22px;
          border-radius: 14px;
          font-weight: 600;
          cursor: pointer;
          border: none;
        }

        .btn-outline {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.25);
          color: #fff;
        }

        .btn-primary {
          background: linear-gradient(135deg, #5b7cff, #7aa2ff);
          color: #fff;
        }

        .btn-success {
          background: linear-gradient(135deg, #00e5c0, #5bffdc);
          color: #051018;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      <div className="card">
        <h1 className="title">Application Setup</h1>
        <p className="subtitle">One-time onboarding • Takes less than 2 minutes</p>

        {/* STEPPER */}
        <div className="stepper">
          {steps.map((_, i) => (
            <div className={`step ${step >= i ? "active" : ""}`} key={i}>
              <div className="step-circle">{i + 1}</div>
              {i < steps.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>

        {/* RESULT */}
        {result && (
          <div className="info">
            ✅ Setup completed successfully. Redirecting to login…
          </div>
        )}

        {/* STEPS */}
        {step === 0 && (
          <>
            <div className="section-title">Shop Details</div>
            <div className="grid">
              <input placeholder="Shop Name *" value={form.shop_name} onChange={e => update("shop_name", e.target.value)} />
              <input placeholder="Owner Name" value={form.owner_name} onChange={e => update("owner_name", e.target.value)} />
              <input placeholder="Mobile" value={form.mobile} onChange={e => update("mobile", e.target.value)} />
              <input placeholder="Email" value={form.mailid} onChange={e => update("mailid", e.target.value)} />
              <input placeholder="City" value={form.city} onChange={e => update("city", e.target.value)} />
              <input placeholder="State" value={form.state} onChange={e => update("state", e.target.value)} />
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
                      background: "rgba(255,255,255,0.10)"
                    }}
                  />
                  <div>
                    Logo selected{logoFile?.name ? `: ${logoFile.name}` : ""}
                  </div>
                </div>
              ) : (
                <span>Optional: Upload a shop logo (PNG/JPG/JPEG)</span>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="section-title">Branch Details</div>
            <div className="grid">
              <input placeholder="Branch Name *" value={form.branch_name} onChange={e => update("branch_name", e.target.value)} />
              <input placeholder="City" value={form.branch_city} onChange={e => update("branch_city", e.target.value)} />
              <input placeholder="State" value={form.branch_state} onChange={e => update("branch_state", e.target.value)} />
              <input placeholder="Pincode" value={form.branch_pincode} onChange={e => update("branch_pincode", e.target.value)} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="section-title">Admin User</div>
            <div className="grid">
              <input placeholder="Admin Name" value={form.admin_name} onChange={e => update("admin_name", e.target.value)} />
              <input placeholder="Username *" value={form.admin_username} onChange={e => update("admin_username", e.target.value)} />
              <input type="password" placeholder="Password *" value={form.admin_password} onChange={e => update("admin_password", e.target.value)} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="section-title">Verification</div>
            <div className="grid">
              <input placeholder="Verification Code *" value={form.verification_code} onChange={e => update("verification_code", e.target.value)} />
            </div>
            <div className="info">
              Enter the verification code provided by the administrator.
            </div>
          </>
        )}

        {/* FOOTER */}
        <div className="footer">
          <button className="btn btn-outline" onClick={back} disabled={step === 0}>
            Back
          </button>

          {step < steps.length - 1 ? (
            <button className="btn btn-primary" onClick={next}>
              Next
            </button>
          ) : (
            <button className="btn btn-success" onClick={submit} disabled={loading}>
              {loading ? "Creating…" : "Complete Setup"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
