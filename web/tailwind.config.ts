import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        hairline: "hsl(var(--hairline))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        subtle: "hsl(var(--subtle-foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
          muted: "hsl(var(--surface-muted))",
          sunken: "hsl(var(--surface-sunken))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          soft: "hsl(var(--accent-soft))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          soft: "hsl(var(--warning-soft))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          soft: "hsl(var(--danger-soft))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          "foreground-strong": "hsl(var(--sidebar-foreground-strong))",
          border: "hsl(var(--sidebar-border))",
          muted: "hsl(var(--sidebar-muted))",
          accent: "hsl(var(--sidebar-accent))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "0 10px 28px -18px hsl(var(--shadow) / 0.35), 0 0 0 1px hsl(var(--border) / 0.18)",
        card: "4px 4px 0 hsl(var(--shadow) / 0.14)",
        hard: "5px 5px 0 hsl(var(--shadow))",
        lift: "8px 8px 0 hsl(var(--shadow)), 0 18px 40px -22px hsl(var(--shadow) / 0.5)",
        inset: "inset 2px 2px 0 hsl(var(--shadow) / 0.07)",
        focus: "0 0 0 4px hsl(var(--ring) / 0.24)",
      },
      fontFamily: {
        sans: [
          "Avenir Next",
          "Gill Sans",
          "Trebuchet MS",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
        display: ["Baskerville", "Times New Roman", "Songti SC", "serif"],
        mono: ["IBM Plex Mono", "Cascadia Code", "SF Mono", "Consolas", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter: "-0.025em",
        tight: "-0.015em",
      },
      animation: {
        enter: "enter 220ms cubic-bezier(0.2, 0.65, 0.25, 1) both",
        rise: "rise 380ms cubic-bezier(0.2, 0.65, 0.25, 1) both",
      },
      keyframes: {
        enter: {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
