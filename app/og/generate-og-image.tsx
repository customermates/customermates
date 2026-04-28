import type { ReactElement } from "react";

type GenerateOgImageProps = {
  description?: string;
  logoDataUrl: string;
  title: string;
};

export function generateOgImage({ description, logoDataUrl, title }: GenerateOgImageProps): ReactElement {
  const titleFontSize = title.length > 80 ? 48 : title.length > 40 ? 60 : 76;
  const descriptionFontSize =
    description && description.length > 200 ? 30 : description && description.length > 100 ? 36 : 42;

  return (
    <div
      style={{
        backgroundColor: "rgb(10, 10, 10)",
        backgroundImage:
          "radial-gradient(circle at 12% 12%, rgba(23, 201, 100, 0.06), rgba(23, 201, 100, 0) 36%), radial-gradient(circle at 88% 88%, rgba(0, 111, 238, 0.05), rgba(0, 111, 238, 0) 38%), radial-gradient(circle at 78% 28%, rgba(147, 51, 234, 0.04), rgba(147, 51, 234, 0) 32%), linear-gradient(180deg, rgba(255, 255, 255, 0.008) 0%, rgba(255, 255, 255, 0) 45%)",
        color: "white",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "64px",
        fontFamily: "Inter",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div
          style={{
            color: "white",
            display: "flex",
            fontSize: titleFontSize,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            overflowWrap: "normal",
            wordBreak: "normal",
          }}
        >
          {title}
        </div>

        {description ? (
          <div
            style={{
              color: "rgb(163, 163, 163)",
              display: "flex",
              fontSize: descriptionFontSize,
              lineHeight: 1.4,
              maxWidth: "1000px",
              overflowWrap: "normal",
              wordBreak: "normal",
            }}
          >
            {description}
          </div>
        ) : null}
      </div>

      <div
        style={{
          alignItems: "center",
          display: "flex",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" height="64" src={logoDataUrl} style={{ height: "64px" }} />
      </div>
    </div>
  );
}
