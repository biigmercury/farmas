import type { MetadataRoute } from "next";

/** What a phone shows when a farmer adds FarmAs to the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FarmAs: Your AI Farm Companion",
    short_name: "FarmAs",
    description: "Talk to your farm. FarmAs turns everyday farm conversations into records, insights, health guidance and early warnings.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07260d",
    theme_color: "#07260d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
