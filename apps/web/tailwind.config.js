/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        cyanBrand: {
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
        },
        surface: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          800: "#1e293b",
          900: "#0f172a",
          950: "#090d16",
        },
        clearance: {
          cleared: "#10b981",
          licence: "#f59e0b",
          rewrite: "#f43f5e",
          blocked: "#dc2626",
          insufficient: "#64748b",
        }
      },
    },
  },
  plugins: [],
};
