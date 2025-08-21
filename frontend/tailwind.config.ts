import type { Config } from 'tailwindcss'
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { brand: { 500: "#6366F1", 600: "#4F46E5" } }
  } },
  plugins: [],
} satisfies Config
