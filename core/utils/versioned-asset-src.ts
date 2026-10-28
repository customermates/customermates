export function versionedAssetSrc(src: string, version: string): string {
  return `${src}?v=${encodeURIComponent(version)}`;
}
