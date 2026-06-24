import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../utils/apiClient";
import { useToast } from "../components/Toast";

const features = [
  {
    icon: "⚡",
    tag: "Fast flow",
    title: "Counter speed first",
    desc: "Keep the billing experience simple for staff so rush-hour checkout still feels calm.",
    color: "#f36d4f",
  },
  {
    icon: "🚀",
    tag: "Scale ready",
    title: "Built for branch growth",
    desc: "Run one outlet or many with shared visibility across daily operations and setup.",
    color: "#7c3aed",
  },
  {
    icon: "📦",
    tag: "Stock aware",
    title: "Inventory with context",
    desc: "Follow items, categories, and stock movement without bouncing across disconnected tools.",
    color: "#0ea5e9",
  },
  {
    icon: "📊",
    tag: "Clear view",
    title: "Reports that stay readable",
    desc: "Owners and managers get cleaner sales snapshots that are easier to act on quickly.",
    color: "#10b981",
  },
];

const stats = [
  { value: "< 2s", label: "Average bill time" },
  { value: "24/7", label: "Cloud uptime" },
  { value: "3+", label: "Platforms supported" },
  { value: "100%", label: "Data ownership" },
];

export default function About() {
  const { showToast } = useToast();
  const [teamProfiles, setTeamProfiles] = useState([]);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    api.get(`/platform/public/team-profiles?_=${Date.now()}`).then((res) => {
      if (!alive) return;
      setTeamProfiles(Array.isArray(res?.data) ? res.data : []);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (teamProfiles.length < 2) return;
    const id = setInterval(() => setSlideIndex((i) => (i + 1) % teamProfiles.length), 4000);
    return () => clearInterval(id);
  }, [teamProfiles.length]);

  const [contactDetails, setContactDetails] = useState({
    name: import.meta.env.VITE_ABOUT_CONTACT_NAME || "Sathish Kumar Lakshman",
    mobile: import.meta.env.VITE_ABOUT_CONTACT_MOBILE || "+91 79042 63246",
    email: import.meta.env.VITE_ABOUT_CONTACT_EMAIL || "sathishheternal@gmail.com",
    photo: import.meta.env.VITE_ABOUT_CONTACT_PHOTO_URL || "",
  });
  useEffect(() => {
    let alive = true;
    const loadPublicContact = async () => {
      try {
        const res = await api.get(`/platform/public/about-contact?_=${Date.now()}`);
        if (!alive) return;
        setContactDetails((prev) => ({
          ...prev,
          name: res?.data?.name || prev.name,
          mobile: res?.data?.mobile || prev.mobile,
          email: res?.data?.email || prev.email,
          photo: res?.data?.photo_url || prev.photo,
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

  const windowsAppUrl =
    import.meta.env.VITE_WINDOWS_APP_URL || "/downloads/poss-desktop-setup.exe";
  const androidAppUrl =
    import.meta.env.VITE_ANDROID_APP_URL || "https://storage.googleapis.com/haappiibilling-uploads/downloads/haappii-billing.apk";
  const contactInitial = (contactDetails.name || "H").trim().charAt(0).toUpperCase();
  const mailtoHref = `mailto:${contactDetails.email}?subject=${encodeURIComponent("Business Inquiry – Haappii Billing")}&body=${encodeURIComponent("Hello Sathish,\n\nI came across Haappii Billing and would like to connect for a business discussion.\n\nName: \nBusiness Name: \nContact Number: \nRequirement: \n\nRegards,")}`;
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
        @import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800;9..144,900&family=Inter:wght@400;500;600;700;800;900&display=swap");
        html,body{height:auto;overflow-y:auto}
        #root{min-height:100%}

        .ab-root{
          --ink:#0f172a;--muted:#64748b;--line:rgba(15,23,42,.08);
          --accent:#f36d4f;--accent-glow:rgba(243,109,79,.35);
          --purple:#7c3aed;--cyan:#0ea5e9;--emerald:#10b981;
          --surface:#ffffff;
          min-height:100vh;overflow-x:hidden;
          background:#0f172a;
          color:var(--ink);font-family:Inter,system-ui,sans-serif;
        }
        .ab-root *{box-sizing:border-box}

        /* ---- NAV ---- */
        .ab-nav{position:sticky;top:0;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 40px;background:rgba(15,23,42,.92);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.06)}
        .ab-brand{display:flex;align-items:center;gap:14px}
        .ab-brand-mark{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--accent),#ff9a56);box-shadow:0 0 32px var(--accent-glow)}
        .ab-logo{display:block;font-family:Fraunces,serif;font-size:22px;font-weight:800;letter-spacing:-.03em;color:#fff}
        .ab-brand-sub{display:block;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.45)}
        .ab-nav-links{display:flex;gap:10px;align-items:center;flex-wrap:wrap}

        /* ---- BUTTONS ---- */
        .btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 24px;border-radius:14px;font:700 14px/1 Inter,system-ui,sans-serif;border:none;cursor:pointer;text-decoration:none;transition:all .22s ease;letter-spacing:-.01em}
        .btn:hover{transform:translateY(-2px)}
        .btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .btn-primary{background:linear-gradient(135deg,var(--accent),#ff9a56);color:#fff;box-shadow:0 8px 30px var(--accent-glow)}
        .btn-primary:hover{box-shadow:0 12px 40px rgba(243,109,79,.5)}
        .btn-ghost{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12)}
        .btn-ghost:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.2)}
        .btn-dark{background:linear-gradient(135deg,var(--purple),#a855f7);color:#fff;box-shadow:0 8px 30px rgba(124,58,237,.3)}
        .btn-dark:hover{box-shadow:0 12px 40px rgba(124,58,237,.45)}
        .btn-light{background:#fff;color:var(--ink);box-shadow:0 4px 20px rgba(0,0,0,.08)}
        .btn-light:hover{box-shadow:0 8px 30px rgba(0,0,0,.12)}

        /* ---- HERO ---- */
        .ab-hero-wrap{position:relative;overflow:hidden;background:linear-gradient(165deg,#0f172a 0%,#1a0a2e 30%,#1e1145 50%,#0f172a 100%)}
        .ab-hero-glow{position:absolute;width:700px;height:700px;border-radius:50%;filter:blur(120px);opacity:.5;pointer-events:none}
        .ab-hero-glow--orange{top:-200px;right:-100px;background:radial-gradient(circle,var(--accent),transparent 70%)}
        .ab-hero-glow--purple{bottom:-300px;left:-150px;background:radial-gradient(circle,var(--purple),transparent 70%)}
        .ab-hero-glow--cyan{top:50%;left:50%;transform:translate(-50%,-50%);background:radial-gradient(circle,var(--cyan),transparent 70%);opacity:.15}
        .ab-hero{position:relative;z-index:1;width:min(1200px,calc(100% - 48px));margin:0 auto;padding:100px 0 80px;text-align:center}
        .ab-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 20px;border-radius:999px;background:rgba(243,109,79,.12);border:1px solid rgba(243,109,79,.2);color:var(--accent);font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:28px}
        .ab-h1{font-family:Fraunces,serif;font-size:clamp(3.2rem,7.5vw,6.5rem);font-weight:900;line-height:.92;letter-spacing:-.05em;color:#fff;margin:0 auto 28px;max-width:14ch}
        .ab-h1 em{font-style:normal;background:linear-gradient(135deg,var(--accent),#ff9a56,#ffd97b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .ab-sub{max-width:620px;margin:0 auto 40px;color:rgba(255,255,255,.6);font-size:18px;line-height:1.8;font-weight:400}
        .ab-hero-actions{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}

        /* ---- STATS BAR ---- */
        .ab-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;width:min(900px,calc(100% - 48px));margin:0 auto;border-radius:20px;overflow:hidden;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(12px);position:relative;z-index:1;transform:translateY(-40px)}
        .ab-stat{padding:28px 24px;text-align:center;border-right:1px solid rgba(255,255,255,.06)}
        .ab-stat:last-child{border-right:none}
        .ab-stat-value{display:block;font-family:Fraunces,serif;font-size:32px;font-weight:900;letter-spacing:-.04em;color:#fff}
        .ab-stat-label{display:block;margin-top:6px;color:rgba(255,255,255,.45);font-size:13px;font-weight:500}

        /* ---- SECTIONS ---- */
        .ab-section{padding:80px 0}
        .ab-container{width:min(1200px,calc(100% - 48px));margin:0 auto}
        .ab-section-head{text-align:center;margin-bottom:56px}
        .ab-sec-label{margin:0 0 12px;font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
        .ab-sec-label--accent{color:var(--accent)}
        .ab-sec-label--purple{color:var(--purple)}
        .ab-sec-label--cyan{color:var(--cyan)}
        .ab-sec-label--emerald{color:var(--emerald)}
        .ab-sec-title{font-family:Fraunces,serif;font-size:clamp(2.2rem,4.5vw,3.6rem);font-weight:800;line-height:1;letter-spacing:-.04em;margin:0 auto 16px;max-width:16ch}
        .ab-sec-title--white{color:#fff}
        .ab-sec-title--dark{color:var(--ink)}
        .ab-sec-sub{margin:0 auto;max-width:560px;font-size:16px;line-height:1.8;font-weight:400}
        .ab-sec-sub--light{color:rgba(255,255,255,.5)}
        .ab-sec-sub--muted{color:var(--muted)}

        /* ---- FEATURES (dark bg) ---- */
        .ab-section--features{background:#0f172a}
        .ab-features{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
        .ab-feat{position:relative;padding:32px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);overflow:hidden;transition:all .3s ease}
        .ab-feat:hover{transform:translateY(-4px);border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.06)}
        .ab-feat-glow{position:absolute;top:-40px;right:-40px;width:120px;height:120px;border-radius:50%;filter:blur(50px);opacity:.25;pointer-events:none}
        .ab-feat-icon{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;font-size:26px;margin-bottom:20px}
        .ab-feat-tag{display:inline-flex;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px}
        .ab-feat-title{font-size:22px;font-weight:800;letter-spacing:-.03em;color:#fff;margin:0 0 10px}
        .ab-feat-desc{margin:0;color:rgba(255,255,255,.55);font-size:15px;line-height:1.75}

        /* ---- DOWNLOADS (light bg) ---- */
        .ab-section--downloads{background:#fff}
        .ab-dl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
        .ab-dl-card{padding:32px;border-radius:24px;display:flex;flex-direction:column;gap:16px;transition:all .3s ease;position:relative;overflow:hidden}
        .ab-dl-card:hover{transform:translateY(-4px)}
        .ab-dl-card--web{background:linear-gradient(165deg,#f0fdf4,#ecfdf5);border:1px solid rgba(16,185,129,.15)}
        .ab-dl-card--win{background:linear-gradient(165deg,#fef3f2,#fff1f0);border:1px solid rgba(243,109,79,.15)}
        .ab-dl-card--android{background:linear-gradient(165deg,#f5f3ff,#ede9fe);border:1px solid rgba(124,58,237,.15)}
        .ab-dl-chip{display:inline-flex;align-items:center;width:fit-content;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
        .ab-dl-chip--web{background:rgba(16,185,129,.1);color:var(--emerald)}
        .ab-dl-chip--win{background:rgba(243,109,79,.1);color:var(--accent)}
        .ab-dl-chip--android{background:rgba(124,58,237,.1);color:var(--purple)}
        .ab-dl-title{font-size:22px;font-weight:800;letter-spacing:-.03em;color:var(--ink);margin:0}
        .ab-dl-sub{margin:0;color:var(--muted);font-size:14px;line-height:1.75}
        .ab-dl-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:auto;padding-top:8px}
        .ab-dl-actions .btn-ghost{color:var(--ink);background:rgba(15,23,42,.04);border-color:rgba(15,23,42,.1)}
        .ab-dl-actions .btn-ghost:hover{background:rgba(15,23,42,.08)}
        .ab-dl-actions .btn-primary{box-shadow:0 4px 20px var(--accent-glow)}

        /* ---- TEAM / CONTACT (dark bg) ---- */
        .ab-section--team{background:linear-gradient(180deg,#0f172a,#1a0a2e)}
        .ab-team-slider{position:relative;overflow:hidden;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
        .ab-team-track{display:flex;transition:transform .6s cubic-bezier(.4,0,.2,1)}
        .ab-team-slide{min-width:100%;display:grid;grid-template-columns:minmax(220px,.45fr) 1fr;gap:0;align-items:stretch}
        .ab-team-img{position:relative;overflow:hidden;min-height:360px;background:linear-gradient(135deg,#1e1145,#0f172a)}
        .ab-team-img img{width:100%;height:100%;object-fit:cover;display:block}
        .ab-team-img-fallback{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:360px;font-size:80px;font-weight:900;color:#fff;background:linear-gradient(135deg,var(--accent),#ff9a56)}
        .ab-team-info{padding:40px 44px;display:flex;flex-direction:column;justify-content:center;gap:14px}
        .ab-team-role{display:inline-flex;padding:6px 14px;border-radius:999px;background:rgba(243,109,79,.12);color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;width:fit-content}
        .ab-team-name{font-family:Fraunces,serif;font-size:clamp(1.8rem,3vw,2.8rem);font-weight:800;letter-spacing:-.03em;line-height:1.05;color:#fff}
        .ab-team-bio{color:rgba(255,255,255,.55);font-size:15px;line-height:1.75;margin:0}
        .ab-team-contact-line{font-size:14px;color:rgba(255,255,255,.5)}
        .ab-team-contact-line a{color:rgba(255,255,255,.7);text-decoration:underline;text-decoration-color:rgba(255,255,255,.25)}
        .ab-team-contact-line a:hover{color:#fff;text-decoration-color:rgba(255,255,255,.5)}
        .ab-team-dots{display:flex;justify-content:center;gap:8px;padding:24px 0 0}
        .ab-team-dot{width:8px;height:8px;border-radius:50%;border:none;cursor:pointer;transition:all .25s ease;background:rgba(255,255,255,.2)}
        .ab-team-dot.active{width:28px;border-radius:4px;background:var(--accent)}
        .ab-team-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:rgba(15,23,42,.7);backdrop-filter:blur(8px);cursor:pointer;font-size:16px;color:#fff;display:flex;align-items:center;justify-content:center;transition:all .18s ease;z-index:2}
        .ab-team-nav:hover{background:rgba(15,23,42,.9);border-color:rgba(255,255,255,.2)}
        .ab-team-nav.prev{left:14px}
        .ab-team-nav.next{right:14px}

        /* ---- CONTACT FALLBACK ---- */
        .ab-contact-card{display:grid;grid-template-columns:minmax(260px,.4fr) 1fr;gap:0;border-radius:24px;overflow:hidden;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
        .ab-contact-media{position:relative;min-height:360px;background:linear-gradient(135deg,var(--accent),#ff9a56)}
        .ab-contact-photo{display:block;width:100%;height:100%;min-height:360px;object-fit:cover}
        .ab-contact-photo-fallback{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:360px;color:#fff;font-size:96px;font-weight:900}
        .ab-contact-list{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;padding:36px 40px;align-content:center}
        .ab-contact-item{padding:18px 20px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}
        .ab-contact-label{display:block;color:rgba(255,255,255,.4);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
        .ab-contact-value{display:block;margin-top:8px;color:#fff;font-weight:600;font-size:15px;word-break:break-word}
        .ab-contact-value a{color:#fff;text-decoration:underline;text-decoration-color:rgba(255,255,255,.3)}
        .ab-contact-value a:hover{text-decoration-color:rgba(255,255,255,.6)}

        /* ---- CTA ---- */
        .ab-section--cta{background:#fff;padding:0 0 100px}
        .ab-cta{padding:56px 48px;border-radius:32px;background:linear-gradient(135deg,#1e1145 0%,#0f172a 40%,#0a2f2a 100%);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:40px;position:relative;overflow:hidden}
        .ab-cta-glow{position:absolute;width:400px;height:400px;border-radius:50%;filter:blur(100px);opacity:.3;pointer-events:none;top:-100px;right:-50px;background:radial-gradient(circle,var(--accent),transparent 70%)}
        .ab-cta h3{font-family:Fraunces,serif;font-size:clamp(2rem,4vw,3.2rem);font-weight:800;line-height:1;letter-spacing:-.04em;margin:0 0 16px;max-width:14ch;position:relative;z-index:1}
        .ab-cta p{max-width:480px;color:rgba(255,255,255,.55);font-size:16px;line-height:1.8;margin:0;position:relative;z-index:1}
        .ab-cta .ab-hero-actions{position:relative;z-index:1}

        /* ---- FOOTER ---- */
        .ab-footer{padding:40px 20px 50px;text-align:center;color:rgba(255,255,255,.35);font-size:13px;font-weight:500;background:#0f172a;border-top:1px solid rgba(255,255,255,.06)}

        /* ---- RESPONSIVE ---- */
        @media (max-width:1080px){
          .ab-features,.ab-dl-grid{grid-template-columns:1fr}
          .ab-team-slide{grid-template-columns:1fr}
          .ab-team-img{min-height:240px}
          .ab-contact-card{grid-template-columns:1fr}
          .ab-cta{flex-direction:column;align-items:flex-start}
          .ab-stats{grid-template-columns:repeat(2,1fr)}
          .ab-stat{border-bottom:1px solid rgba(255,255,255,.06)}
        }
        @media (max-width:760px){
          .ab-nav{padding:14px 20px}
          .ab-hero{padding:60px 0 50px}
          .ab-h1{font-size:clamp(2.6rem,8vw,4rem)}
          .ab-stats{grid-template-columns:1fr;transform:translateY(-20px)}
          .ab-stat{border-right:none;border-bottom:1px solid rgba(255,255,255,.06)}
          .ab-stat:last-child{border-bottom:none}
          .ab-section{padding:60px 0}
          .ab-team-info{padding:24px 20px}
          .ab-contact-list{grid-template-columns:1fr;padding:24px 20px}
          .ab-cta{padding:36px 28px}
        }
        @media (max-width:560px){
          .ab-hero-actions,.ab-dl-actions,.ab-nav-links{flex-direction:column;align-items:stretch}
          .btn{width:100%}
        }

        /* ---- ANIMATIONS ---- */
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes pulse-glow{0%,100%{opacity:.3}50%{opacity:.55}}
        .ab-hero-glow--orange{animation:pulse-glow 5s ease-in-out infinite}
        .ab-hero-glow--purple{animation:pulse-glow 6s ease-in-out infinite 1s}
      `}</style>

      {/* ---- NAV ---- */}
      <nav className="ab-nav">
        <div className="ab-brand">
          <span className="ab-brand-mark" />
          <div>
            <span className="ab-logo">Haappii Billing</span>
            <span className="ab-brand-sub">POS & operations suite</span>
          </div>
        </div>
        <div className="ab-nav-links">
          <Link className="btn btn-ghost" to="/setup/onboard">Setup</Link>
          <Link className="btn btn-primary" to="/login">Login</Link>
        </div>
      </nav>

      {/* ---- HERO ---- */}
      <div className="ab-hero-wrap">
        <div className="ab-hero-glow ab-hero-glow--orange" />
        <div className="ab-hero-glow ab-hero-glow--purple" />
        <div className="ab-hero-glow ab-hero-glow--cyan" />

        <section className="ab-hero">
          <div className="ab-badge">For retail counters & restaurant floors</div>
          <h1 className="ab-h1">
            Billing that feels <em>instant.</em> Operations that feel <em>effortless.</em>
          </h1>
          <p className="ab-sub">
            Haappii Billing brings checkout, stock visibility, branch control, and
            reporting into one workspace built for busy teams and growing shops.
          </p>
          <div className="ab-hero-actions">
            <Link className="btn btn-primary" to="/setup/onboard">Start Free Setup</Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                document.getElementById("downloads")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Download App
            </button>
          </div>
        </section>
      </div>

      {/* ---- STATS BAR ---- */}
      <div className="ab-stats">
        {stats.map((s) => (
          <div className="ab-stat" key={s.label}>
            <span className="ab-stat-value">{s.value}</span>
            <span className="ab-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ---- FEATURES ---- */}
      <section className="ab-section ab-section--features">
        <div className="ab-container">
          <div className="ab-section-head">
            <p className="ab-sec-label ab-sec-label--accent">Core capabilities</p>
            <h2 className="ab-sec-title ab-sec-title--white">Designed around how busy shops actually run.</h2>
            <p className="ab-sec-sub ab-sec-sub--light">
              Haappii Billing is shaped around the real daily rhythm of billing,
              setup, stock checks, and owner follow-up.
            </p>
          </div>

          <div className="ab-features">
            {features.map((item) => (
              <article className="ab-feat" key={item.title}>
                <div className="ab-feat-glow" style={{ background: item.color }} />
                <div className="ab-feat-icon" style={{ background: `${item.color}18`, fontSize: 28 }}>
                  {item.icon}
                </div>
                <span className="ab-feat-tag" style={{ background: `${item.color}14`, color: item.color }}>
                  {item.tag}
                </span>
                <h3 className="ab-feat-title">{item.title}</h3>
                <p className="ab-feat-desc">{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---- DOWNLOADS ---- */}
      <section className="ab-section ab-section--downloads" id="downloads">
        <div className="ab-container">
          <div className="ab-section-head">
            <p className="ab-sec-label ab-sec-label--purple">Access points</p>
            <h2 className="ab-sec-title ab-sec-title--dark">Use the product where your team needs it.</h2>
            <p className="ab-sec-sub ab-sec-sub--muted">
              Browser access, desktop install, and mobile app — all connected to the same workspace.
            </p>
          </div>

          <div className="ab-dl-grid">
            <article className="ab-dl-card ab-dl-card--web">
              <span className="ab-dl-chip ab-dl-chip--web">Web</span>
              <h3 className="ab-dl-title">Browser access</h3>
              <p className="ab-dl-sub">
                Log in from any supported browser to reach billing, setup, and daily
                operations without installing anything first.
              </p>
              <div className="ab-dl-actions">
                <Link className="btn btn-light" to="/login">Open Login</Link>
                <Link className="btn btn-ghost" to="/setup/onboard">Guided Setup</Link>
              </div>
            </article>

            <article className="ab-dl-card ab-dl-card--win">
              <span className="ab-dl-chip ab-dl-chip--win">Windows</span>
              <h3 className="ab-dl-title">Desktop app</h3>
              <p className="ab-dl-sub">
                {isWindows
                  ? "You're on Windows. Download the installer and launch the desktop app directly from here."
                  : "Download the Windows installer and run it on any Windows counter machine."}
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

            <article className="ab-dl-card ab-dl-card--android">
              <span className="ab-dl-chip ab-dl-chip--android">Android</span>
              <h3 className="ab-dl-title">Mobile app</h3>
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
        </div>
      </section>

      {/* ---- TEAM / CONTACT ---- */}
      <section className="ab-section ab-section--team">
        <div className="ab-container">
          <div className="ab-section-head">
            <p className="ab-sec-label ab-sec-label--cyan">Contact details</p>
            <h2 className="ab-sec-title ab-sec-title--white">Reach the Haappii Billing team directly.</h2>
            <p className="ab-sec-sub ab-sec-sub--light">
              Use the details below for quick support and product communication.
            </p>
          </div>

          {teamProfiles.length > 0 ? (
            <>
              <div className="ab-team-slider">
                <div
                  className="ab-team-track"
                  style={{ transform: `translateX(-${slideIndex * 100}%)` }}
                >
                  {teamProfiles.map((p) => (
                    <div className="ab-team-slide" key={p.profile_id}>
                      <div className="ab-team-img">
                        {p.photo_url ? (
                          <img src={p.photo_url} alt={p.name} loading="lazy" />
                        ) : (
                          <div className="ab-team-img-fallback">
                            {(p.name || "?").trim().charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="ab-team-info">
                        {p.role_title && <span className="ab-team-role">{p.role_title}</span>}
                        <h3 className="ab-team-name">{p.name}</h3>
                        {p.bio && <p className="ab-team-bio">{p.bio}</p>}
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                          {contactDetails.mobile && (
                            <span className="ab-team-contact-line">
                              {contactDetails.mobile}
                            </span>
                          )}
                          {contactDetails.email && (
                            <span className="ab-team-contact-line">
                              <a href={mailtoHref}>{contactDetails.email}</a>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {teamProfiles.length > 1 && (
                  <>
                    <button
                      className="ab-team-nav prev"
                      aria-label="Previous"
                      onClick={() => setSlideIndex((i) => (i - 1 + teamProfiles.length) % teamProfiles.length)}
                    >
                      &#8249;
                    </button>
                    <button
                      className="ab-team-nav next"
                      aria-label="Next"
                      onClick={() => setSlideIndex((i) => (i + 1) % teamProfiles.length)}
                    >
                      &#8250;
                    </button>
                  </>
                )}
              </div>

              {teamProfiles.length > 1 && (
                <div className="ab-team-dots">
                  {teamProfiles.map((_, i) => (
                    <button
                      key={i}
                      className={`ab-team-dot${i === slideIndex ? " active" : ""}`}
                      aria-label={`Slide ${i + 1}`}
                      onClick={() => setSlideIndex(i)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="ab-contact-card">
              <div className="ab-contact-media">
                {contactDetails.photo ? (
                  <img className="ab-contact-photo" src={contactDetails.photo} alt="Contact" loading="lazy" />
                ) : (
                  <span className="ab-contact-photo-fallback" aria-hidden="true">{contactInitial}</span>
                )}
              </div>
              <div className="ab-contact-list">
                <div className="ab-contact-item">
                  <span className="ab-contact-label">Name</span>
                  <span className="ab-contact-value">{contactDetails.name}</span>
                </div>
                <div className="ab-contact-item">
                  <span className="ab-contact-label">Mobile / WhatsApp</span>
                  <span className="ab-contact-value">{contactDetails.mobile}</span>
                </div>
                <div className="ab-contact-item">
                  <span className="ab-contact-label">Mail</span>
                  <span className="ab-contact-value">
                    <a href={mailtoHref}>{contactDetails.email}</a>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="ab-section ab-section--cta">
        <div className="ab-container">
          <div className="ab-cta">
            <div className="ab-cta-glow" />
            <div>
              <h3>Ready to modernize the way your team bills and tracks daily business?</h3>
              <p>
                Start setup in minutes — get instant access with your login credentials sent to your email.
              </p>
            </div>
            <div className="ab-hero-actions">
              <Link className="btn btn-primary" to="/setup/onboard">Get Started Free</Link>
              <Link className="btn btn-ghost" to="/login">Login</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---- FOOTER ---- */}
      <footer className="ab-footer">
        Copyright {new Date().getFullYear()} Haappii Billing. All rights reserved.
      </footer>
    </div>
  );
}
