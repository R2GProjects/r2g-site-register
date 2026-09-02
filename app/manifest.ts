import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "R2G Site Register",
    short_name: "Site Register",
    description: "Sign in and out of R2G construction sites",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
