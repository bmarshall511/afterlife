import type { Metadata, Viewport } from "next";
import { Montserrat, Inter } from "next/font/google";
import "./globals.css";

const display = Montserrat({ subsets: ["latin", "latin-ext"], weight: ["300", "500", "700", "800"], variable: "--font-display", display: "swap" });
const ui = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: "AFTERLIFE",
  description: "A Día de los Muertos party game",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "AFTERLIFE", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#050506", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}
