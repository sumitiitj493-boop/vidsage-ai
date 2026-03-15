import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./hooks/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dark: {
          900: "#020612",
          800: "#0c1224",
          700: "#151f37",
          600: "#1f2949",
        },
      },
    },
  },
  plugins: [],
};

export default config;
