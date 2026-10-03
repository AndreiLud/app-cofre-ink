// Which version this page is, and whether it may write to the server it talks to.
//
// From the root package.json, which the build reads and writes in as a constant
// (vite.config.ts), so the page, the server and the image say the same version from the one
// place it is written. Not called use anything, which Biome would read as a hook.

import { parseVersion } from "@cofre/core";

declare const __APP_VERSION__: string;

/** The version of this release, as the root package.json says it: 2.0.0. */
export const APP_VERSION: string = __APP_VERSION__;

/**
 * A page and a server of the same major version, or which of the two is behind.
 *
 * Within a major version the two read and write the same rows, so a page of 2.0.0 on a server
 * of 2.1.0 is only a sentence. Across one, a write could carry fields one side does not know,
 * or miss fields the other requires, and lose them without a word. A server that does not say
 * its version is a 1.x, which never did.
 */
export type VersionMatch = "same" | "serverOlder" | "pageOlder";

export function versionMatchOf(page: string, server: string | null | undefined): VersionMatch {
	const mine = parseVersion(page);
	if (!mine) return "same";
	const theirs = server ? parseVersion(server) : null;
	if (!theirs || theirs.major < mine.major) return "serverOlder";
	if (theirs.major > mine.major) return "pageOlder";
	return "same";
}
