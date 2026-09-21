// In browser mode there is no server to sign in to. What exists is a profile kept in
// this browser, plus a device name used by the change log and by the logical clock.
// The moment a server is configured, this profile is what gets linked to an account.

import { uuidV7 } from "@cofre/core";

const USER_KEY = "cofreUserId";
const DEVICE_KEY = "cofreDeviceId";
const SPACE_KEY = "cofreSpaceId";

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
		// A browser that refuses storage still works, it just forgets on reload.
	}
}

export function storedUserId(): string | null {
	return read(USER_KEY);
}

export function rememberUser(id: string): void {
	write(USER_KEY, id);
}

/** Short, stable and free of the separator the logical clock uses. */
export function deviceId(): string {
	const existing = read(DEVICE_KEY);
	if (existing) return existing;
	const created = uuidV7().replace(/-/g, "").slice(0, 12);
	write(DEVICE_KEY, created);
	return created;
}

export function storedSpaceId(): string | null {
	return read(SPACE_KEY);
}

export function rememberSpace(id: string): void {
	write(SPACE_KEY, id);
}

export function forgetProfile(): void {
	try {
		localStorage.removeItem(USER_KEY);
		localStorage.removeItem(SPACE_KEY);
	} catch {
		// Nothing to forget.
	}
}
