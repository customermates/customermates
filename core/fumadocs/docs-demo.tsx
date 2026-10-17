import { BrowserFrame } from "@/components/marketing/browser-frame";

import { localProductDemoSrc } from "@/components/marketing/product-demo-src";
import { env } from "@/env";

type Props = {
  src: string;
  title: string;
};

export function DocsDemo({ src, title }: Props) {
  return <BrowserFrame embed={env.APP_MODE !== "self-hosted"} src={localProductDemoSrc(src)} title={title} />;
}
