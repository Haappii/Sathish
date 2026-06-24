import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

export default function SetupOnboard() {
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({
    shop_name: "", billing_type: "store", city: "", state: "", pincode: "",
    name: "", email: "", phone: "", message: "",
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const lookupPincode = async (pin) => {
    set("pincode", pin);
    if (pin.length !== 6) return;
    setPinLoading(true);
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      const data = await res.json();
      if (data?.[0]?.Status === "Success" && data[0].PostOffice?.length) {
        const po = data[0].PostOffice[0];
        setForm((p) => ({
          ...p,
          pincode: pin,
          city: po.District || p.city,
          state: po.State || p.state,
        }));
      }
    } catch {} finally { setPinLoading(false); }
  };

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

  const submit = async () => {
    const e = validate();
    if (e) return showToast(e, "error");
    try {
      setLoading(true);
      const res = await api.post("/platform/onboard/requests", {
        shop_name: form.shop_name, billing_type: form.billing_type,
        city: form.city, state: form.state, pincode: form.pincode,
        branch_name: form.shop_name, branch_city: form.city, branch_state: form.state, branch_pincode: form.pincode,
        owner_name: form.name, mailid: form.email, mobile: form.phone,
        requester_name: form.name, requester_email: form.email, requester_phone: form.phone,
        business: form.billing_type === "store" ? "Store / Retail" : "Hotel / Restaurant",
        message: form.message,
      });
      setResult(res.data);
    } catch (err) {
      showToast(err?.response?.data?.detail || "Request failed", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="ob">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800;9..144,900&family=Inter:wght@400;500;600;700;800;900&display=swap');
        html,body{height:auto;overflow-y:auto;margin:0}
        #root{min-height:100%}

        .ob{min-height:100vh;background:#0f172a;color:#f0f2f8;font-family:Inter,system-ui,sans-serif;overflow-x:hidden}

        /* NAV */
        .ob-nav{position:sticky;top:0;z-index:40;padding:0 40px;height:64px;display:flex;align-items:center;justify-content:space-between;background:rgba(15,23,42,.92);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.06)}
        .ob-brand{display:flex;align-items:center;gap:12px;text-decoration:none}
        .ob-brand-mark{width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,var(--accent),#a855f7);box-shadow:0 0 24px rgba(243,109,79,.25)}
        .ob-brand-name{font-family:Fraunces,serif;font-size:20px;font-weight:800;color:#fff}
        .ob-nav-link{font-size:13px;color:rgba(255,255,255,.4);text-decoration:none;font-weight:500}
        .ob-nav-link:hover{color:#fff}
        .ob{--accent:#f36d4f;--mint:#10b981;--purple:#a855f7}

        /* HERO */
        .ob-hero{position:relative;overflow:hidden;text-align:center;padding:72px 24px 56px;background:linear-gradient(165deg,#0f172a 0%,#1a0a2e 35%,#1e1145 55%,#0f172a 100%)}
        .ob-glow1{position:absolute;width:600px;height:600px;border-radius:50%;filter:blur(120px);opacity:.45;pointer-events:none;top:-250px;right:-120px;background:radial-gradient(circle,var(--accent),transparent 70%);animation:gp 5s ease-in-out infinite}
        .ob-glow2{position:absolute;width:500px;height:500px;border-radius:50%;filter:blur(100px);opacity:.2;pointer-events:none;bottom:-200px;left:-100px;background:radial-gradient(circle,var(--purple),transparent 70%);animation:gp 6s ease-in-out infinite 1s}
        @keyframes gp{0%,100%{opacity:.2}50%{opacity:.4}}

        .ob-hero-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 20px;border-radius:999px;background:rgba(243,109,79,.12);border:1px solid rgba(243,109,79,.2);color:var(--accent);font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:24px;position:relative;z-index:1}
        .ob-hero h1{font-family:Fraunces,serif;font-size:clamp(2.6rem,6vw,4.2rem);font-weight:900;line-height:.92;letter-spacing:-.05em;color:#fff;margin:0 auto 20px;max-width:14ch;position:relative;z-index:1}
        .ob-hero h1 em{font-style:normal;background:linear-gradient(135deg,var(--accent),#ff9a56,#ffd97b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .ob-hero p{max-width:520px;margin:0 auto;color:rgba(255,255,255,.5);font-size:17px;line-height:1.7;position:relative;z-index:1}

        /* PERKS */
        .ob-perks{display:flex;justify-content:center;gap:32px;padding:32px 24px 0;position:relative;z-index:1}
        .ob-perk{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:rgba(255,255,255,.7)}
        .ob-perk-dot{width:8px;height:8px;border-radius:50%}

        /* FORM */
        .ob-form-wrap{display:flex;justify-content:center;padding:0 24px 80px;margin-top:-24px;position:relative;z-index:2}
        .ob-card{width:min(560px,100%);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:28px;padding:40px;backdrop-filter:blur(16px);box-shadow:0 40px 80px rgba(0,0,0,.5);margin-top:48px}

        /* STEPS */
        .ob-steps{display:flex;align-items:center;margin-bottom:36px}
        .ob-st{display:flex;align-items:center;gap:10px}
        .ob-st-dot{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;border:2px solid rgba(255,255,255,.1);color:rgba(255,255,255,.25);background:rgba(255,255,255,.03);transition:all .3s}
        .ob-st.on .ob-st-dot{border-color:var(--accent);color:#fff;background:rgba(243,109,79,.15);box-shadow:0 0 20px rgba(243,109,79,.2)}
        .ob-st.ok .ob-st-dot{border-color:var(--mint);color:#fff;background:rgba(16,185,129,.15)}
        .ob-st-text{font-size:13px;font-weight:600;color:rgba(255,255,255,.2)}
        .ob-st.on .ob-st-text{color:#fff}
        .ob-st.ok .ob-st-text{color:rgba(255,255,255,.4)}
        .ob-st-line{flex:1;height:2px;background:rgba(255,255,255,.06);margin:0 14px;border-radius:1px}
        .ob-st.ok+.ob-st-line,.ob-st-line.ok{background:rgba(16,185,129,.3)}

        /* FIELDS */
        .ob-title{font-family:Fraunces,serif;font-size:28px;font-weight:900;color:#fff;letter-spacing:-.04em;margin:0 0 6px}
        .ob-sub{color:rgba(255,255,255,.4);font-size:14px;margin:0 0 28px}
        .ob-fg{margin-bottom:18px}
        .ob-label{display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
        .ob-inp{width:100%;padding:14px 18px;border-radius:14px;border:1.5px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);color:#fff;font-size:15px;font-family:inherit;outline:none;transition:all .2s;box-sizing:border-box}
        .ob-inp:focus{border-color:var(--accent);background:rgba(243,109,79,.04);box-shadow:0 0 0 3px rgba(243,109,79,.08)}
        .ob-inp::placeholder{color:rgba(255,255,255,.2)}
        .ob-ta{min-height:90px;resize:vertical}
        .ob-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
        .ob-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}

        /* TYPE CARDS */
        .ob-types{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
        .ob-tp{padding:24px 16px;border-radius:20px;border:2px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);cursor:pointer;text-align:center;transition:all .25s;font-family:inherit}
        .ob-tp:hover{border-color:rgba(243,109,79,.25);background:rgba(243,109,79,.04)}
        .ob-tp.on{border-color:var(--accent);background:rgba(243,109,79,.08);box-shadow:0 0 30px rgba(243,109,79,.1)}
        .ob-tp-icon{font-size:40px;margin-bottom:10px}
        .ob-tp-name{font-size:15px;font-weight:800;color:rgba(255,255,255,.5)}
        .ob-tp.on .ob-tp-name{color:#fff}
        .ob-tp-desc{font-size:11px;color:rgba(255,255,255,.3);margin-top:4px}

        /* SUCCESS */
        .ob-done{text-align:center;padding:10px 0}
        .ob-done-emoji{font-size:72px;margin-bottom:16px}
        .ob-done h2{font-family:Fraunces,serif;font-size:30px;font-weight:900;color:#fff;margin:0 0 12px;letter-spacing:-.04em}
        .ob-done-msg{color:rgba(255,255,255,.5);font-size:14px;line-height:1.7;margin:0 0 24px}
        .ob-done-msg strong{color:#fff}
        .ob-creds{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:20px;margin-bottom:20px;text-align:left}
        .ob-cred-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)}
        .ob-cred-row:last-child{border-bottom:none}
        .ob-cred-label{font-size:12px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em}
        .ob-cred-val{font-size:15px;font-weight:700;color:#fff;font-family:monospace}
        .ob-trial-badge{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:12px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);color:#34d399;font-size:14px;font-weight:700;margin-bottom:24px}

        /* BUTTONS */
        .ob-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:28px}
        .ob-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 28px;border-radius:16px;font-weight:700;font-size:15px;border:none;cursor:pointer;transition:all .22s;font-family:inherit;text-decoration:none}
        .ob-btn:hover{transform:translateY(-2px)}
        .ob-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .ob-btn-ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5)}
        .ob-btn-ghost:hover{background:rgba(255,255,255,.1);color:#fff}
        .ob-btn-primary{background:linear-gradient(135deg,var(--accent),#ff9a56);color:#fff;box-shadow:0 8px 30px rgba(243,109,79,.35)}
        .ob-btn-primary:hover{box-shadow:0 12px 40px rgba(243,109,79,.5)}
        .ob-btn-go{background:linear-gradient(135deg,var(--mint),#34d399);color:#052e16;box-shadow:0 8px 30px rgba(16,185,129,.3)}
        .ob-btn-go:hover{box-shadow:0 12px 40px rgba(16,185,129,.4)}

        .ob-footer{padding:36px 20px 44px;text-align:center;color:rgba(255,255,255,.2);font-size:12px;border-top:1px solid rgba(255,255,255,.04)}

        @media(max-width:600px){
          .ob-nav{padding:0 20px}
          .ob-card{padding:24px 20px}
          .ob-row{grid-template-columns:1fr}
          .ob-row2{grid-template-columns:1fr}
          .ob-types{grid-template-columns:1fr}
          .ob-perks{flex-direction:column;align-items:center;gap:12px}
          .ob-foot{flex-direction:column-reverse}.ob-foot .ob-btn{width:100%}
          .ob-st-text{display:none}
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
        <div className="ob-glow1" />
        <div className="ob-glow2" />
        <div className="ob-hero-badge">Free for 30 days — no card required</div>
        <h1>Get your shop <em>live</em> in minutes.</h1>
        <p>Register your business, receive instant login credentials, and start billing today. All features unlocked.</p>
        <div className="ob-perks">
          <span className="ob-perk"><span className="ob-perk-dot" style={{ background: "var(--accent)" }} /> Instant activation</span>
          <span className="ob-perk"><span className="ob-perk-dot" style={{ background: "var(--mint)" }} /> All features unlocked</span>
          <span className="ob-perk"><span className="ob-perk-dot" style={{ background: "var(--purple)" }} /> Web + Desktop + Mobile</span>
        </div>
      </section>

      {/* FORM */}
      <div className="ob-form-wrap">
        <div className="ob-card">

          <div className="ob-steps">
            <div className={`ob-st ${step > 0 || result ? "ok" : "on"}`}>
              <div className="ob-st-dot">{step > 0 || result ? "✓" : "1"}</div>
              <span className="ob-st-text">Business</span>
            </div>
            <div className={`ob-st-line ${step > 0 || result ? "ok" : ""}`} />
            <div className={`ob-st ${step === 1 && !result ? "on" : result ? "ok" : ""}`}>
              <div className="ob-st-dot">{result ? "✓" : "2"}</div>
              <span className="ob-st-text">Contact</span>
            </div>
          </div>

          {/* SUCCESS */}
          {result?.shop_id ? (
            <div className="ob-done">
              <div className="ob-done-emoji">🎉</div>
              <h2>Your shop is live!</h2>
              <p className="ob-done-msg">Login credentials have been sent to <strong>{form.email}</strong></p>

              <div className="ob-creds">
                <div className="ob-cred-row">
                  <span className="ob-cred-label">Shop ID</span>
                  <span className="ob-cred-val">{result.shop_id}</span>
                </div>
                <div className="ob-cred-row">
                  <span className="ob-cred-label">Username</span>
                  <span className="ob-cred-val">{result.username}</span>
                </div>
                <div className="ob-cred-row">
                  <span className="ob-cred-label">Password</span>
                  <span className="ob-cred-val">{result.password}</span>
                </div>
              </div>

              <div className="ob-trial-badge">🎁 Free trial until {result.trial_ends}</div>
              <br />
              <Link to="/login" className="ob-btn ob-btn-primary" style={{ textDecoration: "none", display: "inline-flex" }}>
                Login Now →
              </Link>
            </div>
          ) : result?.request_id ? (
            <div className="ob-done">
              <div className="ob-done-emoji">📩</div>
              <h2>Request received!</h2>
              <p className="ob-done-msg">Request #{result.request_id} — we'll send credentials to <strong>{form.email}</strong> shortly.</p>
              <Link to="/" className="ob-btn ob-btn-ghost" style={{ textDecoration: "none", display: "inline-flex" }}>
                Back to Home
              </Link>
            </div>
          ) : step === 0 ? (
            <>
              <h2 className="ob-title">Your business</h2>
              <p className="ob-sub">Tell us about the shop you want to set up.</p>

              <div className="ob-fg">
                <label className="ob-label">Shop name *</label>
                <input className="ob-inp" placeholder="e.g. Sunrise Mart" value={form.shop_name} onChange={(e) => set("shop_name", e.target.value)} />
              </div>

              <label className="ob-label" style={{ marginBottom: 10 }}>Business type *</label>
              <div className="ob-types">
                <button type="button" className={`ob-tp ${form.billing_type === "store" ? "on" : ""}`} onClick={() => set("billing_type", "store")}>
                  <div className="ob-tp-icon">🏪</div>
                  <div className="ob-tp-name">Store / Retail</div>
                  <div className="ob-tp-desc">Counter billing & inventory</div>
                </button>
                <button type="button" className={`ob-tp ${form.billing_type === "hotel" ? "on" : ""}`} onClick={() => set("billing_type", "hotel")}>
                  <div className="ob-tp-icon">🍽️</div>
                  <div className="ob-tp-name">Hotel / Restaurant</div>
                  <div className="ob-tp-desc">Table billing, KOT & menu</div>
                </button>
              </div>

              <div className="ob-row">
                <div className="ob-fg">
                  <label className="ob-label">Pincode</label>
                  <input className="ob-inp" placeholder="6-digit pincode" maxLength={6} value={form.pincode}
                    onChange={(e) => lookupPincode(e.target.value.replace(/\D/g, ""))} />
                </div>
                <div className="ob-fg">
                  <label className="ob-label">City {pinLoading && "..."}</label>
                  <input className="ob-inp" placeholder="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
                </div>
                <div className="ob-fg">
                  <label className="ob-label">State</label>
                  <input className="ob-inp" placeholder="State" value={form.state} onChange={(e) => set("state", e.target.value)} />
                </div>
              </div>

              <div className="ob-foot">
                <Link to="/" style={{ textDecoration: "none" }}><button className="ob-btn ob-btn-ghost">Cancel</button></Link>
                <button className="ob-btn ob-btn-primary" onClick={next}>Next →</button>
              </div>
            </>
          ) : (
            <>
              <h2 className="ob-title">Your contact</h2>
              <p className="ob-sub">We'll send your login credentials to this email instantly.</p>

              <div className="ob-row2">
                <div className="ob-fg">
                  <label className="ob-label">Full name *</label>
                  <input className="ob-inp" placeholder="Your name" value={form.name} onChange={(e) => set("name", e.target.value)} />
                </div>
                <div className="ob-fg">
                  <label className="ob-label">Phone</label>
                  <input className="ob-inp" placeholder="Optional" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>
              </div>
              <div className="ob-fg">
                <label className="ob-label">Email *</label>
                <input className="ob-inp" placeholder="you@example.com" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="ob-fg">
                <label className="ob-label">Notes (optional)</label>
                <textarea className="ob-inp ob-ta" placeholder="Any setup requirements?" value={form.message} onChange={(e) => set("message", e.target.value)} />
              </div>

              <div className="ob-foot">
                <button className="ob-btn ob-btn-ghost" onClick={() => setStep(0)}>← Back</button>
                <button className="ob-btn ob-btn-go" onClick={submit} disabled={loading}>
                  {loading ? "Creating…" : "Create My Shop →"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="ob-footer">Copyright {new Date().getFullYear()} Haappii Billing. All rights reserved.</footer>
    </div>
  );
}
