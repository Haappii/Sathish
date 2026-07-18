import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config/api";

const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

const getItemImageUrl = (filename) => {
  if (!filename) return null;
  if (filename.startsWith("http")) return filename;
  return `${API_BASE}/item-images/${filename}`;
};

const fmtPrice = (p) => `₹${Math.round(Number(p || 0))}`;

function calcDiscountedPrice(price, discount) {
  if (!discount?.enabled || !discount.value) return null;
  if (discount.type === "percent") return Math.round(price * (1 - discount.value / 100));
  return Math.max(0, Math.round(price - discount.value));
}

export default function PublicBranchMenu() {
  const { slug, token } = useParams();
  const actualToken = token || slug;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeCat, setActiveCat] = useState(null);

  useEffect(() => {
    const path = token ? `/public/menu/${slug}/${token}/bootstrap` : `/public/menu/${actualToken}/bootstrap`;
    api.get(path)
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.response?.status === 404 ? "This menu is not available." : "Failed to load menu."));
  }, [slug, token, actualToken]);

  if (error) return <ErrorView message={error} />;
  if (!data) return <LoadingView />;

  const { shop, branch, categories, items, discount } = data;
  const filtered = activeCat ? items.filter((i) => i.category_id === activeCat) : items;
  const grouped = {};
  filtered.forEach((item) => {
    const cat = categories.find((c) => c.category_id === item.category_id);
    const name = cat?.category_name || "Other";
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(item);
  });

  return (
    <div className="pm">
      {/* Header */}
      <header className="pm-header">
        <div className="pm-header-glow" />
        <div className="pm-header-grid" />
        <div className="pm-header-inner">
          {shop.logo_url && <img src={shop.logo_url} alt="" className="pm-logo" />}
          <div>
            <h1 className="pm-shop">{shop.shop_name}</h1>
            <p className="pm-branch">
              {branch.branch_name}
              {branch.address_line1 ? ` · ${branch.address_line1}` : ""}
              {branch.city ? `, ${branch.city}` : ""}
              {branch.pincode ? ` - ${branch.pincode}` : ""}
            </p>
          </div>
        </div>
      </header>

      {/* Category Pills */}
      <nav className="pm-cats">
        <button className={`pm-pill${activeCat === null ? " on" : ""}`} onClick={() => setActiveCat(null)}>All</button>
        {categories.map((c) => (
          <button key={c.category_id} className={`pm-pill${activeCat === c.category_id ? " on" : ""}`}
            onClick={() => setActiveCat(c.category_id)}>{c.category_name}</button>
        ))}
      </nav>

      {/* Items */}
      <main className="pm-body">
        {Object.entries(grouped).map(([catName, catItems]) => (
          <section key={catName}>
            <h2 className="pm-cat-head">{catName}</h2>
            <div className="pm-grid">
              {catItems.map((item) => {
                const img = getItemImageUrl(item.image_filename);
                const disc = calcDiscountedPrice(item.price, discount);
                return (
                  <div key={item.item_id} className="pm-card">
                    <div className="pm-img-wrap">
                      {img ? <img src={img} alt={item.item_name} className="pm-img" loading="lazy" />
                        : <div className="pm-img-ph"><span>🍽️</span></div>}
                      {disc !== null && (
                        <span className="pm-off-tag">
                          {discount.type === "percent" ? `${discount.value}%` : `₹${Math.round(discount.value)}`} OFF
                        </span>
                      )}
                    </div>
                    <div className="pm-info">
                      <p className="pm-name">{item.item_name}</p>
                      <div className="pm-prices">
                        {disc !== null ? (<>
                          <span className="pm-price">{fmtPrice(disc)}</span>
                          <span className="pm-old">{fmtPrice(item.price)}</span>
                        </>) : (
                          <span className="pm-price">{fmtPrice(item.price)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {filtered.length === 0 && <div className="pm-empty"><span>📋</span><p>No items in this category.</p></div>}
      </main>

      {/* Footer — always show GST info */}
      <footer className="pm-footer">
        <div className="pm-footer-left">
          <span className="pm-footer-shop">{shop.shop_name}</span>
          <span className="pm-footer-sep">·</span>
          <span>{branch.branch_name}</span>
        </div>
        <div className="pm-footer-right">
          {shop.gst_enabled ? (
            <>
              <span className="pm-gst-label">GST {shop.gst_mode === "inclusive" ? "Inclusive" : "Exclusive"}</span>
              <span className="pm-gst-pct">{shop.gst_percent}%</span>
            </>
          ) : (
            <span className="pm-gst-label">Prices shown are final</span>
          )}
        </div>
      </footer>

      <Styles />
    </div>
  );
}

function LoadingView() {
  return <div className="pm-center"><div className="pm-spin" /><p className="pm-lt">Loading menu...</p><Styles /></div>;
}
function ErrorView({ message }) {
  return <div className="pm-center"><div className="pm-err"><span>🍽️</span><h2>Menu Unavailable</h2><p>{message}</p></div><Styles /></div>;
}

function Styles() {
  return <style>{`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap');
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,sans-serif;background:#0a0a0b;color:#f0f0f2;-webkit-font-smoothing:antialiased}
::selection{background:rgba(108,99,255,.3)}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#0a0a0b}::-webkit-scrollbar-thumb{background:#2a2a30;border-radius:3px}

.pm{min-height:100vh;background:#0a0a0b;padding-bottom:72px}

/* Center states */
.pm-center{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0b}
.pm-spin{width:36px;height:36px;border:3px solid #2a2a30;border-top-color:#6c63ff;border-radius:50%;animation:s .7s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
.pm-lt{color:#6b6b76;margin-top:14px;font-size:13px}
.pm-err{text-align:center;padding:48px 32px;background:#16161a;border:1px solid #2a2a30;border-radius:20px;max-width:360px}
.pm-err span{font-size:48px;display:block;margin-bottom:12px}
.pm-err h2{font-size:18px;font-weight:700;color:#f0f0f2;margin-bottom:6px}
.pm-err p{color:#6b6b76;font-size:13px}

/* Header */
.pm-header{position:relative;overflow:hidden;border-bottom:1px solid #2a2a30}
.pm-header-glow{position:absolute;top:-120px;right:-80px;width:400px;height:400px;background:radial-gradient(circle,rgba(108,99,255,.12) 0%,transparent 70%);pointer-events:none}
.pm-header-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(108,99,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(108,99,255,.03) 1px,transparent 1px);background-size:50px 50px;pointer-events:none}
.pm-header-inner{position:relative;z-index:1;display:flex;align-items:center;gap:18px;padding:36px 28px;max-width:960px;margin:0 auto}
.pm-logo{width:64px;height:64px;border-radius:18px;object-fit:cover;border:2px solid #2a2a30;flex-shrink:0;box-shadow:0 4px 20px rgba(0,0,0,.4)}
.pm-shop{font-family:'Space Grotesk','Inter',sans-serif;font-size:clamp(24px,5vw,34px);font-weight:800;letter-spacing:-1px;line-height:1.1;background:linear-gradient(135deg,#6c63ff 0%,#48bfe3 50%,#72efdd 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.pm-branch{font-size:13px;color:#a0a0ab;margin-top:8px;line-height:1.5}

/* Discount */
.pm-discount{background:linear-gradient(90deg,rgba(108,99,255,.15),rgba(72,191,227,.1));border-bottom:1px solid #2a2a30;padding:14px 28px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:14px;font-weight:600;color:#a0a0ab}
.pm-discount-badge{background:linear-gradient(135deg,#6c63ff,#48bfe3);color:#fff;font-size:11px;font-weight:800;padding:5px 14px;border-radius:999px;letter-spacing:.5px}

/* Category pills */
.pm-cats{display:flex;gap:8px;padding:16px 28px;overflow-x:auto;background:#111113;border-bottom:1px solid #2a2a30;position:sticky;top:0;z-index:20;scrollbar-width:none}
.pm-cats::-webkit-scrollbar{display:none}
.pm-pill{padding:9px 22px;border-radius:999px;border:1.5px solid #2a2a30;background:transparent;color:#a0a0ab;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .2s;font-family:inherit}
.pm-pill:hover{border-color:#6c63ff;color:#f0f0f2}
.pm-pill.on{background:linear-gradient(135deg,#6c63ff,#48bfe3);color:#fff;border-color:transparent;box-shadow:0 2px 12px rgba(108,99,255,.3)}

/* Body */
.pm-body{padding:28px 28px 20px;max-width:960px;margin:0 auto}
.pm-body section{margin-bottom:40px}

/* Category heading */
.pm-cat-head{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:700;color:#a0a0ab;text-transform:uppercase;letter-spacing:2px;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid #2a2a30;display:flex;align-items:center;gap:10px}
.pm-cat-head::before{content:'';width:4px;height:18px;border-radius:2px;background:linear-gradient(180deg,#6c63ff,#48bfe3)}

/* Grid */
.pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}

/* Card */
.pm-card{background:#16161a;border:1px solid #2a2a30;border-radius:16px;overflow:hidden;transition:transform .25s,box-shadow .25s,border-color .25s}
.pm-card:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.4);border-color:#3a3a42}

.pm-img-wrap{position:relative;width:100%;height:160px;overflow:hidden;background:#111113}
.pm-img{width:100%;height:100%;object-fit:cover;transition:transform .35s}
.pm-card:hover .pm-img{transform:scale(1.06)}
.pm-img-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#16161a,#111113);font-size:40px}

.pm-off-tag{position:absolute;top:10px;right:10px;background:linear-gradient(135deg,#6c63ff,#48bfe3);color:#fff;font-size:10px;font-weight:800;padding:4px 10px;border-radius:999px;letter-spacing:.5px;box-shadow:0 2px 10px rgba(108,99,255,.4)}

.pm-info{padding:14px 16px}
.pm-name{font-size:14px;font-weight:600;color:#f0f0f2;line-height:1.3;margin-bottom:8px}
.pm-prices{display:flex;align-items:center;gap:8px}
.pm-price{font-size:18px;font-weight:800;background:linear-gradient(135deg,#6c63ff,#48bfe3);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.pm-old{font-size:13px;color:#6b6b76;text-decoration:line-through}

/* Empty */
.pm-empty{text-align:center;padding:60px 20px;color:#6b6b76}
.pm-empty span{font-size:44px;display:block;margin-bottom:12px}

/* Footer */
.pm-footer{position:fixed;bottom:0;left:0;right:0;background:rgba(17,17,19,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-top:1px solid #2a2a30;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;font-size:13px;z-index:30}
.pm-footer-left{display:flex;align-items:center;gap:8px;color:#6b6b76;font-weight:500}
.pm-footer-shop{color:#a0a0ab;font-weight:600}
.pm-footer-sep{color:#3a3a42}
.pm-footer-right{display:flex;align-items:center;gap:8px}
.pm-gst-label{color:#a0a0ab;font-weight:500}
.pm-gst-pct{background:rgba(108,99,255,.15);color:#6c63ff;padding:4px 12px;border-radius:999px;font-weight:700;font-size:12px;border:1px solid rgba(108,99,255,.2)}

/* Responsive */
@media(max-width:640px){
  .pm-header-inner{padding:24px 18px;gap:14px}
  .pm-logo{width:48px;height:48px;border-radius:14px}
  .pm-body{padding:18px 14px}
  .pm-cats{padding:12px 14px}
  .pm-grid{grid-template-columns:repeat(2,1fr);gap:10px}
  .pm-img-wrap{height:120px}
  .pm-info{padding:10px 12px}
  .pm-name{font-size:12px}
  .pm-price{font-size:15px}
  .pm-footer{padding:10px 14px;font-size:11px}
  .pm-discount{padding:10px 14px;font-size:12px}
}
  `}</style>;
}
