import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Zapytania działają też offline (lista awarii łączy lokalną kolejkę z danymi z bazy), a bez sieci
  // nie ponawiamy ich na próżno. Dane z poprzedniego pobrania zostają na ekranie mimo błędu.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "always",
        retry: (liczbaBledow) =>
          (typeof navigator === "undefined" || navigator.onLine) && liczbaBledow < 3,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
