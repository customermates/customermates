import React from "react";

export const i18nFormatters = {
  br: (_: React.ReactNode) => <br />,
  bold: (chunks: React.ReactNode) => <span className="font-bold">{chunks}</span>,
  italic: (chunks: React.ReactNode) => <span className="italic">{chunks}</span>,
  underline: (chunks: React.ReactNode) => <span className="underline">{chunks}</span>,
};
