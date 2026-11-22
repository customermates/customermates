const HEX = Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, "0"));

export function uuidFromRandomBytes(source: Uint8Array): string {
  if (source.length !== 16) throw new Error("A UUID needs 16 random bytes.");
  const bytes = Uint8Array.from(source);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => HEX[value]);

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

type RandomSource = Pick<Crypto, "getRandomValues"> & { randomUUID?: Crypto["randomUUID"] };

export function installRandomUuidFallback(target: RandomSource | undefined = globalThis.crypto): void {
  if (!target || typeof target.randomUUID === "function") return;
  Object.defineProperty(target, "randomUUID", {
    configurable: true,
    writable: true,
    value: () => uuidFromRandomBytes(target.getRandomValues(new Uint8Array(16))),
  });
}
