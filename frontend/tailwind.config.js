export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0B3B91",
        secondary: "#0F52BA",
        accent: "#1B6FF0",
        panel: "#F6F8FF",
        border: "#E2E8F0"
      },
      boxShadow: {
        card: "0 10px 35px rgba(0,0,0,0.06)",
        glow: "0 0 18px rgba(27,111,240,.35)"
      }
    },
  },
  plugins: [],
};
