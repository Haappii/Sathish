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
      showToast("Request received! Our team will activate your shop and email you the credentials shortly.", "success");
    } catch (e) {
      showToast(e?.response?.data?.detail || "Request failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ob-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800;9..144,900&family=Inter:wght@400;500;600;700;800&display=swap');
        html,body{height:auto;overflow-y:auto}
        #root{min-height:100%}

        .ob-root{
          min-height:100vh;
          background:#0f172a;
          color:#f0f2f8;
          font-family:Inter,system-ui,sans-serif;
          display:flex;flex-direction:column;
          overflow-x:hidden;
        }

        /* ---- NAV ---- */
        .ob-nav{
          position:sticky;top:0;z-index:40;
          padding:0 40px;height:64px;
          display:flex;align-items:center;justify-content:space-between;
          background:rgba(15,23,42,.92);backdrop-filter:blur(20px);
          border-bottom:1px solid rgba(255,255,255,.06);
        }
        .ob-brand{display:flex;align-items:center;gap:12px;text-decoration:none}
        .ob-brand-mark{width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#a855f7);box-shadow:0 0 24px rgba(99,102,241,.3)}
        .ob-brand-name{font-family:Fraunces,serif;font-size:20px;font-weight:800;color:#fff;letter-spacing:-.02em}
        .ob-nav-link{font-size:13px;color:rgba(255,255,255,.45);text-decoration:none;font-weight:500;transition:color .2s}
        .ob-nav-link:hover{color:#fff}

        /* ---- HERO SECTION ---- */
        .ob-hero{
          position:relative;overflow:hidden;
          background:linear-gradient(165deg,#0f172a 0%,#1a0a2e 30%,#1e1145 50%,#0f172a 100%);
          padding:60px 24px 48px;text-align:center;
        }
        .ob-hero-glow1{position:absolute;width:500px;height:500px;border-radius:50%;filter:blur(100px);opacity:.4;pointer-events:none;top:-200px;right:-100px;background:radial-gradient(circle,#6366f1,transparent 70%);animation:pulse-glow 5s ease-in-out infinite}
        .ob-hero-glow2{position:absolute;width:400px;height:400px;border-radius:50%;filter:blur(100px);opacity:.25;pointer-events:none;bottom:-150px;left:-80px;background:radial-gradient(circle,#a855f7,transparent 70%);animation:pulse-glow 6s ease-in-out infinite 1s}
        @keyframes pulse-glow{0%,100%{opacity:.25}50%{opacity:.45}}

        .ob-hero-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 18px;border-radius:999px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.2);color:#818cf8;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:20px}
        .ob-hero-title{font-family:Fraunces,serif;font-size:clamp(2rem,5vw,3.2rem);font-weight:900;line-height:.95;letter-spacing:-.04em;color:#fff;margin:0 auto 16px;max-width:14ch;position:relative;z-index:1}
        .ob-hero-title em{font-style:normal;background:linear-gradient(135deg,#6366f1,#a855f7,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .ob-hero-sub{max-width:480px;margin:0 auto;color:rgba(255,255,255,.5);font-size:16px;line-height:1.7;position:relative;z-index:1}

        /* ---- FORM SECTION ---- */
        .ob-body{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:0 24px 80px;margin-top:-20px;position:relative;z-index:2}

        .ob-card{
          width:min(580px,100%);
          background:rgba(255,255,255,.04);
          border:1px solid rgba(255,255,255,.08);
          border-radius:28px;padding:36px;
          backdrop-filter:blur(12px);
          box-shadow:0 40px 80px rgba(0,0,0,.4);
        }

        /* ---- STEPPER ---- */
        .ob-stepper{display:flex;align-items:center;margin-bottom:36px;gap:0}
        .ob-step{display:flex;align-items:center;flex:1;gap:10px}
        .ob-step-circle{
          width:40px;height:40px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:14px;font-weight:700;flex-shrink:0;
          border:2px solid rgba(255,255,255,.1);
          color:rgba(255,255,255,.3);background:rgba(255,255,255,.03);
          transition:all .3s ease;
        }
        .ob-step.active .ob-step-circle{border-color:#6366f1;color:#c7d2fe;background:rgba(99,102,241,.15);box-shadow:0 0 20px rgba(99,102,241,.2)}
        .ob-step.done .ob-step-circle{border-color:#10b981;color:#a7f3d0;background:rgba(16,185,129,.12)}
        .ob-step-label{font-size:13px;font-weight:600;color:rgba(255,255,255,.25);transition:color .3s}
        .ob-step.active .ob-step-label{color:#e2e8f0}
        .ob-step.done .ob-step-label{color:rgba(255,255,255,.4)}
        .ob-step-line{flex:1;height:2px;background:rgba(255,255,255,.06);margin:0 12px 0 10px;border-radius:1px;transition:background .3s}
        .ob-step.done .ob-step-line{background:rgba(16,185,129,.35)}

        /* ---- FORM FIELDS ---- */
        .ob-head{margin-bottom:24px}
        .ob-step-title{font-family:Fraunces,serif;font-size:26px;font-weight:800;margin:0 0 6px;letter-spacing:-.03em;color:#fff}
        .ob-step-sub{color:rgba(255,255,255,.4);font-size:14px;margin:0;line-height:1.6}
        .ob-fields{display:flex;flex-direction:column;gap:14px}
        .ob-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .ob-label{display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}

        .ob-input{
          background:rgba(255,255,255,.05);
          border:1.5px solid rgba(255,255,255,.08);
          color:#f0f2f8;padding:13px 16px;border-radius:14px;
          font-size:15px;outline:none;width:100%;box-sizing:border-box;
          transition:all .2s ease;font-family:inherit;
        }
        .ob-input:focus{border-color:#6366f1;background:rgba(99,102,241,.06);box-shadow:0 0 0 3px rgba(99,102,241,.1)}
        .ob-input::placeholder{color:rgba(255,255,255,.2)}
        .ob-textarea{min-height:100px;resize:vertical}

        /* ---- BUSINESS TYPE ---- */
        .ob-type-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .ob-type-btn{
          padding:20px 16px;border-radius:18px;
          border:1.5px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);color:rgba(255,255,255,.45);
          cursor:pointer;text-align:center;transition:all .25s ease;font-family:inherit;
        }
        .ob-type-btn:hover{border-color:rgba(99,102,241,.3);color:rgba(255,255,255,.7);background:rgba(99,102,241,.05)}
        .ob-type-btn.selected{border-color:#6366f1;background:rgba(99,102,241,.1);color:#c7d2fe;box-shadow:0 0 24px rgba(99,102,241,.12)}
        .ob-type-icon{font-size:32px;margin-bottom:10px}
        .ob-type-label{font-size:14px;font-weight:700}
        .ob-type-sub{font-size:12px;opacity:.6;margin-top:4px}

        /* ---- SUCCESS ---- */
        .ob-success{
          background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);
          border-radius:20px;padding:28px;margin-bottom:20px;text-align:center;
        }
        .ob-success-icon{font-size:48px;margin-bottom:12px}
        .ob-success-title{font-family:Fraunces,serif;font-weight:800;color:#34d399;margin:0 0 8px;font-size:22px;letter-spacing:-.02em}
        .ob-success-text{color:rgba(255,255,255,.5);font-size:14px;margin:0;line-height:1.7}
        .ob-success-text strong{color:#a7f3d0}
        .ob-success-id{display:inline-flex;padding:6px 14px;border-radius:999px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);color:#34d399;font-size:12px;font-weight:700;margin-top:14px;letter-spacing:.05em}

        /* ---- FOOTER ---- */
        .ob-foot{display:flex;justify-content:space-between;align-items:center;margin-top:28px;gap:12px}
        .btn{
          display:inline-flex;align-items:center;justify-content:center;gap:8px;
          padding:13px 26px;border-radius:14px;font-weight:700;font-size:14px;
          border:none;cursor:pointer;transition:all .22s ease;font-family:inherit;text-decoration:none;
        }
        .btn:hover{transform:translateY(-2px)}
        .btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .btn-ghost{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5)}
        .btn-ghost:hover{background:rgba(255,255,255,.08);color:rgba(255,255,255,.7)}
        .btn-primary{background:#6366f1;color:#fff;box-shadow:0 8px 28px rgba(99,102,241,.35)}
        .btn-primary:hover{box-shadow:0 12px 36px rgba(99,102,241,.45)}
        .btn-success{background:linear-gradient(135deg,#10b981,#34d399);color:#052e16;box-shadow:0 8px 28px rgba(16,185,129,.3)}
        .btn-success:hover{box-shadow:0 12px 36px rgba(16,185,129,.4)}

        /* ---- FEATURES ---- */
        .ob-features{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:580px;margin:0 auto;padding:40px 24px 0}
        .ob-feat{text-align:center;padding:16px 12px}
        .ob-feat-icon{font-size:28px;margin-bottom:8px}
        .ob-feat-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:4px}
        .ob-feat-desc{font-size:11px;color:rgba(255,255,255,.35);line-height:1.5}

        /* ---- FOOTER BAR ---- */
        .ob-footer{padding:32px 20px 40px;text-align:center;color:rgba(255,255,255,.2);font-size:12px;border-top:1px solid rgba(255,255,255,.04)}

        @media(max-width:560px){
          .ob-nav{padding:0 20px}
          .ob-hero{padding:40px 20px 36px}
          .ob-card{padding:24px 20px}
          .ob-row,.ob-type-grid{grid-template-columns:1fr}
          .ob-step-label{display:none}
          .ob-features{grid-template-columns:1fr}
          .ob-foot{flex-direction:column-reverse}.ob-foot .btn{width:100%}
        }
      `}</style>

      {/* NAV */}
      <nav className="ob-nav">
        <Link className="ob-brand" to="/">
          <span className="ob-brand-mark" />
          <span className="ob-brand-name">Haappii Billing</span>
        </Link>
        <Link className="ob-nav-link" to="/">← Back to home</Link>
      </nav>

      {/* HERO */}
      <section className="ob-hero">
        <div className="ob-hero-glow1" />
        <div className="ob-hero-glow2" />
        <div className="ob-hero-badge">Free setup in 2 minutes</div>
        <h1 className="ob-hero-title">
          Get your shop <em>live</em> today.
        </h1>
        <p className="ob-hero-sub">
          Register your business and receive login credentials by email. No payment required to start.
        </p>
      </section>

      {/* FEATURES */}
      <div className="ob-features">
        <div className="ob-feat">
          <div className="ob-feat-icon">⚡</div>
          <div className="ob-feat-title">Instant Setup</div>
          <div className="ob-feat-desc">Start billing within minutes of signing up</div>
        </div>
        <div className="ob-feat">
          <div className="ob-feat-icon">🔒</div>
          <div className="ob-feat-title">Secure & Private</div>
          <div className="ob-feat-desc">Your data stays encrypted and protected</div>
        </div>
        <div className="ob-feat">
          <div className="ob-feat-icon">💳</div>
          <div className="ob-feat-title">No Card Required</div>
          <div className="ob-feat-desc">Start free — upgrade when you're ready</div>
        </div>
      </div>

      {/* FORM */}
      <div className="ob-body">
        <div className="ob-card">

          {/* STEPPER */}
          <div className="ob-stepper">
            {STEPS.map((label, i) => (
              <div className={`ob-step ${i < step ? "done" : i === step ? "active" : ""}`} key={label}>
                <div className="ob-step-circle">{i < step ? "✓" : i + 1}</div>
                <span className="ob-step-label">{label}</span>
                {i < STEPS.length - 1 && <div className="ob-step-line" />}
              </div>
            ))}
          </div>

          {/* SUCCESS */}
          {result?.request_id && (
            <div className="ob-success">
              <div className="ob-success-icon">🎉</div>
              <p className="ob-success-title">You're all set!</p>
              <p className="ob-success-text">
                Your shop setup request has been received. We'll review it and send login credentials to <strong>{form.email}</strong> shortly.
              </p>
              <span className="ob-success-id">Request #{result.request_id}</span>
            </div>
          )}

          {/* STEP 0 */}
          {!result?.request_id && step === 0 && (
            <>
              <div className="ob-head">
                <h2 className="ob-step-title">Your business</h2>
                <p className="ob-step-sub">Tell us about the shop you want to set up.</p>
              </div>
              <div className="ob-fields">
                <div>
                  <label className="ob-label">Shop name *</label>
                  <input className="ob-input" placeholder="e.g. Sunrise Mart" value={form.shop_name} onChange={(e) => update("shop_name", e.target.value)} />
                </div>

                <div>
                  <label className="ob-label">Business type *</label>
                  <div className="ob-type-grid">
                    <button type="button" className={`ob-type-btn ${form.billing_type === "store" ? "selected" : ""}`} onClick={() => update("billing_type", "store")}>
                      <div className="ob-type-icon">🏪</div>
                      <div className="ob-type-label">Store / Retail</div>
                      <div className="ob-type-sub">Counter billing, inventory</div>
                    </button>
                    <button type="button" className={`ob-type-btn ${form.billing_type === "hotel" ? "selected" : ""}`} onClick={() => update("billing_type", "hotel")}>
                      <div className="ob-type-icon">🍽️</div>
                      <div className="ob-type-label">Hotel / Restaurant</div>
                      <div className="ob-type-sub">Table billing, KOT, menu</div>
                    </button>
                  </div>
                </div>

                <div className="ob-row">
                  <div>
                    <label className="ob-label">City</label>
                    <input className="ob-input" placeholder="City" value={form.city} onChange={(e) => update("city", e.target.value)} />
                  </div>
                  <div>
                    <label className="ob-label">State</label>
                    <input className="ob-input" placeholder="State" value={form.state} onChange={(e) => update("state", e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* STEP 1 */}
          {!result?.request_id && step === 1 && (
            <>
              <div className="ob-head">
                <h2 className="ob-step-title">Your contact</h2>
                <p className="ob-step-sub">We'll send your login credentials to this email.</p>
              </div>
              <div className="ob-fields">
                <div>
                  <label className="ob-label">Full name *</label>
                  <input className="ob-input" placeholder="Your name" value={form.name} onChange={(e) => update("name", e.target.value)} />
                </div>
                <div>
                  <label className="ob-label">Email *</label>
                  <input className="ob-input" placeholder="you@example.com" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
                </div>
                <div>
                  <label className="ob-label">Phone</label>
                  <input className="ob-input" placeholder="Phone number (optional)" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </div>
                <div>
                  <label className="ob-label">Notes (optional)</label>
                  <textarea className="ob-input ob-textarea" placeholder="Any setup requirements?" value={form.message} onChange={(e) => update("message", e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* FOOTER */}
          <div className="ob-foot">
            {step === 0 ? (
              <Link to="/" style={{ textDecoration: "none" }}>
                <button className="btn btn-ghost">Cancel</button>
              </Link>
            ) : (
              <button className="btn btn-ghost" onClick={back}>← Back</button>
            )}

            {result?.request_id ? (
              <Link to="/login" style={{ textDecoration: "none" }}>
                <button className="btn btn-primary">Go to Login →</button>
              </Link>
            ) : step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={next}>Next →</button>
            ) : (
              <button className="btn btn-success" onClick={submit} disabled={loading}>
                {loading ? "Setting up…" : "Create My Shop →"}
              </button>
            )}
          </div>
        </div>
      </div>

      <footer className="ob-footer">
        Copyright {new Date().getFullYear()} Haappii Billing. All rights reserved.
      </footer>
    </div>
  );
}
