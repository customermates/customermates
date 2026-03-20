export function ErrorIndicator() {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />

      <span className="relative inline-flex size-2 rounded-full bg-danger" />
    </span>
  );
}
