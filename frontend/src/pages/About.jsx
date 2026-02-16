import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

/* ---------------- ASSETS ---------------- */
import adminMenu from "../assets/marketing/admin menu.png";
import billing from "../assets/marketing/billing.png";
import branch from "../assets/marketing/branch.png";
import category from "../assets/marketing/category.png";
import dashboard from "../assets/marketing/dashboard.png";
import deletedInvoice from "../assets/marketing/deleted_invoice.png";
import inventory from "../assets/marketing/inventory.png";
import item from "../assets/marketing/item.png";
import login from "../assets/marketing/Login.png";
import report from "../assets/marketing/report.png";
import reports from "../assets/marketing/reports.png";
import runningTable from "../assets/marketing/running table.png";
import tableBilling from "../assets/marketing/table billing.png";
import tablem from "../assets/marketing/tablem.png";
import user from "../assets/marketing/user.png";

/* ---------------- GALLERY ---------------- */
const gallery = [
  { title: "Login Experience", src: login },
  { title: "Admin & Configuration", src: adminMenu },
  { title: "Dashboard Overview", src: dashboard },
  { title: "Sales Billing", src: billing },
  { title: "Table Billing", src: tableBilling },
  { title: "Running Tables", src: runningTable },
  { title: "Branch Management", src: branch },
  { title: "Item Management", src: item },
  { title: "Category Management", src: category },
  { title: "Inventory Operations", src: inventory },
  { title: "User Management", src: user },
  { title: "Reports Hub", src: reports },
  { title: "Invoice Report", src: report },
  { title: "Deleted Invoice", src: deletedInvoice },
  { title: "Table Management", src: tablem }
];

export default function About() {
  const { showToast } = useToast();
  const [demoOpen, setDemoOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  const [demoForm, setDemoForm] = useState({
    name: "",
    email: "",
    phone: "",
    business: "",
    message: ""
  });

  /* ---------------- BODY SCROLL LOCK ---------------- */
  useEffect(() => {
    document.body.style.overflow = demoOpen ? "hidden" : "auto";
    return () => (document.body.style.overflow = "auto");
  }, [demoOpen]);

  const updateDemo = (k, v) =>
    setDemoForm(prev => ({ ...prev, [k]: v }));

  const submitDemo = async () => {
    if (!demoForm.name.trim() || !demoForm.email.trim()) {
      showToast("Name and email are required", "error");
      return;
    }

    try {
      setSending(true);
      const payload = new FormData();
      Object.entries(demoForm).forEach(([k, v]) =>
        payload.append(k, v)
      );
      await api.post("/support/demo", payload);
      showToast("Demo request sent", "success");
      setDemoOpen(false);
      setDemoForm({ name: "", email: "", phone: "", business: "", message: "" });
    } catch (e) {
      showToast(
        e?.response?.data?.detail || "Failed to send demo request",
        "error"
      );
    } finally {
      setSending(false);
    }
  };

  const androidApkUrl =
    import.meta.env.VITE_ANDROID_APK_URL || "/downloads/haappii-billing.apk";
  const iosAppUrl = import.meta.env.VITE_IOS_APP_URL || "";
  const isAndroid =
    typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

  const startAndroidDownload = () => {
    if (!androidApkUrl) {
      showToast("Android app download is not configured", "error");
      return;
    }

    try {
      const canUseDownloadAttr = (() => {
        try {
          const resolved = new URL(androidApkUrl, window.location.href);
          return resolved.origin === window.location.origin;
        } catch {
          return false;
        }
      })();

      const a = document.createElement("a");
      a.href = androidApkUrl;
      a.rel = "noopener noreferrer";
      if (canUseDownloadAttr) {
        a.download = "haappii-billing.apk";
      } else {
        a.target = "_blank";
      }
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (isAndroid) setInstallOpen(true);
      else showToast("Download started. Copy the APK to an Android phone to install.", "success");
    } catch {
      showToast("Unable to start download", "error");
    }
  };

  return (
    <div className="about-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Inter:wght@400;500;600&display=swap');

        /* ---------- SCROLL FIX ---------- */
        html, body {
          height: auto;
          overflow-y: auto;
        }

        #root {
          min-height: 100%;
        }

        .about-root {
          min-height: 100vh;
          overflow-x: hidden;
          overflow-y: auto;
          background:
            radial-gradient(900px 400px at 10% -10%, rgba(91,124,255,0.25), transparent 60%),
            radial-gradient(600px 300px at 90% 10%, rgba(0,229,192,0.2), transparent 50%),
            #050b1e;
          color: #f8fafc;
          font-family: Inter, system-ui, sans-serif;
        }

        /* ---------- HERO ---------- */
        .hero {
          max-width: 1200px;
          margin: auto;
          padding: 96px 24px 64px;
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 32px;
          align-items: center;
        }

        .hero-copy { grid-column: span 6; }

        .hero-title {
          font-family: Fraunces, serif;
          font-size: clamp(36px, 4vw, 56px);
          line-height: 1.05;
          letter-spacing: -0.02em;
          margin-bottom: 18px;
        }

        .hero-title span {
          background: linear-gradient(135deg, #5b7cff, #00e5c0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-sub {
          color: #9aa4c7;
          font-size: 16px;
          line-height: 1.7;
          max-width: 520px;
        }

        .hero-actions {
          margin-top: 28px;
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
        }

        /* ---------- APP DOWNLOAD ---------- */
        .app-card {
          margin-top: 26px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 20px;
          padding: 18px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          box-shadow: 0 30px 80px rgba(0,0,0,0.35);
        }

        .app-title {
          font-family: Fraunces, serif;
          font-size: 20px;
          margin: 0;
        }

        .app-sub {
          color: #9aa4c7;
          font-size: 14px;
          line-height: 1.6;
          margin: 0;
        }

        .app-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 6px;
        }

        .hint {
          font-size: 12px;
          color: rgba(248,250,252,0.72);
        }

        .btn {
          padding: 14px 22px;
          border-radius: 14px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: transform .2s ease, box-shadow .2s ease;
        }

        .btn-primary {
          background: linear-gradient(135deg, #5b7cff, #7aa2ff);
          color: #fff;
          box-shadow: 0 12px 40px rgba(91,124,255,0.35);
        }

        .btn-outline {
          background: transparent;
          color: #fff;
          border: 1px solid rgba(255,255,255,0.25);
        }

        .btn:hover { transform: translateY(-2px); }

        .hero-card {
          grid-column: span 6;
          border-radius: 26px;
          background: linear-gradient(180deg, rgba(255,255,255,0.12), transparent);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.15);
          box-shadow: 0 30px 80px rgba(0,0,0,0.45);
          overflow: hidden;
        }

        .hero-card img { width: 100%; display: block; }

        /* ---------- SECTIONS ---------- */
        .section {
          max-width: 1200px;
          margin: auto;
          padding: 72px 24px;
        }

        .section-title {
          font-family: Fraunces, serif;
          font-size: 36px;
          margin-bottom: 12px;
        }

        .section-sub {
          color: #9aa4c7;
          max-width: 720px;
          line-height: 1.7;
        }

        /* ---------- GALLERY ---------- */
        .gallery {
          margin-top: 36px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px,1fr));
          gap: 22px;
        }

        .shot {
          background: linear-gradient(180deg, rgba(255,255,255,0.08), transparent);
          backdrop-filter: blur(16px);
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.12);
          transition: transform .25s ease;
        }

        .shot:hover { transform: translateY(-6px); }

        .shot-footer {
          padding: 14px;
          font-weight: 600;
          font-size: 14px;
        }

        /* ---------- CTA ---------- */
        .cta {
          background: linear-gradient(135deg, #1a2cff, #00e5c0);
          border-radius: 28px;
          padding: 42px;
          color: #051018;
          display: grid;
          gap: 18px;
          grid-template-columns: 1fr auto;
          align-items: center;
          box-shadow: 0 40px 100px rgba(0,0,0,0.45);
        }

        /* ---------- MODAL ---------- */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(5,11,30,0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
        }

        .modal-card {
          background: #0b1430;
          border-radius: 22px;
          padding: 28px;
          width: min(520px, 100%);
          border: 1px solid rgba(255,255,255,0.15);
        }

        .modal-card input,
        .modal-card textarea {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.18);
          color: #fff;
          padding: 12px;
          border-radius: 12px;
          width: 100%;
        }

        .modal-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-top: 12px;
        }

        .modal-grid textarea {
          grid-column: span 2;
          min-height: 90px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 16px;
        }

        .steps {
          margin-top: 10px;
          padding-left: 18px;
          color: rgba(248,250,252,0.85);
          font-size: 13px;
          line-height: 1.6;
        }

        @media (max-width: 900px) {
          .hero { grid-template-columns: 1fr; }
          .hero-copy, .hero-card { grid-column: span 12; }
        }

        @media (max-width: 640px) {
          .modal-grid { grid-template-columns: 1fr; }
          .modal-grid textarea { grid-column: span 1; }
        }
      `}</style>

      {/* ---------- HERO ---------- */}
      <section className="hero">
        <div className="hero-copy">
          <h1 className="hero-title">
            Haappii Billing is the <span>next-gen POS</span><br />
            for modern businesses
          </h1>
          <p className="hero-sub">
            A premium billing and operations platform built for retail
            and hospitality brands that value speed, clarity, and control.
          </p>

          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => setDemoOpen(true)}>
              Book Live Demo
            </button>
            <Link to="/">
              <button className="btn btn-outline">Application Login</button>
            </Link>
            <Link to="/setup/onboard">
              <button className="btn btn-outline">Application Setup</button>
            </Link>
            <button
              className="btn btn-outline"
              onClick={() =>
                document
                  .getElementById("mobile-app")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Download Mobile App
            </button>
          </div>
        </div>

        <div className="hero-card">
          <img src={login} alt="Haappii Billing Login" />
        </div>
      </section>

      {/* ---------- MOBILE APP ---------- */}
      <section className="section" id="mobile-app">
        <h2 className="section-title">Get the Mobile App</h2>
        <p className="section-sub">
          Download and install the Haappii Billing mobile application for faster billing and on-the-go access.
        </p>

        <div className="app-card">
          <h3 className="app-title">Mobile App Download</h3>
          <p className="app-sub">
            {isAndroid
              ? "You are on Android. Tap Download, then follow the install steps."
              : "Use Android APK download, or install via iOS link if provided."}
          </p>

          <div className="app-actions">
            <button className="btn btn-primary" onClick={startAndroidDownload}>
              Download Android (APK)
            </button>
            {iosAppUrl ? (
              <a
                className="btn btn-outline"
                href={iosAppUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                iOS App Link
              </a>
            ) : null}
          </div>

          <div className="hint">
            Admin note: set <b>VITE_ANDROID_APK_URL</b> (and optional{" "}
            <b>VITE_IOS_APP_URL</b>) for correct download links.
          </div>
        </div>
      </section>

      {/* ---------- GALLERY ---------- */}
      <section className="section">
        <h2 className="section-title">Inside the Product</h2>
        <p className="section-sub">
          Carefully designed screens that reduce friction and increase
          operational clarity.
        </p>

        <div className="gallery">
          {gallery.map(g => (
            <div className="shot" key={g.title}>
              <img src={g.src} alt={g.title} />
              <div className="shot-footer">{g.title}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="section">
        <div className="cta">
          <div>
            <h3>Ready to upgrade your billing experience?</h3>
            <p>Deploy Haappii Billing across branches in days, not months.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setDemoOpen(true)}>
            Talk to Sales
          </button>
        </div>
      </section>

      {/* ---------- MODAL ---------- */}
      {demoOpen && (
        <div
          className="modal-backdrop"
          onClick={() => !sending && setDemoOpen(false)}
        >
          <div
            className="modal-card"
            onClick={e => e.stopPropagation()}
          >
            <h3>Book a Demo</h3>
            <div className="modal-grid">
              <input placeholder="Name *" onChange={e => updateDemo("name", e.target.value)} />
              <input placeholder="Email *" onChange={e => updateDemo("email", e.target.value)} />
              <input placeholder="Phone" onChange={e => updateDemo("phone", e.target.value)} />
              <input placeholder="Business" onChange={e => updateDemo("business", e.target.value)} />
              <textarea placeholder="Message" onChange={e => updateDemo("message", e.target.value)} />
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setDemoOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submitDemo}>
                {sending ? "Sending…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- INSTALL HELP ---------- */}
      {installOpen && (
        <div className="modal-backdrop" onClick={() => setInstallOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Install on Android</h3>
            <p className="hero-sub" style={{ marginTop: 8 }}>
              Browsers can download the APK, but Android will ask you to confirm
              installation.
            </p>
            <ol className="steps">
              <li>
                After download, open the downloaded APK from your notifications
                / Downloads.
              </li>
              <li>
                If prompted, allow “Install unknown apps” for your browser /
                file manager.
              </li>
              <li>Tap Install, then Open.</li>
            </ol>

            <div className="modal-actions">
              <button
                className="btn btn-outline"
                onClick={() => setInstallOpen(false)}
              >
                Close
              </button>
              <button className="btn btn-primary" onClick={startAndroidDownload}>
                Download Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
