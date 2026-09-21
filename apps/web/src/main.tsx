import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router.tsx";
import { CofreProvider } from "./storage/CofreProvider.tsx";
import "./i18n/index.ts";
import "./styles/app.css";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// The database is in this tab, so a query costs almost nothing and a retry
			// would only hide a real error.
			staleTime: 5_000,
			retry: false,
			refetchOnWindowFocus: false,
		},
	},
});

const container = document.querySelector("#root");
if (!container) {
	throw new Error("the root element is missing from index.html");
}

createRoot(container).render(
	<StrictMode>
		<CofreProvider>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</CofreProvider>
	</StrictMode>,
);
