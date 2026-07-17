import type { Metadata, Viewport } from "next";
import { Geist, Syne, Cinzel, Manrope, JetBrains_Mono, Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { PHProvider } from "@/components/posthog-provider";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-cinzel",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

// Exposes --font-jetbrains, not --font-mono: --font-mono is a design token in
// globals.css. Sharing the name made that token reference itself.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

// Loaded as the safety net for legacy "Inter, sans-serif" literals scattered
// across surfaces. New/polished code should use var(--font-sans) (Geist).
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Advance Estate — CRM Inmobiliario",
  description: "CRM inmobiliario con IA para RE/MAX Advance",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AE CRM",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#C9963A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;

  // The next/font variables must live on <html>, not <body>: globals.css declares
  // the design tokens (--font-sans and friends) on :root, and a var() inside a
  // custom property is resolved on the element that declares it. With the fonts on
  // <body> those tokens resolved against nothing and the app fell back to serif.
  return (
    <html
      lang="es"
      className={`${cinzel.variable} ${geist.variable} ${syne.variable} ${manrope.variable} ${mono.variable} ${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="h-full">
        <PHProvider>
          <ThemeProvider nonce={nonce}>
            {children}
            <Toaster richColors position="top-right" />
          </ThemeProvider>
        </PHProvider>
      </body>
    </html>
  );
}
