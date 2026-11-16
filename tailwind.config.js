/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        barbachu: {
          green: "#173c34",
          green2: "#28584c",
          gold: "#dba84c",
          goldDark: "#c8a84b",
          goldMuted: "#b58f3e",
          paper: "#ffffff",
          bg: "#f4f5ef",
          muted: "#738078",
          line: "#e5e8df",
          danger: "#a43d35"
        }
      },
      fontFamily: {
        serif: ["Playfair Display", "Georgia", "serif"],
        sans: ["DM Sans", "system-ui", "sans-serif"]
      }
    },
  },
  plugins: [],
}
