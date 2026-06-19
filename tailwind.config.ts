import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        hospital: {
          ink: "#132238",
          muted: "#64748b",
          surface: "#f8fbff",
          line: "#dbe7f3"
        }
      },
      boxShadow: {
        soft: "0 12px 35px rgba(42, 63, 98, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
