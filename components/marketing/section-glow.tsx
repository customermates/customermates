export function SectionGlow() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/3 -bottom-1/2 -z-10 bg-[radial-gradient(50%_60%_at_50%_100%,color-mix(in_oklab,var(--primary)_24%,transparent),transparent)]"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[15%] top-0 h-px bg-linear-to-r from-transparent via-foreground/25 to-transparent"
      />
    </>
  );
}
