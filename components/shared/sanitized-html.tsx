"use client";

import { useEffect, useState } from "react";

import { sanitizeHtml } from "./sanitize-html";

type Props = {
  html: string;
  className?: string;
};

export function SanitizedHtml({ html, className }: Props) {
  const [clean, setClean] = useState("");

  useEffect(() => {
    setClean(sanitizeHtml(html));
  }, [html]);

  return <div dangerouslySetInnerHTML={{ __html: clean }} className={className} />;
}
