export function refreshAccountStateWhenVisible(refresh: () => void): () => void {
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") refresh();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
}
