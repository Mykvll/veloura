// tailwind.config.ts
// Veloura by CM — brand design tokens for Tailwind.
//
// NOTE: This project runs Tailwind v4, which is CSS-first and does NOT
// auto-load a JS/TS config. This file is loaded explicitly from
// app/globals.css via the `@config "../tailwind.config.ts"` directive.
// The token values below come straight from design/design-tokens.md.
//
// Fonts are referenced through CSS variables (var(--font-*)) that are set by
// next/font/google in app/layout.tsx.

import type { Config } from "tailwindcss";

export default {
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#B08A3E",
          "primary-hover": "#9C7B3C",
          "primary-active": "#7F6222",
          "primary-soft": "#C9A45C",
          secondary: "#BCA98F",
          "secondary-hover": "#A69377",
        },
        background: {
          page: "#F7F1E6",
          card: "#FDFAF4",
          panel: "#F1E8D8",
          inverse: "#37302A",
        },
        text: {
          primary: "#4A4238",
          heading: "#37302A",
          secondary: "#6B6052",
          accent: "#9C7B3C",
          "on-primary": "#FFFFFF",
        },
        border: {
          soft: "#E3D6BE",
          strong: "#D2C0A2",
          accent: "#B08A3E",
        },
        state: {
          success: "#6E7F4F",
          error: "#A25B4C",
        },
        overlay: {
          scrim: "rgb(55 48 42 / 0.45)",
          "scrim-heavy": "rgb(55 48 42 / 0.7)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", '"Helvetica Neue"', "sans-serif"],
        script: ["var(--font-script)", "cursive"],
        // Section titles (the ✦ TITLE ✦ headings) — Marcellus, per the design
        // project's SectionTitle component.
        section: ["var(--font-section)", "Georgia", "serif"],
        // Home-page hero tagline only — not part of the general type system.
        "hero-serif": ["var(--font-hero-serif)", "Georgia", "serif"],
        "hero-script": ["var(--font-hero-script)", "cursive"],
      },
      fontSize: {
        "display-2xl": ["4rem", { lineHeight: "1.05", fontWeight: "500", letterSpacing: "0.12em" }],
        "display-xl": ["2.75rem", { lineHeight: "1.1", fontWeight: "500", letterSpacing: "0.12em" }],
        "display-lg": ["2rem", { lineHeight: "1.15", fontWeight: "500", letterSpacing: "0.12em" }],
        "display-md": ["1.5rem", { lineHeight: "1.2", fontWeight: "600", letterSpacing: "0.12em" }],
        logo: ["1.25rem", { lineHeight: "1", fontWeight: "600", letterSpacing: "0.14em" }],
        "body-lg": ["1.0625rem", { lineHeight: "1.65" }],
        "body-base": ["0.9375rem", { lineHeight: "1.6" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.55" }],
        "label-base": ["0.8125rem", { lineHeight: "1.3", fontWeight: "500", letterSpacing: "0.18em" }],
        "label-sm": ["0.6875rem", { lineHeight: "1.3", fontWeight: "500", letterSpacing: "0.18em" }],
        "price-lg": ["1.75rem", { lineHeight: "1.2", fontWeight: "600" }],
        "price-base": ["1.125rem", { lineHeight: "1.3", fontWeight: "600" }],
        "script-lg": ["2.25rem", { lineHeight: "1.2" }],
      },
      letterSpacing: {
        display: "0.12em",
        label: "0.18em",
        wide: "0.08em",
      },
      spacing: {
        tap: "2.75rem", // 44px minimum hit target
        "page-max": "75rem", // 1200px content width
      },
      borderRadius: {
        sm: "0.5rem", // 8 — inputs, tags
        md: "0.875rem", // 14 — panels
        lg: "1.25rem", // 20 — cards, modals
        tag: "0.25rem", // 4 — photo-corner badges
        pill: "999px",
      },
      boxShadow: {
        card: "0 2px 12px rgb(74 66 56 / 0.08)",
        float: "0 12px 40px rgb(55 48 42 / 0.18)",
        focus: "0 0 0 3px rgb(176 138 62 / 0.35)",
      },
      transitionDuration: { fast: "150ms", medium: "280ms" },
      transitionTimingFunction: { soft: "cubic-bezier(0.25, 0.1, 0.25, 1)" },
      screens: { mobile: { max: "719px" } },
    },
  },
} satisfies Config;
