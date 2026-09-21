import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./i18n/index.ts";
import "./styles/app.css";

const container = document.querySelector("#root");
if (!container) {
	throw new Error("the root element is missing from index.html");
}

createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
