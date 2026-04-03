import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

const STEPS = ["Business", "Contact"];

export default function SetupOnboard() {
  const { showToast } = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({
    shop_name: "",
    billing_type: "store",
    city: "",
    state: "",
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validateStep = () => {
    if (step === 0) {
      if (!form.shop_name.trim()) return "Shop name is required";
      if (!["store", "hotel"].includes(form.billing_type)) return "Business type is required";
    }
    if (step === 1) {
      if (!form.name.trim()) return "Your name is required";
      if (!form.email.includes("@")) return "A valid email is required";
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) return showToast(err, "error");
    setStep((s) => s + 1);
  };

  const back = () => setStep((s) => s - 1);

  const submit = async () => {
    const err = validateStep();
    if (err) return showToast(err, "error");

    try {
      setLoading(true);
      const res = await api.post("/platform/onboard/requests", {
        shop_name: form.shop_name,
        billing_type: form.billing_type,
        city: form.city,
        state: form.state,
        branch_name: form.shop_name,
        branch_city: form.city,
        branch_state: form.state,
        owner_name: form.name,
        mailid: form.email,
        mobile: form.phone,
        requester_name: form.name,
        requester_email: form.email,
        requester_phone: form.phone,
        business: form.billing_type === "store" ? "Store / Retail" : "Hotel / Restaurant",
        message: form.message,
      });
      setResult(res.data);
      showToast("Request sent! Admin will review and activate your shop.", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Request failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ob-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,600&family=Inter:wght@400;500;600&display=swap');

        html, body { height: auto; overflow-y: auto; }

        .ob-root {
          min-height: 100vh;
          background: #060c1f;
          color: #f1f5f9;
          font-family: Inter, system-ui, sans-serif;
          display: flex;
          flex-direction: column;
        }

        /* NAV */
        .ob-nav {
          padding: 0 32px;
          height: 58px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }

        .ob-logo {
          font-family: Fraunces, serif;
          font-size: 18px;
          background: linear-gradient(135deg, #6b8fff, #34d8b0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .ob-nav-link {
          font-size: 13px;
          color: #8896b8;
          text-decoration: none;
        }
        .ob-nav-link:hover { color: #f1f5f9; }

        /* BODY */
        .ob-body {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 16px;
        }

        .ob-card {
          width: min(560px, 100%);
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px;
          padding: 36px;
          box-shadow: 0 40px 90px rgba(0,0,0,0.45);
        }

        /* STEPPER */
        .ob-stepper {
          display: flex;
          align-items: center;
          margin-bottom: 32px;
        }

        .ob-step {
          display: flex;
          align-items: center;
          flex: 1;
          gap: 10px;
        }

        .ob-step-circle {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 600;
          border: 1.5px solid rgba(255,255,255,0.15);
          color: #64748b;
          background: rgba(255,255,255,0.04);
          flex-shrink: 0;
        }

        .ob-step.done .ob-step-circle {
          background: rgba(52,216,176,0.15);
          border-color: rgba(52,216,176,0.5);
          color: #34d8b0;
        }

        .ob-step.active .ob-step-circle {
          background: rgba(107,143,255,0.2);
          border-color: rgba(107,143,255,0.6);
          color: #a5b9ff;
        }

        .ob-step-label {
          font-size: 13px;
          font-weight: 500;
          color: #475569;
        }

        .ob-step.active .ob-step-label { color: #e2e8f0; }
        .ob-step.done .ob-step-label { color: #64748b; }

        .ob-step-line {
          flex: 1;
          height: 1.5px;
          background: rgba(255,255,255,0.1);
          margin: 0 12px 0 10px;
        }

        .ob-step.done .ob-step-line { background: rgba(52,216,176,0.4); }

        /* FORM */
        .ob-head { margin-bottom: 22px; }

        .ob-step-title {
          font-family: Fraunces, serif;
          font-size: 22px;
          margin: 0 0 5px;
          letter-spacing: -0.015em;
        }

        .ob-step-sub { color: #64748b; font-size: 14px; margin: 0; }

        .ob-fields { display: flex; flex-direction: column; gap: 10px; }

        .ob-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        .ob-input {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: #f1f5f9;
          padding: 11px 14px;
          border-radius: 12px;
          font-size: 14px;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          transition: border-color .18s;
          font-family: inherit;
        }
        .ob-input:focus { border-color: rgba(107,143,255,0.55); }
        .ob-input::placeholder { color: rgba(241,245,249,0.35); }

        .ob-textarea {
          min-height: 90px;
          resize: vertical;
        }

        /* BUSINESS TYPE SELECTOR */
        .ob-type-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .ob-type-btn {
          padding: 14px;
          border-radius: 14px;
          border: 1.5px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: #94a3b8;
          cursor: pointer;
          text-align: left;
          transition: all .18s;
          font-family: inherit;
        }

        .ob-type-btn:hover {
          border-color: rgba(107,143,255,0.35);
          color: #e2e8f0;
        }

        .ob-type-btn.selected {
          border-color: rgba(107,143,255,0.6);
          background: rgba(107,143,255,0.12);
          color: #a5b9ff;
        }

        .ob-type-icon { font-size: 22px; margin-bottom: 6px; }
        .ob-type-label { font-size: 14px; font-weight: 600; }
        .ob-type-sub { font-size: 12px; opacity: .7; margin-top: 2px; }

        /* SUCCESS */
        .ob-success {
          background: rgba(52,216,176,0.08);
          border: 1px solid rgba(52,216,176,0.3);
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 16px;
        }

        .ob-success-title {
          font-weight: 600;
          color: #34d8b0;
          margin: 0 0 6px;
          font-size: 15px;
        }

        .ob-success-text {
          color: #94a3b8;
          font-size: 13px;
          margin: 0;
          line-height: 1.6;
        }

        /* FOOTER */
        .ob-foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 24px;
          gap: 10px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 11px 22px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 14px;
          border: none;
          cursor: pointer;
          transition: transform .18s, opacity .18s;
          font-family: inherit;
        }
        .btn:hover { transform: translateY(-1px); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .btn-ghost {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          color: #94a3b8;
        }

        .btn-primary {
          background: linear-gradient(135deg, #5b7cff, #7aa2ff);
          color: #fff;
          box-shadow: 0 6px 22px rgba(91,124,255,0.35);
        }

        .btn-success {
          background: linear-gradient(135deg, #0bc9a0, #34d8b0);
          color: #051018;
          box-shadow: 0 6px 22px rgba(52,216,176,0.3);
        }

        @media (max-width: 480px) {
          .ob-card { padding: 24px 18px; }
          .ob-row { grid-template-columns: 1fr; }
          .ob-step-label { display: none; }
        }
      `}</style>

      {/* NAV */}
      <nav className="ob-nav">
        <span className="ob-logo">Haappii Billing</span>
        <Link className="ob-nav-link" to="/about">← Back to home</Link>
      </nav>

      <div className="ob-body">
        <div className="ob-card">

          {/* STEPPER */}
          <div className="ob-stepper">
            {STEPS.map((label, i) => (
              <div
                className={`ob-step ${i < step ? "done" : i === step ? "active" : ""}`}
                key={label}
              >
                <div className="ob-step-circle">
                  {i < step ? "✓" : i + 1}
                </div>
                <span className="ob-step-label">{label}</span>
                {i < STEPS.length - 1 && <div className="ob-step-line" />}
              </div>
            ))}
          </div>

          {/* SUCCESS STATE */}
          {result?.request_id && (
            <div className="ob-success">
              <p className="ob-success-title">✓ Request submitted — #{result.request_id}</p>
              <p className="ob-success-text">
                The platform admin will review your request and activate your shop.
                You'll receive your login credentials via email.
              </p>
            </div>
          )}

          {/* STEP 0 — BUSINESS */}
          {!result?.request_id && step === 0 && (
            <>
              <div className="ob-head">
                <h2 className="ob-step-title">Your business</h2>
                <p className="ob-step-sub">Tell us about the shop you want to set up.</p>
              </div>
              <div className="ob-fields">
                <input
                  className="ob-input"
                  placeholder="Shop name *"
                  value={form.shop_name}
                  onChange={(e) => update("shop_name", e.target.value)}
                />

                <div className="ob-type-grid">
                  <button
                    type="button"
                    className={`ob-type-btn ${form.billing_type === "store" ? "selected" : ""}`}
                    onClick={() => update("billing_type", "store")}
                  >
                    <div className="ob-type-icon">🏪</div>
                    <div className="ob-type-label">Store / Retail</div>
                    <div className="ob-type-sub">Counter billing, inventory</div>
                  </button>
                  <button
                    type="button"
                    className={`ob-type-btn ${form.billing_type === "hotel" ? "selected" : ""}`}
                    onClick={() => update("billing_type", "hotel")}
                  >
                    <div className="ob-type-icon">🍽️</div>
                    <div className="ob-type-label">Hotel / Restaurant</div>
                    <div className="ob-type-sub">Table billing, KOT, menu</div>
                  </button>
                </div>

                <div className="ob-row">
                  <input
                    className="ob-input"
                    placeholder="City"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                  <input
                    className="ob-input"
                    placeholder="State"
                    value={form.state}
                    onChange={(e) => update("state", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* STEP 1 — CONTACT */}
          {!result?.request_id && step === 1 && (
            <>
              <div className="ob-head">
                <h2 className="ob-step-title">Your contact</h2>
                <p className="ob-step-sub">We'll send your login credentials to this email.</p>
              </div>
              <div className="ob-fields">
                <input
                  className="ob-input"
                  placeholder="Your name *"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                />
                <input
                  className="ob-input"
                  placeholder="Email *"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                />
                <input
                  className="ob-input"
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                />
                <textarea
                  className="ob-input ob-textarea"
                  placeholder="Any notes for the admin? (optional)"
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                />
              </div>
            </>
          )}

          {/* FOOTER */}
          <div className="ob-foot">
            {step === 0 ? (
              <Link to="/about" style={{ textDecoration: "none" }}>
                <button className="btn btn-ghost">Cancel</button>
              </Link>
            ) : (
              <button className="btn btn-ghost" onClick={back}>← Back</button>
            )}

            {result?.request_id ? (
              <Link to="/" style={{ textDecoration: "none" }}>
                <button className="btn btn-primary">Go to Login →</button>
              </Link>
            ) : step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={next}>
                Next →
              </button>
            ) : (
              <button className="btn btn-success" onClick={submit} disabled={loading}>
                {loading ? "Sending…" : "Submit Request"}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
