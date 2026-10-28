"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Functional QR rendered from a real URL (snapshot.joinUrl). High-contrast black-on-white with quiet zone. */
export function JoinQR({ url, className, label }: { url: string; className?: string; label?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } })
      .then((s) => { if (alive) setSvg(s); }).catch(() => setSvg(null));
    return () => { alive = false; };
  }, [url]);
  // Library-generated SVG is converted to an <img> data URI (no innerHTML injection of strings).
  return (
    <div className={`qr ${className ?? ""}`}>
      {svg ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={label ?? `QR code to join: ${url}`} /> : <div className="qr-ph" />}
    </div>
  );
}

export function shortUrl(url: string): string {
  try { const u = new URL(url); return (u.host.replace(/^www\./, "") + u.pathname.replace(/\/$/, "")); } catch { return url; }
}
