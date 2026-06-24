import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

export default function SetupOnboard() {
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({
    shop_name: "", billing_type: "store", city: "", state: "",
    name: "", email: "", phone: "", message: "",
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validate = () => {
    if (step === 0) {
      if (!form.shop_name.trim()) return "Shop name is required";
      if (!["store", "hotel"].includes(form.billing_type)) return "Select a business type";
    }
    if (step === 1) {
      if (!form.name.trim()) return "Your name is required";
      if (!form.email.includes("@")) return "Enter a valid email";
    }
    return null;
  };

  const next = () => { const e = validate(); if (e) return showToast(e, "error"); setStep(1); };
  const back = () => setStep(0);

  const submit = async () => {
    const e = validate();
    if (e) return showToast(e, "error");
    try {
      setLoading(true);
      const res = await api.post("/platform/onboard/requests", {
        shop_name: form.shop_name, billing_type: form.billing_type,
        city: form.city, state: form.state,
        branch_name: form.shop_name, branch_city: form.city, branch_state: form.state,
        owner_name: form.name, mailid: form.email, mobile: form.phone,
        requester_name: form.name, requester_email: form.email, requester_phone: form.phone,
        business: form.billing_type === "store" ? "Store / Retail" : "Hotel / Restaurant",
        message: form.message,
      });
      setResult(res.data);
      showToast("Request received!", "success");
    } catch (err) {
      showToast(err?.response?.data?.detail || "Request failed", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="ob">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        html,body{height:auto;overflow-y:auto;margin:0}
        #root{min-height:100%}

        .ob{min-height:100vh;font-family:Inter,system-ui,sans-serif;display:flex}

        /* ---- LEFT PANEL ---- */
        .ob-left{
          width:44%;min-height:100vh;position:sticky;top:0;
          background:linear-gradient(160deg,#4338ca 0%,#6366f1 35%,#7c3aed 65%,#a855f7 100%);
          display:flex;flex-direction:column;justify-content:center;
          padding:60px 48px;color:#fff;overflow:hidden;position:relative;
        }
        .ob-left-pattern{position:absolute;inset:0;opacity:.06;background-image:
          radial-gradient(circle at 20% 50%,#fff 1px,transparent 1px),
          radial-gradient(circle at 80% 20%,#fff 1px,transparent 1px),
          radial-gradient(circle at 60% 80%,#fff 1px,transparent 1px);
          background-size:60px 60px,80px 80px,50px 50px}
        .ob-left-glow{position:absolute;width:300px;height:300px;border-radius:50%;background:rgba(255,255,255,.08);filter:blur(80px);top:10%;right:-100px}
        .ob-left-glow2{position:absolute;width:250px;height:250px;border-radius:50%;background:rgba(255,255,255,.06);filter:blur(60px);bottom:15%;left:-80px}

        .ob-left-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.15);font-size:12px;font-weight:700;letter-spacing:.06em;margin-bottom:24px;width:fit-content;backdrop-filter:blur(8px)}
        .ob-left h1{font-size:clamp(2.4rem,4vw,3.4rem);font-weight:900;line-height:.95;letter-spacing:-.04em;margin:0 0 20px;max-width:10ch}
        .ob-left p{font-size:16px;line-height:1.7;opacity:.8;margin:0 0 36px;max-width:340px}

        .ob-perks{display:flex;flex-direction:column;gap:14px}
        .ob-perk{display:flex;align-items:center;gap:12px;font-size:14px;font-weight:600}
        .ob-perk-icon{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;backdrop-filter:blur(8px)}

        /* ---- RIGHT PANEL ---- */
        .ob-right{flex:1;min-height:100vh;background:#fafbfe;display:flex;flex-direction:column}

        .ob-nav{padding:20px 32px;display:flex;align-items:center;justify-content:space-between}
        .ob-logo{font-size:18px;font-weight:900;color:#1e1b4b;letter-spacing:-.02em;text-decoration:none}
        .ob-nav-link{font-size:13px;color:#6366f1;text-decoration:none;font-weight:600}
        .ob-nav-link:hover{text-decoration:underline}

        .ob-form-area{flex:1;display:flex;align-items:center;justify-content:center;padding:20px 32px 60px}
        .ob-form-box{width:min(460px,100%)}

        /* ---- PROGRESS ---- */
        .ob-progress{display:flex;align-items:center;gap:0;margin-bottom:36px}
        .ob-prog-step{display:flex;align-items:center;gap:8px}
        .ob-prog-dot{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #e2e8f0;color:#94a3b8;background:#fff;transition:all .3s}
        .ob-prog-step.active .ob-prog-dot{border-color:#6366f1;color:#6366f1;background:#eef2ff;box-shadow:0 0 0 4px rgba(99,102,241,.1)}
        .ob-prog-step.done .ob-prog-dot{border-color:#10b981;color:#fff;background:#10b981}
        .ob-prog-label{font-size:13px;font-weight:600;color:#cbd5e1}
        .ob-prog-step.active .ob-prog-label{color:#1e1b4b}
        .ob-prog-step.done .ob-prog-label{color:#64748b}
        .ob-prog-line{flex:1;height:2px;background:#e2e8f0;margin:0 14px;border-radius:1px}
        .ob-prog-step.done+.ob-prog-line,.ob-prog-line.done{background:#10b981}

        /* ---- FORM ---- */
        .ob-title{font-size:24px;font-weight:900;color:#0f172a;letter-spacing:-.03em;margin:0 0 4px}
        .ob-subtitle{font-size:14px;color:#94a3b8;margin:0 0 28px}

        .ob-field{margin-bottom:18px}
        .ob-field-label{display:block;font-size:12px;font-weight:700;color:#64748b;letter-spacing:.04em;text-transform:uppercase;margin-bottom:6px}
        .ob-field-input{
          width:100%;padding:12px 16px;border-radius:12px;border:1.5px solid #e2e8f0;
          background:#fff;color:#0f172a;font-size:15px;font-family:inherit;outline:none;
          transition:all .2s;box-sizing:border-box;
        }
        .ob-field-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.08)}
        .ob-field-input::placeholder{color:#cbd5e1}
        .ob-field-textarea{min-height:90px;resize:vertical}

        .ob-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}

        /* ---- TYPE SELECTOR ---- */
        .ob-types{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
        .ob-type{
          padding:20px 16px;border-radius:16px;border:2px solid #e2e8f0;
          background:#fff;cursor:pointer;text-align:center;transition:all .2s;
        }
        .ob-type:hover{border-color:#c7d2fe;background:#fafafe}
        .ob-type.on{border-color:#6366f1;background:#eef2ff;box-shadow:0 0 0 3px rgba(99,102,241,.08)}
        .ob-type-emoji{font-size:36px;margin-bottom:8px}
        .ob-type-name{font-size:14px;font-weight:700;color:#1e1b4b}
        .ob-type .ob-type-name{color:#64748b}
        .ob-type.on .ob-type-name{color:#4338ca}
        .ob-type-desc{font-size:11px;color:#94a3b8;margin-top:4px}

        /* ---- BUTTONS ---- */
        .ob-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:28px}
        .ob-btn{
          display:inline-flex;align-items:center;justify-content:center;gap:6px;
          padding:13px 28px;border-radius:12px;font-weight:700;font-size:14px;
          border:none;cursor:pointer;transition:all .2s;font-family:inherit;text-decoration:none;
        }
        .ob-btn:hover{transform:translateY(-1px)}
        .ob-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .ob-btn-back{background:#f1f5f9;color:#64748b}
        .ob-btn-back:hover{background:#e2e8f0}
        .ob-btn-next{background:#6366f1;color:#fff;box-shadow:0 4px 16px rgba(99,102,241,.3)}
        .ob-btn-next:hover{box-shadow:0 6px 24px rgba(99,102,241,.4)}
        .ob-btn-go{background:#10b981;color:#fff;box-shadow:0 4px 16px rgba(16,185,129,.3)}
        .ob-btn-go:hover{box-shadow:0 6px 24px rgba(16,185,129,.4)}

        /* ---- SUCCESS ---- */
        .ob-done{text-align:center;padding:20px 0}
        .ob-done-icon{font-size:64px;margin-bottom:16px}
        .ob-done-title{font-size:26px;font-weight:900;color:#0f172a;margin:0 0 8px;letter-spacing:-.03em}
        .ob-done-text{font-size:14px;color:#64748b;line-height:1.7;margin:0 0 20px;max-width:360px;margin-left:auto;margin-right:auto}
        .ob-done-text strong{color:#0f172a}
        .ob-done-id{display:inline-flex;padding:8px 18px;border-radius:999px;background:#ecfdf5;border:1px solid #a7f3d0;color:#059669;font-size:13px;font-weight:700;margin-bottom:24px}
        .ob-done-trial{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;background:#eef2ff;color:#4338ca;font-size:13px;font-weight:600;margin-bottom:24px}

        @media(max-width:900px){
          .ob{flex-direction:column}
          .ob-left{width:100%;min-height:auto;padding:40px 24px;position:relative;top:auto}
          .ob-left h1{font-size:2rem}
          .ob-right{min-height:auto}
          .ob-form-area{padding:24px 20px 48px}
        }
        @media(max-width:500px){
          .ob-row,.ob-types{grid-template-columns:1fr}
          .ob-actions{flex-direction:column-reverse}.ob-actions .ob-btn{width:100%}
        }
      `}</style>

      {/* LEFT PANEL */}
      <div className="ob-left">
        <div className="ob-left-pattern" />
        <div className="ob-left-glow" />
        <div className="ob-left-glow2" />
        <div className="ob-left-badge">30 days free trial</div>
        <h1>Start billing in minutes.</h1>
        <p>Set up your shop, get login credentials by email, and start billing immediately. No credit card needed.</p>
        <div className="ob-perks">
          <div className="ob-perk"><span className="ob-perk-icon">⚡</span> Instant activation after approval</div>
          <div className="ob-perk"><span className="ob-perk-icon">🏪</span> Works for retail & restaurants</div>
          <div className="ob-perk"><span className="ob-perk-icon">📱</span> Web, Windows & Android apps</div>
          <div className="ob-perk"><span className="ob-perk-icon">🔓</span> All features unlocked for 30 days</div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="ob-right">
        <nav className="ob-nav">
          <Link className="ob-logo" to="/">Haappii Billing</Link>
          <Link className="ob-nav-link" to="/">← Back to home</Link>
        </nav>

        <div className="ob-form-area">
          <div className="ob-form-box">

            {/* PROGRESS */}
            <div className="ob-progress">
              <div className={`ob-prog-step ${step > 0 ? "done" : "active"}`}>
                <div className="ob-prog-dot">{step > 0 ? "✓" : "1"}</div>
                <span className="ob-prog-label">Business</span>
              </div>
              <div className={`ob-prog-line ${step > 0 ? "done" : ""}`} />
              <div className={`ob-prog-step ${step === 1 ? "active" : result ? "done" : ""}`}>
                <div className="ob-prog-dot">{result ? "✓" : "2"}</div>
                <span className="ob-prog-label">Contact</span>
              </div>
            </div>

            {/* SUCCESS */}
            {result?.request_id ? (
              <div className="ob-done">
                <div className="ob-done-icon">🎉</div>
                <h2 className="ob-done-title">You're all set!</h2>
                <div className="ob-done-id">Request #{result.request_id}</div>
                <p className="ob-done-text">
                  We'll review your request and send login credentials to <strong>{form.email}</strong> shortly.
                </p>
                <div className="ob-done-trial">🎁 30 days free trial included</div>
                <br />
                <Link to="/login" className="ob-btn ob-btn-next" style={{ textDecoration: "none" }}>
                  Go to Login →
                </Link>
              </div>
            ) : step === 0 ? (
              <>
                <h2 className="ob-title">Your business</h2>
                <p className="ob-subtitle">Tell us about the shop you want to set up.</p>

                <div className="ob-field">
                  <label className="ob-field-label">Shop name *</label>
                  <input className="ob-field-input" placeholder="e.g. Sunrise Mart" value={form.shop_name} onChange={(e) => set("shop_name", e.target.value)} />
                </div>

                <label className="ob-field-label" style={{ marginBottom: 8 }}>Business type *</label>
                <div className="ob-types">
                  <button type="button" className={`ob-type ${form.billing_type === "store" ? "on" : ""}`} onClick={() => set("billing_type", "store")}>
                    <div className="ob-type-emoji">🏪</div>
                    <div className="ob-type-name">Store / Retail</div>
                    <div className="ob-type-desc">Counter billing & inventory</div>
                  </button>
                  <button type="button" className={`ob-type ${form.billing_type === "hotel" ? "on" : ""}`} onClick={() => set("billing_type", "hotel")}>
                    <div className="ob-type-emoji">🍽️</div>
                    <div className="ob-type-name">Hotel / Restaurant</div>
                    <div className="ob-type-desc">Table billing, KOT & menu</div>
                  </button>
                </div>

                <div className="ob-row">
                  <div className="ob-field">
                    <label className="ob-field-label">City</label>
                    <input className="ob-field-input" placeholder="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
                  </div>
                  <div className="ob-field">
                    <label className="ob-field-label">State</label>
                    <input className="ob-field-input" placeholder="State" value={form.state} onChange={(e) => set("state", e.target.value)} />
                  </div>
                </div>

                <div className="ob-actions">
                  <Link to="/" style={{ textDecoration: "none" }}><button className="ob-btn ob-btn-back">Cancel</button></Link>
                  <button className="ob-btn ob-btn-next" onClick={next}>Next →</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="ob-title">Your contact</h2>
                <p className="ob-subtitle">We'll send your login credentials to this email.</p>

                <div className="ob-field">
                  <label className="ob-field-label">Full name *</label>
                  <input className="ob-field-input" placeholder="Your name" value={form.name} onChange={(e) => set("name", e.target.value)} />
                </div>
                <div className="ob-field">
                  <label className="ob-field-label">Email *</label>
                  <input className="ob-field-input" placeholder="you@example.com" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
                <div className="ob-field">
                  <label className="ob-field-label">Phone</label>
                  <input className="ob-field-input" placeholder="Optional" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>
                <div className="ob-field">
                  <label className="ob-field-label">Notes (optional)</label>
                  <textarea className="ob-field-input ob-field-textarea" placeholder="Any setup requirements?" value={form.message} onChange={(e) => set("message", e.target.value)} />
                </div>

                <div className="ob-actions">
                  <button className="ob-btn ob-btn-back" onClick={back}>← Back</button>
                  <button className="ob-btn ob-btn-go" onClick={submit} disabled={loading}>
                    {loading ? "Setting up…" : "Create My Shop →"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
