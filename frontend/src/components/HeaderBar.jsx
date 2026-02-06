import { useEffect, useState } from "react";

export default function HeaderBar() {

  const [shop, setShop] = useState({
    name: "My Shop",
    logo: "/logo.png",
  });

  const [user, setUser] = useState({
    name: "Admin User"
  });

  const [date, setDate] = useState("");

  useEffect(() => {
    setDate(
      new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
    );

    // TODO: Later we will replace with real APIs
    // fetch("/api/shop/details").then(...)
    // fetch("/api/auth/me").then(...)
  }, []);

  const handleLogout = () => {
    // TODO: Implement after auth integration
    console.log("Logout clicked");
  };

  return (
    <div className="bg-card border border-border rounded-xl2 shadow-card p-5 flex justify-between items-center">

      {/* Shop Info */}
      <div className="flex items-center gap-4">
        <img
          src={shop.logo}
          alt="Shop Logo"
          className="h-12 w-12 rounded-xl2 border border-border shadow-soft object-cover"
        />
        <div>
          <h2 className="text-xl font-bold text-dark">{shop.name}</h2>
          <p className="text-gray-500">Billing & Inventory System</p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex items-center gap-6">

        <div className="text-right">
          <p className="text-sm text-gray-500">Logged in as</p>
          <p className="font-semibold text-dark">{user.name}</p>
        </div>

        <div className="px-4 py-2 bg-secondary border border-border rounded-xl2 text-dark shadow-soft">
          {date}
        </div>

        <button
          onClick={handleLogout}
          className="bg-primary text-white px-4 py-2 rounded-xl2 shadow-soft hover:bg-primaryLight transition"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
