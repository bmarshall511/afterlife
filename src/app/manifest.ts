import type { MetadataRoute } from "next";

/** Web app manifest: lets guests add AFTERLIFE to their home screen (optional; never required to play). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AFTERLIFE — Día de los Muertos party",
    short_name: "AFTERLIFE",
    description: "Play the party games, share photos, and remember loved ones.",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    background_color: "#050506",
    theme_color: "#050506",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
