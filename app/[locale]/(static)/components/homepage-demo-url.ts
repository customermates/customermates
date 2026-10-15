import { PUBLIC_DEMO_ORIGIN, localDemoBaseUrl } from "@/components/marketing/product-demo-src";

export function homepageDemoBaseUrl(): string {
  return localDemoBaseUrl() ?? PUBLIC_DEMO_ORIGIN;
}
