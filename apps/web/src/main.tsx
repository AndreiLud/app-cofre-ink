import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { keepWorkingOffline } from "./lib/install.ts";
import { router } from "./router.tsx";
import { CofreProvider } from "./storage/CofreProvider.tsx";
import { forgetPlacesThatAreGone } from "./storage/destinations.ts";
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

// What makes it open on a phone with no connection. It does nothing in development.
keepWorkingOffline();

// Before anything is drawn, and whether or not anybody opens the data screen. A place
// that stopped being a destination leaves its address and its secret in this browser, and
// in the case of a server of theirs that secret was the password of their account. The
// 1.0.3 notes said this happened the first time the application opened, and it happened on
// a read of the settings, which most people never did.
forgetPlacesThatAreGone();

createRoot(container).render(
	<StrictMode>
		<CofreProvider>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</CofreProvider>
	</StrictMode>,
);
