import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

const features = [
  {
    icon: "⚡",
    title: "Fast Billing",
    desc: "Process orders in seconds with an intuitive interface built for speed.",
  },
  {
    icon: "🏪",
    title: "Multi-Branch",
    desc: "Manage multiple outlets from a single platform with real-time sync.",
  },
  {
    icon: "📊",
    title: "Rich Reports",
    desc: "Sales, inventory, and expense reports with one-click Excel/PDF export.",
  },
  {
    icon: "📱",
    title: "Mobile & Desktop",
    desc: "Android app, Windows desktop app, and web — all in sync.",
  },
];

export default function About() {
  const { showToast } = useToast();
  const [demoOpen, setDemoOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const [demoForm, setDemoForm] = useState({
    name: "",
    email: "",
    phone: "",
    business: "",
    message: "",
  });

  useEffect(() => {
    document.body.style.overflow = demoOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [demoOpen]);

  const updateDemo = (k, v) => setDemoForm((p) => ({ ...p, [k]: v }));

  const submitDemo = async () => {
    if (!demoForm.name.trim() || !demoForm.email.trim()) {
      showToast("Name and email are required", "error");
      return;
    }
    try {
      setSending(true);
      const payload = new FormData();
      Object.entries(demoForm).forEach(([k, v]) => payload.append(k, v));
      await api.post("/support/demo", payload);
      showToast("Demo request sent!", "success");
      setDemoOpen(false);
      setDemoForm({ name: "", email: "", phone: "", business: "", message: "" });
    } catch (e) {
      showToast(e?.response?.data?.detail || "Failed to send demo request", "error");
    } finally {
      setSending(false);
    }
  };

  const windowsAppUrl = import.meta.env.VITE_WINDOWS_APP_URL || "/downloads/poss-desktop-setup.exe";
  const isWindows = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

  const startWindowsDownload = async () => {
    if (!windowsAppUrl) { showToast("Windows app not configured", "error"); return; }
    try {
      const resolved = new URL(windowsAppUrl, window.location.href);
      if (resolved.origin === window.location.origin) {
        const head = await fetch(resolved.href, { method: "HEAD" });
        const ct = (head.headers.get("content-type") || "").toLowerCase();
        if (!head.ok || ct.includes("text/html")) {
          showToast("Windows installer is not yet available on the server.", "error"); return;
        }
      }
      const a = document.createElement("a");
      a.href = resolved.href;
      a.rel = "noopener noreferrer";
      if (resolved.origin === window.location.origin) a.download = "poss-desktop-setup.exe";
      else a.target = "_blank";
      document.body.appendChild(a); a.click(); a.remove();
      showToast("Download started. Run the installer to install the desktop app.", "success");
    } catch {
      showToast("Unable to start download", "error");
    }
  };

  const openDesktopApp = () => {
    window.location.href = `poss://open?path=${encodeURIComponent("/home")}`;
    showToast("Trying to open the desktop app…", "info");
  };

  return (
    <div className="ab-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,600&family=Inter:wght@400;500;600&display=swap');

        html, body { height: auto; overflow-y: auto; }
        #root { min-height: 100%; }

        .ab-root {
          min-height: 100vh;
          overflow-x: hidden;
          background: #060c1f;
          color: #f1f5f9;
          font-family: Inter, system-ui, sans-serif;
        }

        /* ── NAV ── */
        .ab-nav {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(6,12,31,0.85);
          backdrop-filter: blur(18px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          padding: 0 32px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .ab-logo {
          font-family: Fraunces, serif;
          font-size: 20px;
          background: linear-gradient(135deg, #6b8fff, #34d8b0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.01em;
        }

        .ab-nav-links { display: flex; gap: 10px; }

        /* ── HERO ── */
        .ab-hero {
          max-width: 1160px;
          margin: 0 auto;
          padding: 90px 24px 60px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          align-items: center;
        }

        .ab-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(107,143,255,0.12);
          border: 1px solid rgba(107,143,255,0.35);
          border-radius: 999px;
          padding: 5px 14px;
          font-size: 12px;
          font-weight: 600;
          color: #a5b9ff;
          margin-bottom: 20px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .ab-h1 {
          font-family: Fraunces, serif;
          font-size: clamp(34px, 4vw, 52px);
          line-height: 1.08;
          letter-spacing: -0.025em;
          margin: 0 0 16px;
        }

        .ab-h1 em {
          font-style: italic;
          background: linear-gradient(135deg, #6b8fff 20%, #34d8b0 80%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .ab-sub {
          color: #8896b8;
          font-size: 16px;
          line-height: 1.75;
          max-width: 480px;
          margin: 0 0 28px;
        }

        .ab-actions { display: flex; gap: 10px; flex-wrap: wrap; }

        .ab-img-wrap {
          border-radius: 22px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 40px 90px rgba(0,0,0,0.5);
          background: rgba(255,255,255,0.04);
          padding: 28px;
        }

        .ab-hero-card {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .ab-hero-title {
          font-family: Fraunces, serif;
          font-size: 24px;
          margin: 0;
        }

        .ab-hero-copy {
          color: #9aa7c7;
          margin: 0;
          line-height: 1.7;
          font-size: 14px;
        }

        .ab-hero-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(52,216,176,0.35);
          background: rgba(52,216,176,0.12);
          color: #7ef1d1;
          font-size: 12px;
          font-weight: 600;
          width: fit-content;
        }

        /* ── BUTTONS ── */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 11px 20px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 14px;
          border: none;
          cursor: pointer;
          transition: transform .18s, box-shadow .18s;
          text-decoration: none;
        }
        .btn:hover { transform: translateY(-2px); }

        .btn-primary {
          background: linear-gradient(135deg, #5b7cff, #7aa2ff);
          color: #fff;
          box-shadow: 0 8px 28px rgba(91,124,255,0.38);
        }
        .btn-primary:hover { box-shadow: 0 12px 36px rgba(91,124,255,0.5); }

        .btn-ghost {
          background: rgba(255,255,255,0.07);
          color: #e2e8f0;
          border: 1px solid rgba(255,255,255,0.14);
        }
        .btn-ghost:hover { background: rgba(255,255,255,0.11); }

        .btn-teal {
          background: linear-gradient(135deg, #0bc9a0, #34d8b0);
          color: #051018;
          box-shadow: 0 8px 28px rgba(52,216,176,0.32);
        }

        /* ── SECTION ── */
        .ab-section {
          max-width: 1160px;
          margin: 0 auto;
          padding: 72px 24px;
        }

        .ab-sec-label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #6b8fff;
          margin-bottom: 10px;
        }

        .ab-sec-title {
          font-family: Fraunces, serif;
          font-size: clamp(26px, 3vw, 38px);
          letter-spacing: -0.02em;
          margin: 0 0 10px;
        }

        .ab-sec-sub {
          color: #8896b8;
          font-size: 15px;
          line-height: 1.7;
          max-width: 620px;
          margin: 0;
        }

        /* ── FEATURES ── */
        .ab-features {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-top: 40px;
        }

        .ab-feat {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 18px;
          padding: 24px 20px;
          transition: border-color .2s, transform .2s;
        }
        .ab-feat:hover {
          border-color: rgba(107,143,255,0.35);
          transform: translateY(-3px);
        }

        .ab-feat-icon {
          font-size: 28px;
          margin-bottom: 12px;
        }

        .ab-feat-title {
          font-weight: 600;
          font-size: 15px;
          margin: 0 0 7px;
        }

        .ab-feat-desc {
          color: #8896b8;
          font-size: 13px;
          line-height: 1.6;
          margin: 0;
        }

        /* ── DIVIDER ── */
        .ab-divider {
          height: 1px;
          background: rgba(255,255,255,0.07);
          max-width: 1160px;
          margin: 0 auto;
        }

        /* ── DOWNLOADS ── */
        .ab-dl-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 36px;
        }

        .ab-dl-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 20px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .ab-dl-icon { font-size: 32px; }
        .ab-dl-title { font-weight: 600; font-size: 16px; margin: 0; }
        .ab-dl-sub { color: #8896b8; font-size: 13px; line-height: 1.6; margin: 0; flex: 1; }
        .ab-dl-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }

        /* ── GALLERY ── */
        .ab-gallery {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
          gap: 16px;
          margin-top: 36px;
        }

        .ab-shot {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 16px;
          overflow: hidden;
          transition: transform .22s, border-color .22s;
        }
        .ab-shot:hover {
          transform: translateY(-5px);
          border-color: rgba(107,143,255,0.3);
        }
        .ab-shot img { width: 100%; display: block; }
        .ab-shot-label {
          padding: 11px 14px;
          font-size: 13px;
          font-weight: 500;
          color: #cbd5e1;
        }

        /* ── CTA BANNER ── */
        .ab-cta {
          background: linear-gradient(135deg, rgba(91,124,255,0.18), rgba(52,216,176,0.12));
          border: 1px solid rgba(107,143,255,0.25);
          border-radius: 24px;
          padding: 48px 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }

        .ab-cta h3 {
          font-family: Fraunces, serif;
          font-size: 28px;
          letter-spacing: -0.02em;
          margin: 0 0 8px;
        }

        .ab-cta p { color: #8896b8; margin: 0; font-size: 15px; }

        /* ── FOOTER ── */
        .ab-footer {
          text-align: center;
          padding: 32px 24px;
          border-top: 1px solid rgba(255,255,255,0.07);
          color: #475569;
          font-size: 13px;
        }

        /* ── MODAL ── */
        .ab-modal-bg {
          position: fixed;
          inset: 0;
          background: rgba(4,8,22,0.88);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 16px;
        }

        .ab-modal {
          background: #0d1529;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 22px;
          padding: 32px;
          width: min(500px, 100%);
          box-shadow: 0 40px 100px rgba(0,0,0,0.6);
        }

        .ab-modal h3 {
          font-family: Fraunces, serif;
          font-size: 22px;
          margin: 0 0 6px;
        }

        .ab-modal p { color: #8896b8; font-size: 14px; margin: 0 0 20px; }

        .ab-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .ab-form-grid input,
        .ab-form-grid textarea {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          color: #f1f5f9;
          padding: 11px 13px;
          border-radius: 12px;
          font-size: 14px;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          transition: border-color .18s;
        }

        .ab-form-grid input:focus,
        .ab-form-grid textarea:focus {
          border-color: rgba(107,143,255,0.5);
        }

        .ab-form-grid input::placeholder,
        .ab-form-grid textarea::placeholder { color: rgba(241,245,249,0.4); }

        .ab-form-grid .span2 { grid-column: span 2; }
        .ab-form-grid textarea { min-height: 80px; resize: vertical; }

        .ab-modal-foot {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 18px;
        }

        .ab-steps {
          padding-left: 18px;
          margin: 10px 0 0;
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.7;
        }

        @media (max-width: 900px) {
          .ab-hero { grid-template-columns: 1fr; }
          .ab-features { grid-template-columns: 1fr 1fr; }
          .ab-dl-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 580px) {
          .ab-features { grid-template-columns: 1fr; }
          .ab-form-grid { grid-template-columns: 1fr; }
          .ab-form-grid .span2 { grid-column: span 1; }
          .ab-cta { flex-direction: column; text-align: center; }
          .ab-nav-links .btn-ghost { display: none; }
        }
      `}</style>

      {/* NAV */}
      <nav className="ab-nav">
        <span className="ab-logo">Haappii Billing</span>
        <div className="ab-nav-links">
          <Link to="/setup/onboard">
            <button className="btn btn-ghost" style={{ fontSize: 13, padding: "8px 16px" }}>
              Get Started
            </button>
          </Link>
          <Link to="/">
            <button className="btn btn-primary" style={{ fontSize: 13, padding: "8px 16px" }}>
              Login
            </button>
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="ab-hero">
        <div>
          <div className="ab-badge">✦ Next-Gen POS Platform</div>
          <h1 className="ab-h1">
            Billing made <em>fast,</em><br />simple & smart
          </h1>
          <p className="ab-sub">
            Haappii Billing is a premium POS and operations platform for retail stores
            and restaurants — built for speed, clarity, and multi-branch control.
          </p>
          <div className="ab-actions">
            <button className="btn btn-primary" onClick={() => setDemoOpen(true)}>
              Book a Demo
            </button>
            <Link to="/setup/onboard">
              <button className="btn btn-ghost">Application Setup</button>
            </Link>
            <button
              className="btn btn-ghost"
              onClick={() => document.getElementById("downloads")?.scrollIntoView({ behavior: "smooth" })}
            >
              Download App
            </button>
          </div>
        </div>

        <div className="ab-img-wrap">
          <div className="ab-hero-card">
            <div className="ab-hero-pill">Offline Ready</div>
            <h3 className="ab-hero-title">Operate without slowdowns</h3>
            <p className="ab-hero-copy">
              Fast billing, multi-branch visibility, and strong reporting without juggling tools.
            </p>
            <p className="ab-hero-copy">
              Desktop and web stay in sync, even across multiple counters.
            </p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="ab-section" style={{ paddingTop: 0 }}>
        <div className="ab-sec-label">Why Haappii</div>
        <h2 className="ab-sec-title">Everything your business needs</h2>
        <p className="ab-sec-sub">
          From fast counter billing to detailed branch-level reports — one platform handles it all.
        </p>
        <div className="ab-features">
          {features.map((f) => (
            <div className="ab-feat" key={f.title}>
              <div className="ab-feat-icon">{f.icon}</div>
              <p className="ab-feat-title">{f.title}</p>
              <p className="ab-feat-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="ab-divider" />

      {/* DOWNLOADS */}
      <section className="ab-section" id="downloads">
        <div className="ab-sec-label">Downloads</div>
        <h2 className="ab-sec-title">Available on every platform</h2>
        <p className="ab-sec-sub">
          Use Haappii Billing on Android, Windows desktop, or any browser — all in sync.
        </p>

        <div className="ab-dl-grid">
          <div className="ab-dl-card">
            <div className="ab-dl-icon">📱</div>
            <p className="ab-dl-title">Android App</p>
            <p className="ab-dl-sub">
              Mobile APK is coming soon — under construction.
            </p>
            <div className="ab-dl-actions">
              <button className="btn btn-ghost" disabled>
                Coming Soon
              </button>
            </div>
          </div>

          <div className="ab-dl-card">
            <div className="ab-dl-icon">🖥️</div>
            <p className="ab-dl-title">Windows Desktop App</p>
            <p className="ab-dl-sub">
              {isWindows
                ? "You're on Windows — download and run the installer."
                : "Download the Windows installer and run it on any Windows PC."}
            </p>
            <div className="ab-dl-actions">
              <button className="btn btn-primary" onClick={startWindowsDownload}>
                Download EXE
              </button>
              <button className="btn btn-ghost" onClick={openDesktopApp}>
                Open App
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="ab-section" style={{ paddingTop: 0 }}>
        <div className="ab-cta">
          <div>
            <h3>Ready to upgrade your billing?</h3>
            <p>Deploy Haappii Billing across your branches in days, not months.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-teal" onClick={() => setDemoOpen(true)}>
              Book a Demo
            </button>
            <Link to="/setup/onboard">
              <button className="btn btn-ghost">Get Started</button>
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ab-footer">
        © {new Date().getFullYear()} Haappii Billing. All rights reserved.
      </footer>

      {/* DEMO MODAL */}
      {demoOpen && (
        <div className="ab-modal-bg" onClick={() => !sending && setDemoOpen(false)}>
          <div className="ab-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Book a Live Demo</h3>
            <p>Fill in your details and we'll get back to you shortly.</p>
            <div className="ab-form-grid">
              <input placeholder="Your name *" onChange={(e) => updateDemo("name", e.target.value)} />
              <input placeholder="Email *" type="email" onChange={(e) => updateDemo("email", e.target.value)} />
              <input placeholder="Phone" onChange={(e) => updateDemo("phone", e.target.value)} />
              <input placeholder="Business name" onChange={(e) => updateDemo("business", e.target.value)} />
              <textarea className="span2" placeholder="Message (optional)" onChange={(e) => updateDemo("message", e.target.value)} />
            </div>
            <div className="ab-modal-foot">
              <button className="btn btn-ghost" onClick={() => setDemoOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitDemo} disabled={sending}>
                {sending ? "Sending…" : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
