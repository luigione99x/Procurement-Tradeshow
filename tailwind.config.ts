import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6fe",
          200: "#bdd1fe",
          300: "#8fb3fd",
          400: "#5b8bfa",
          500: "#3566f2",
          600: "#2447e6",
          700: "#1e39c9",
          800: "#1f32a2",
          900: "#1e2f80",
        },
      },
    },
  },
  plugins: [],
};
export default config;
