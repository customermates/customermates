import { localDemoBaseUrl } from "@/components/marketing/product-demo-src";

export const PUBLIC_DEMO_ORIGIN = "https://demo.customermates.com";

export function homepageDemoBaseUrl(): string {
  return localDemoBaseUrl() ?? PUBLIC_DEMO_ORIGIN;
}
