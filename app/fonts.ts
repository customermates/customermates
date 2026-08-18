import localFont from "next/font/local";

export const latin = localFont({
  src: [
    {
      path: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
      weight: "400 700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-sans",
});

export const mono = localFont({
  src: [
    {
      path: "../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
      weight: "400 500",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-mono",
});

export const serif = localFont({
  src: [
    {
      path: "../node_modules/@fontsource-variable/lora/files/lora-latin-wght-normal.woff2",
      weight: "400 600",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource-variable/lora/files/lora-latin-wght-italic.woff2",
      weight: "400 600",
      style: "italic",
    },
  ],
  display: "swap",
  variable: "--font-serif",
});
