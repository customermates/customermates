import type { BrandLogoType } from "./brand-image";

export type StoredBrand = { accentColor: string | null; logoKey: string | null };

export type BrandLogoWrite = { bytes: Uint8Array; type: BrandLogoType; key: string };

export type BrandPatch = { accentColor?: string | null; logo?: BrandLogoWrite | null };

export type StoredBrandLogo = { bytes: Uint8Array; type: string };

export abstract class WorkspaceBrandRepo {
  abstract find(): Promise<StoredBrand | null>;
  abstract save(patch: BrandPatch): Promise<StoredBrand>;
  abstract findLogoByKeyUnscoped(logoKey: string): Promise<StoredBrandLogo | null>;
}
