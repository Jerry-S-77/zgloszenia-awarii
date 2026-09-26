import { useEffect, useState } from "react";

/** Adresy `blob:` do podglądu plików z pamięci telefonu; zwalniane, gdy lista się zmieni. */
export function useAdresyBlobow(pliki: Blob[]): string[] {
  const [adresy, setAdresy] = useState<string[]>([]);
  useEffect(() => {
    const nowe = pliki.map((p) => URL.createObjectURL(p));
    setAdresy(nowe);
    return () => nowe.forEach((a) => URL.revokeObjectURL(a));
  }, [pliki]);
  return adresy;
}
