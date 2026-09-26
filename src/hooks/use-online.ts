import { useSyncExternalStore } from "react";

function subskrybuj(zmiana: () => void) {
  window.addEventListener("online", zmiana);
  window.addEventListener("offline", zmiana);
  return () => {
    window.removeEventListener("online", zmiana);
    window.removeEventListener("offline", zmiana);
  };
}

/** Stan połączenia przeglądarki; na serwerze (SSR) zakładamy połączenie. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subskrybuj,
    () => navigator.onLine,
    () => true,
  );
}
