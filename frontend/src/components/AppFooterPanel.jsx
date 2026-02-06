export default function AppFooterPanel() {
  return (
    <div className="mt-8 bg-primary text-white rounded-xl2 p-5 shadow-card flex items-center justify-between">

      <div className="flex items-center gap-3">
        <img
          src="/app-logo.png"
          alt="App Logo"
          className="h-10 w-10 rounded-lg bg-white/20"
        />
        <div>
          <h3 className="text-lg font-semibold">Shop Billing Application</h3>
          <p className="text-sm opacity-80">Smart Retail Management Suite</p>
        </div>
      </div>

      <p className="opacity-80 text-sm">
        © {new Date().getFullYear()} — All Rights Reserved
      </p>
    </div>
  );
}
