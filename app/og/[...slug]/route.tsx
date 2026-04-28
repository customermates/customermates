import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { generateOgImage } from "../generate-og-image";

const logoDataUrlPromise = readFile(join(process.cwd(), "public/images/light/customermates-square.svg"), "utf8").then(
  (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
);

const interRegularPromise = readFile(
  join(process.cwd(), "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff"),
);
const interBoldPromise = readFile(
  join(process.cwd(), "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff"),
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawTitle = searchParams.get("title")?.trim() || "Customermates";
  const title = rawTitle.startsWith("Customermates") ? rawTitle : `Customermates - ${rawTitle}`;
  const description = searchParams.get("description")?.trim() || undefined;
  const [interRegular, interBold, logoDataUrl] = await Promise.all([
    interRegularPromise,
    interBoldPromise,
    logoDataUrlPromise,
  ]);

  return new ImageResponse(
    generateOgImage({
      description,
      logoDataUrl,
      title,
    }),
    {
      fonts: [
        {
          data: interRegular,
          name: "Inter",
          style: "normal",
          weight: 400,
        },
        {
          data: interBold,
          name: "Inter",
          style: "normal",
          weight: 700,
        },
      ],
      height: 630,
      width: 1200,
    },
  );
}
