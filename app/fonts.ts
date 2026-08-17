import localFont from "next/font/local";

export const latin = localFont({
  src: [
    { path: "../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-sans",
});

export const mono = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-mono",
});

export const serif = localFont({
  src: [
    { path: "../node_modules/@fontsource/lora/files/lora-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/lora/files/lora-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../node_modules/@fontsource/lora/files/lora-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../node_modules/@fontsource/lora/files/lora-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../node_modules/@fontsource/lora/files/lora-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../node_modules/@fontsource/lora/files/lora-latin-600-italic.woff2", weight: "600", style: "italic" },
  ],
  display: "swap",
  variable: "--font-serif",
});
