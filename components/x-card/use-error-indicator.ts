import { useEffect, useState } from "react";

export function useErrorIndicator(error: unknown, duration = 3000) {
  const [showErrorIndicator, setShowErrorIndicator] = useState(false);

  useEffect(() => {
    if (error) {
      setShowErrorIndicator(true);
      const timer = setTimeout(() => {
        setShowErrorIndicator(false);
      }, duration);
      return () => clearTimeout(timer);
    } else setShowErrorIndicator(false);
  }, [error, duration]);

  return showErrorIndicator;
}
