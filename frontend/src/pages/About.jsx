import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

const features = [
  {
    tag: "Fast flow",
    title: "Counter speed first",
    desc: "Keep the billing experience simple for staff so rush-hour checkout still feels calm.",
  },
  {
    tag: "Scale ready",
    title: "Built for branch growth",
    desc: "Run one outlet or many with shared visibility across daily operations and setup.",
  },
  {
    tag: "Stock aware",
    title: "Inventory with context",
    desc: "Follow items, categories, and stock movement without bouncing across disconnected tools.",
  },
  {
    tag: "Clear view",
    title: "Reports that stay readable",
    desc: "Owners and managers get cleaner sales snapshots that are easier to act on quickly.",
  },
];

const proofCards = [
  {
    title: "Retail plus restaurant",
    desc: "One product surface for counters, stock rooms, and service workflows.",
  },
  {
    title: "Web plus desktop",
    desc: "Start in the browser or move to the Windows app when you need a dedicated counter setup.",
  },
  {
    title: "Daily flow to branch scale",
    desc: "Stay useful for a single shop now and ready for future expansion later.",
  },
];

export default function About() {
  const { showToast } = useToast();
  const [demoOpen, setDemoOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [contactDetails, setContactDetails] = useState({
    name: import.meta.env.VITE_ABOUT_CONTACT_NAME || "Haappii Billing Support",
    mobile: import.meta.env.VITE_ABOUT_CONTACT_MOBILE || "+91 90000 00000",
    email: import.meta.env.VITE_ABOUT_CONTACT_EMAIL || "support@haappiibilling.in",
    insta: import.meta.env.VITE_ABOUT_CONTACT_INSTAGRAM || "@haappiibilling",
    photo: import.meta.env.VITE_ABOUT_CONTACT_PHOTO_URL || "",
  });
  const [demoForm, setDemoForm] = useState({
    name: "",
    email: "",
    phone: "",
    business: "",
    message: "",
  });

  useEffect(() => {
    document.body.style.overflow = demoOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [demoOpen]);

  useEffect(() => {
    let alive = true;
    const loadPublicContact = async () => {
      try {
        const res = await api.get(`/platform/public/about-contact?_=${Date.now()}`);
        if (!alive) return;
        setContactDetails((prev) => ({
          ...prev,
          name: res?.data?.name ?? prev.name,
          mobile: res?.data?.mobile ?? prev.mobile,
          email: res?.data?.email ?? prev.email,
          insta: res?.data?.insta ?? prev.insta,
          photo: res?.data?.photo_url ?? prev.photo,
        }));
      } catch {
        // Keep env/default fallback values when API data is unavailable.
      }
    };
    loadPublicContact();
    return () => {
      alive = false;
    };
  }, []);

  const updateDemo = (key, value) => {
    setDemoForm((prev) => ({ ...prev, [key]: value }));
  };

  const submitDemo = async () => {
    if (!demoForm.name.trim() || !demoForm.email.trim()) {
      showToast("Name and email are required", "error");
      return;
    }

    try {
      setSending(true);
      const payload = new FormData();
      Object.entries(demoForm).forEach(([key, value]) => payload.append(key, value));
      await api.post("/support/demo", payload);
      showToast("Demo request sent!", "success");
      setDemoOpen(false);
      setDemoForm({
        name: "",
        email: "",
        phone: "",
        business: "",
        message: "",
      });
    } catch (error) {
      showToast(
        error?.response?.data?.detail || "Failed to send demo request",
        "error"
      );
    } finally {
      setSending(false);
    }
  };

  const windowsAppUrl =
    import.meta.env.VITE_WINDOWS_APP_URL || "/downloads/poss-desktop-setup.exe";
  const androidAppUrl =
    import.meta.env.VITE_ANDROID_APP_URL || "/downloads/haappii-billing.apk";
  const contactInitial = (contactDetails.name || "H").trim().charAt(0).toUpperCase();
  const contactMobileHref = `tel:${(contactDetails.mobile || "").replace(/[^+\d]/g, "")}`;
  const contactWhatsAppHref = `https://wa.me/${(contactDetails.mobile || "").replace(/[^\d]/g, "")}`;
  const contactEmailHref = `mailto:${contactDetails.email}`;
  const instaHandle = (contactDetails.insta || "").replace(/^@/, "");
  const contactInstaHref = `https://instagram.com/${instaHandle}`;
  const isWindows =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
  const desktopAppProtocolUrl = `poss://open?path=${encodeURIComponent("/home")}`;

  const startWindowsDownload = async () => {
    if (!windowsAppUrl) {
      showToast("Windows app not configured", "error");
      return;
    }

    try {
      const resolved = new URL(windowsAppUrl, window.location.href);
      if (resolved.origin === window.location.origin) {
        const head = await fetch(resolved.href, { method: "HEAD" });
        const contentType = (head.headers.get("content-type") || "").toLowerCase();
        if (!head.ok || contentType.includes("text/html")) {
          showToast("Windows installer is not yet available on the server.", "error");
          return;
        }
      }

      const anchor = document.createElement("a");
      anchor.href = resolved.href;
      anchor.rel = "noopener noreferrer";
      if (resolved.origin === window.location.origin) {
        anchor.download = "poss-desktop-setup.exe";
      } else {
        anchor.target = "_blank";
      }
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      showToast(
        "Download started. Run the installer to install the desktop app.",
        "success"
      );
    } catch {
      showToast("Unable to start download", "error");
    }
  };

  const openDesktopApp = () => {
    if (!isWindows) {
      showToast("Desktop app launch is available on Windows only.", "error");
      return;
    }

    let didLeavePage = false;
    const markPageHidden = () => {
      didLeavePage = true;
      window.removeEventListener("blur", markPageHidden);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markPageHidden();
      }
    };

    window.addEventListener("blur", markPageHidden, { once: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    const link = document.createElement("a");
    link.href = desktopAppProtocolUrl;
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      window.removeEventListener("blur", markPageHidden);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (!didLeavePage) {
        showToast(
          "Desktop app did not respond. Install it first, or start it once manually and try again.",
          "error"
        );
      }
    }, 1800);

    showToast("Trying to open the desktop app...", "info");
  };

  const startAndroidDownload = async () => {
    if (!androidAppUrl) {
      showToast("Android app not configured", "error");
      return;
    }

    try {
      const resolved = new URL(androidAppUrl, window.location.href);
      if (resolved.origin === window.location.origin) {
        const head = await fetch(resolved.href, { method: "HEAD" });
        const contentType = (head.headers.get("content-type") || "").toLowerCase();
        if (!head.ok || contentType.includes("text/html")) {
          showToast("Android APK is not yet available on the server.", "error");
          return;
        }
      }

      const anchor = document.createElement("a");
      anchor.href = resolved.href;
      anchor.rel = "noopener noreferrer";
      if (resolved.origin === window.location.origin) {
        anchor.download = "haappii-billing.apk";
      } else {
        anchor.target = "_blank";
      }
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      showToast("Android APK download started.", "success");
    } catch {
      showToast("Unable to start APK download", "error");
    }
  };

  return (
    <div className="ab-root">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Outfit:wght@400;500;600;700;800&display=swap");
        html,body{height:auto;overflow-y:auto}
        #root{min-height:100%}
        .ab-root{--ink:#14243e;--muted:#627088;--line:rgba(20,36,62,.12);--accent:#f36d4f;--mint:#129b84;min-height:100vh;overflow-x:hidden;background:radial-gradient(circle at top left,rgba(243,109,79,.18),transparent 34%),radial-gradient(circle at top right,rgba(18,155,132,.15),transparent 28%),linear-gradient(180deg,#fff8ef 0%,#f5eee2 48%,#eef5f1 100%);color:var(--ink);font-family:Outfit,system-ui,sans-serif}
        .ab-root *{box-sizing:border-box}
        .ab-nav{position:sticky;top:0;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 32px;background:rgba(255,248,239,.82);backdrop-filter:blur(16px);border-bottom:1px solid rgba(20,36,62,.08)}
        .ab-brand{display:flex;align-items:center;gap:14px}
        .ab-brand-mark{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--accent),#ffb15d 62%,#ffd57b 100%);box-shadow:0 16px 32px rgba(243,109,79,.24)}
        .ab-logo{display:block;font-family:Fraunces,serif;font-size:24px;letter-spacing:-.03em;color:var(--ink)}
        .ab-brand-sub{display:block;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
        .ab-nav-links{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .ab-main{width:min(1200px,calc(100% - 40px));margin:0 auto;padding:28px 0 90px}
        .ab-hero{display:grid;grid-template-columns:1.03fr .97fr;gap:34px;align-items:center;padding:44px 0 20px}
        .ab-badge{display:inline-flex;align-items:center;padding:7px 14px;border-radius:999px;background:rgba(255,255,255,.72);border:1px solid rgba(20,36,62,.08);color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
        .ab-h1,.ab-sec-title,.ab-cta h3,.ab-stage-note h3,.ab-modal h3{font-family:Fraunces,serif;letter-spacing:-.04em}
        .ab-h1{margin:18px 0 16px;font-size:clamp(3rem,6vw,5.1rem);line-height:.97;max-width:10ch}
        .ab-h1 em{font-style:normal;color:var(--accent)}
        .ab-sub{max-width:560px;margin:0;color:var(--muted);font-size:17px;line-height:1.8}
        .ab-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
        .btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 20px;border-radius:16px;font:700 14px Outfit,system-ui,sans-serif;border:1px solid transparent;cursor:pointer;text-decoration:none;transition:transform .18s ease,box-shadow .18s ease,background .18s ease}
        .btn:hover{transform:translateY(-2px)}
        .btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
        .btn-primary{background:linear-gradient(135deg,var(--accent),#ffb15d);color:#fff;box-shadow:0 16px 32px rgba(243,109,79,.28)}
        .btn-ghost{background:rgba(255,255,255,.78);color:var(--ink);border-color:rgba(20,36,62,.1)}
        .btn-dark{background:linear-gradient(135deg,#14243e,#0b6257);color:#fff;box-shadow:0 16px 32px rgba(11,98,87,.2)}
        .ab-proof-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:24px}
        .ab-proof{padding:16px 18px;border-radius:20px;background:rgba(255,255,255,.75);border:1px solid var(--line);box-shadow:0 16px 32px rgba(20,36,62,.06)}
        .ab-proof strong{display:block;margin-bottom:8px;font-size:15px}
        .ab-proof span{display:block;color:var(--muted);font-size:13px;line-height:1.65}
        .ab-stage{display:flex;min-height:100%;padding:22px;border-radius:32px;overflow:hidden;background:radial-gradient(circle at top right,rgba(255,177,93,.24),transparent 30%),linear-gradient(180deg,#152744 0%,#0f1d34 100%);box-shadow:0 36px 80px rgba(20,36,62,.22)}
        .ab-stage-note{position:relative;width:100%;padding:24px;border-radius:22px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(12px);box-shadow:0 20px 36px rgba(3,9,19,.24)}
        .ab-stage-pill{display:inline-flex;align-items:center;padding:6px 12px;border-radius:999px;background:rgba(18,155,132,.16);color:#a9fff1;font-size:12px;font-weight:700}
        .ab-stage-note h3{margin:14px 0 8px;font-size:28px;line-height:1.05;color:#fff}
        .ab-stage-note p{margin:0;color:rgba(241,245,249,.78);line-height:1.7;font-size:13px}
        .ab-list{padding-left:18px;margin:14px 0 0;color:rgba(241,245,249,.78);font-size:13px;line-height:1.75}
        .ab-stage-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:22px}
        .ab-stage-stat{padding:16px;border-radius:18px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1)}
        .ab-stage-stat strong{display:block;color:#fff;font-size:15px;margin-bottom:6px}
        .ab-stage-stat span{display:block;color:rgba(241,245,249,.72);font-size:13px;line-height:1.65}
        .ab-section{padding-top:86px}
        .ab-section--tight{padding-top:72px}
        .ab-section-head{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:28px}
        .ab-sec-label{margin:0 0 10px;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
        .ab-sec-title{margin:0;font-size:clamp(2rem,4vw,3.1rem);line-height:1.02;max-width:11ch}
        .ab-sec-sub{margin:0;max-width:500px;color:var(--muted);font-size:16px;line-height:1.8}
        .ab-features{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
        .ab-feat,.ab-dl-card,.ab-modal{border-radius:24px;border:1px solid rgba(20,36,62,.08);background:rgba(255,255,255,.76);box-shadow:0 18px 36px rgba(20,36,62,.06);backdrop-filter:blur(12px)}
        .ab-feat{padding:24px}
        .ab-feat-tag,.ab-dl-chip{display:inline-flex;align-items:center;width:fit-content;padding:7px 12px;border-radius:999px;background:rgba(243,109,79,.12);color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
        .ab-feat-title,.ab-dl-title{margin:16px 0 10px;font-size:22px;letter-spacing:-.03em}
        .ab-feat-desc,.ab-dl-sub,.ab-cta p,.ab-modal p{margin:0;color:var(--muted);font-size:14px;line-height:1.75}
        .ab-dl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
        .ab-dl-card{padding:24px;display:flex;flex-direction:column;gap:12px}
        .ab-dl-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:auto;padding-top:8px}
        .ab-contact-card{display:grid;grid-template-columns:minmax(280px,.72fr) minmax(0,1.28fr);gap:18px;align-items:stretch;padding:26px;border-radius:24px;background:rgba(255,255,255,.82);border:1px solid rgba(20,36,62,.1);box-shadow:0 22px 40px rgba(20,36,62,.08)}
        .ab-contact-media{position:relative;min-height:100%;height:100%;border-radius:20px;overflow:hidden;background:linear-gradient(135deg,#14243e,#0b6257);box-shadow:0 18px 36px rgba(20,36,62,.12)}
        .ab-contact-media-frame{height:100%;min-height:320px}
        .ab-contact-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-content:center;align-self:center;min-height:100%;height:100%}
        .ab-contact-item{padding:14px 16px;border-radius:16px;border:1px solid var(--line);background:#fff}
        .ab-contact-photo{display:block;width:100%;height:100%;min-height:320px;object-fit:cover}
        .ab-contact-photo-fallback{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:320px;background:linear-gradient(135deg,var(--accent),#ffb15d);color:#fff;font-size:96px;font-weight:800}
        .ab-contact-label{display:block;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
        .ab-contact-value{display:block;margin-top:6px;color:var(--ink);font-weight:600;word-break:break-word}
        .ab-contact-value a{color:var(--ink);text-decoration:none;border-bottom:1px dashed rgba(20,36,62,.3)}
        .ab-contact-value a:hover{border-bottom-color:rgba(20,36,62,.75)}
        .ab-cta{padding:34px;border-radius:32px;background:radial-gradient(circle at top right,rgba(255,177,93,.34),transparent 30%),linear-gradient(135deg,#152744 0%,#10203a 52%,#0b4c46 100%);color:#fff;box-shadow:0 30px 70px rgba(20,36,62,.24);display:flex;align-items:center;justify-content:space-between;gap:24px}
        .ab-cta h3{margin:0 0 12px;font-size:clamp(2rem,4vw,3rem);line-height:1.02;max-width:12ch}
        .ab-cta p{max-width:560px;color:rgba(241,245,249,.78);font-size:16px}
        .ab-footer{padding:34px 20px 44px;text-align:center;color:var(--muted);font-size:13px}
        .ab-modal-bg{position:fixed;inset:0;z-index:90;padding:20px;display:flex;align-items:center;justify-content:center;background:rgba(8,15,29,.68);backdrop-filter:blur(10px)}
        .ab-modal{width:min(560px,100%);padding:28px;background:rgba(255,249,241,.98);box-shadow:0 32px 80px rgba(8,15,29,.2)}
        .ab-modal-top{display:flex;align-items:start;justify-content:space-between;gap:16px}
        .ab-modal h3{margin:0 0 8px;font-size:32px;line-height:1}
        .ab-close{width:40px;height:40px;border:1px solid rgba(20,36,62,.08);border-radius:14px;background:#fff;color:var(--ink);font-size:15px;font-weight:700;cursor:pointer}
        .ab-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:22px}
        .ab-field,.ab-field-wide{width:100%;border:1px solid rgba(20,36,62,.12);border-radius:16px;background:#fff;color:var(--ink);font:inherit;padding:13px 14px;outline:none;transition:border-color .18s ease,box-shadow .18s ease}
        .ab-field:focus,.ab-field-wide:focus{border-color:rgba(243,109,79,.65);box-shadow:0 0 0 4px rgba(243,109,79,.12)}
        .ab-field::placeholder,.ab-field-wide::placeholder{color:rgba(98,112,136,.72)}
        .ab-field-wide{grid-column:1/-1;min-height:112px;resize:vertical}
        .ab-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
        @media (max-width:1080px){.ab-hero,.ab-dl-grid,.ab-features,.ab-contact-card,.ab-contact-list{grid-template-columns:1fr}.ab-section-head,.ab-cta{align-items:flex-start;flex-direction:column}}
        @media (max-width:760px){.ab-nav{padding:14px 18px}.ab-main{width:min(1200px,calc(100% - 24px))}.ab-proof-grid,.ab-stage-grid{grid-template-columns:1fr}}
        @media (max-width:560px){.ab-actions,.ab-dl-actions,.ab-modal-actions,.ab-nav-links{flex-direction:column;align-items:stretch}.btn{width:100%}.ab-form-grid{grid-template-columns:1fr}}
      `}</style>

      <nav className="ab-nav">
        <div className="ab-brand">
          <span className="ab-brand-mark" />
          <div>
            <span className="ab-logo">Haappii Billing</span>
            <span className="ab-brand-sub">POS and operations suite</span>
          </div>
        </div>

        <div className="ab-nav-links">
          <Link className="btn btn-ghost" to="/setup/onboard">
            Setup
          </Link>
          <Link className="btn btn-primary" to="/login">
            Login
          </Link>
        </div>
      </nav>

      <main className="ab-main">
        <section className="ab-hero">
          <div>
            <div className="ab-badge">For retail counters and restaurant floors</div>
            <h1 className="ab-h1">
              Make billing feel <em>faster</em> and operations feel lighter.
            </h1>
            <p className="ab-sub">
              Haappii Billing brings checkout, stock visibility, branch control, and
              reporting into one workspace built for busy teams and growing shops.
            </p>

            <div className="ab-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setDemoOpen(true)}
              >
                Book a Demo
              </button>
              <Link className="btn btn-ghost" to="/setup/onboard">
                Start Setup
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  document
                    .getElementById("downloads")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                Download App
              </button>
            </div>

            <div className="ab-proof-grid">
              {proofCards.map((item) => (
                <article className="ab-proof" key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.desc}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="ab-stage">
            <div className="ab-stage-note">
              <span className="ab-stage-pill">Desktop plus web sync</span>
              <h3>One system for the counter and the control room.</h3>
              <p>
                Keep sales moving in front while owners and managers stay close to
                stock, reports, and branch visibility in the background.
              </p>
              <ul className="ab-list">
                <li>Faster counter flow</li>
                <li>Cleaner stock oversight</li>
                <li>Branch-ready reporting</li>
              </ul>
              <div className="ab-stage-grid">
                <div className="ab-stage-stat">
                  <strong>Billing</strong>
                  <span>Fast counter operations with a clearer workflow for staff.</span>
                </div>
                <div className="ab-stage-stat">
                  <strong>Inventory</strong>
                  <span>Track items, categories, and daily stock movement from one place.</span>
                </div>
                <div className="ab-stage-stat">
                  <strong>Branches</strong>
                  <span>Keep growing shops organized with one shared operations setup.</span>
                </div>
                <div className="ab-stage-stat">
                  <strong>Reports</strong>
                  <span>Use cleaner business summaries without relying on image-heavy sections.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="ab-section ab-section--tight">
          <div className="ab-section-head">
            <div>
              <p className="ab-sec-label">Core capabilities</p>
              <h2 className="ab-sec-title">Designed around how busy shops actually run.</h2>
            </div>
            <p className="ab-sec-sub">
              Haappii Billing is shaped around the real daily rhythm of billing,
              setup, stock checks, and owner follow-up.
            </p>
          </div>

          <div className="ab-features">
            {features.map((item) => (
              <article className="ab-feat" key={item.title}>
                <span className="ab-feat-tag">{item.tag}</span>
                <h3 className="ab-feat-title">{item.title}</h3>
                <p className="ab-feat-desc">{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ab-section" id="downloads">
          <div className="ab-section-head">
            <div>
              <p className="ab-sec-label">Access points</p>
              <h2 className="ab-sec-title">Use the product where your team needs it.</h2>
            </div>
            <p className="ab-sec-sub">
              Browser access, desktop install, and future mobile rollout now sit in one
              cleaner platform section.
            </p>
          </div>

          <div className="ab-dl-grid">
            <article className="ab-dl-card">
              <span className="ab-dl-chip">Web</span>
              <h3 className="ab-dl-title">Browser access</h3>
              <p className="ab-dl-sub">
                Log in from any supported browser to reach billing, setup, and daily
                operations without installing anything first.
              </p>
              <div className="ab-dl-actions">
                <Link className="btn btn-ghost" to="/login">
                  Open Login
                </Link>
                <Link className="btn btn-ghost" to="/setup/onboard">
                  Guided Setup
                </Link>
              </div>
            </article>

            <article className="ab-dl-card">
              <span className="ab-dl-chip">Win</span>
              <h3 className="ab-dl-title">Windows desktop app</h3>
              <p className="ab-dl-sub">
                {isWindows
                  ? "You are on Windows. Download the installer and launch the desktop app directly from here."
                  : "Download the Windows installer here and run it on any Windows counter machine."}
              </p>
              <div className="ab-dl-actions">
                <button type="button" className="btn btn-primary" onClick={startWindowsDownload}>
                  Download EXE
                </button>
                <button type="button" className="btn btn-ghost" onClick={openDesktopApp}>
                  Open App
                </button>
              </div>
            </article>

            <article className="ab-dl-card">
              <span className="ab-dl-chip">APK</span>
              <h3 className="ab-dl-title">Android app</h3>
              <p className="ab-dl-sub">
                Download the Android APK and install it on your mobile device for
                billing, printing, and daily operations on the go.
              </p>
              <div className="ab-dl-actions">
                <button type="button" className="btn btn-dark" onClick={startAndroidDownload}>
                  Download APK
                </button>
              </div>
            </article>
          </div>
        </section>

        <section className="ab-section ab-section--tight">
          <div className="ab-section-head">
            <div>
              <p className="ab-sec-label">Contact details</p>
              <h2 className="ab-sec-title">Reach the Haappii Billing team directly.</h2>
            </div>
            <p className="ab-sec-sub">
              Use the details below for quick support and product communication.
            </p>
          </div>

          <div className="ab-contact-card">
            <div className="ab-contact-media">
              <div className="ab-contact-media-frame">
                {contactDetails.photo ? (
                  <img className="ab-contact-photo" src={contactDetails.photo} alt="Contact" loading="lazy" />
                ) : (
                  <span className="ab-contact-photo-fallback" aria-hidden="true">{contactInitial}</span>
                )}
              </div>
            </div>
            <div className="ab-contact-list">
              <div className="ab-contact-item">
                <span className="ab-contact-label">Name</span>
                <span className="ab-contact-value">{contactDetails.name}</span>
              </div>
              <div className="ab-contact-item">
                <span className="ab-contact-label">Mobile number / WhatsApp</span>
                <span className="ab-contact-value">
                  <a href={contactMobileHref}>{contactDetails.mobile}</a>
                  {" | "}
                  <a href={contactWhatsAppHref} target="_blank" rel="noreferrer">
                    WhatsApp chat
                  </a>
                </span>
              </div>
              <div className="ab-contact-item">
                <span className="ab-contact-label">Mail</span>
                <span className="ab-contact-value">
                  <a href={contactEmailHref}>{contactDetails.email}</a>
                </span>
              </div>
              <div className="ab-contact-item">
                <span className="ab-contact-label">Insta ID</span>
                <span className="ab-contact-value">
                  <a href={contactInstaHref} target="_blank" rel="noreferrer">
                    {contactDetails.insta}
                  </a>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="ab-section ab-section--tight">
          <div className="ab-cta">
            <div>
              <h3>Ready to modernize the way your team bills and tracks daily business?</h3>
              <p>
                Book a walkthrough, start setup, or move straight into the desktop app
                flow from one stronger product page.
              </p>
            </div>

            <div className="ab-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setDemoOpen(true)}
              >
                Book a Demo
              </button>
              <Link className="btn btn-ghost" to="/setup/onboard">
                Get Started
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="ab-footer">
        Copyright {new Date().getFullYear()} Haappii Billing. All rights reserved.
      </footer>

      {demoOpen && (
        <div className="ab-modal-bg" onClick={() => !sending && setDemoOpen(false)}>
          <div className="ab-modal" onClick={(event) => event.stopPropagation()}>
            <div className="ab-modal-top">
              <div>
                <h3>Book a live demo</h3>
                <p>
                  Share your details and we will get back to you with a walkthrough
                  for your business use case.
                </p>
              </div>
              <button
                type="button"
                className="ab-close"
                onClick={() => setDemoOpen(false)}
                disabled={sending}
              >
                X
              </button>
            </div>

            <div className="ab-form-grid">
              <input
                className="ab-field"
                placeholder="Your name *"
                value={demoForm.name}
                onChange={(event) => updateDemo("name", event.target.value)}
              />
              <input
                className="ab-field"
                placeholder="Email *"
                type="email"
                value={demoForm.email}
                onChange={(event) => updateDemo("email", event.target.value)}
              />
              <input
                className="ab-field"
                placeholder="Phone"
                value={demoForm.phone}
                onChange={(event) => updateDemo("phone", event.target.value)}
              />
              <input
                className="ab-field"
                placeholder="Business name"
                value={demoForm.business}
                onChange={(event) => updateDemo("business", event.target.value)}
              />
              <textarea
                className="ab-field-wide"
                placeholder="Message (optional)"
                value={demoForm.message}
                onChange={(event) => updateDemo("message", event.target.value)}
              />
            </div>

            <div className="ab-modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setDemoOpen(false)}
                disabled={sending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitDemo}
                disabled={sending}
              >
                {sending ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
