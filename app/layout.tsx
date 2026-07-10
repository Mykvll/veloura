import type { Metadata } from "next";
import { Cormorant_Garamond, Poppins, Alex_Brush } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

// Display serif — page titles, section/card headings (font-display).
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
  display: "swap",
});

// Body sans — default text, inputs, labels (font-body).
const body = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

// Script — decorative ONLY, for the "by CM" lockup (font-script).
const script = Alex_Brush({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-script",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Veloura by CM",
  description: "Dress rental in Metro Manila",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // Expose each font as a CSS variable; the brand color/body font are
      // applied in globals.css so every page inherits them.
      className={cn(
        "h-full antialiased",
        display.variable,
        body.variable,
        script.variable,
      )}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
