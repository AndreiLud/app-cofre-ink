// Where this browser keeps its money data: here, or on a server the person runs.
// The choice is remembered per device, because it is a property of the device and not
// of the person.

export type StorageMode = "browser" | "server";

const MODE_KEY = "cofreMode";
const SERVER_KEY = "cofreServer";

function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Without storage the choice lasts for this tab, which is still usable.
	}
}

export function storedMode(): StorageMode | null {
	const value = read(MODE_KEY);
	return value === "browser" || value === "server" ? value : null;
}

export function storedServer(): string | null {
	return read(SERVER_KEY);
}

export function rememberMode(mode: StorageMode, server?: string): void {
	write(MODE_KEY, mode);
	if (mode === "server" && server) write(SERVER_KEY, normaliseServer(server));
}

export function forgetMode(): void {
	try {
		localStorage.removeItem(MODE_KEY);
		localStorage.removeItem(SERVER_KEY);
	} catch {
		// Nothing to forget.
	}
}

/** Accepts what a person types and turns it into an address a browser can call. */
export function normaliseServer(value: string): string {
	const trimmed = value.trim().replace(/\/+$/, "");
	if (trimmed === "") return trimmed;
	if (/^https?:\/\//.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}
