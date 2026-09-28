import { BrowserFrame } from "@/components/marketing/browser-frame";

import { localProductDemoSrc } from "@/components/marketing/product-demo-src";

type Props = {
  src: string;
  title: string;
};

export function DocsDemo({ src, title }: Props) {
  return <BrowserFrame src={localProductDemoSrc(src)} title={title} />;
}
