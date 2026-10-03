// Versions of this application, read and compared.
//
// The screen of updates says which version a copy is and whether a newer one was published,
// and a page and a server of different major versions must not write to each other. All of
// that is three numbers compared in order, which is a rule and lives here, where a test can
// reach it without a network.

export type Version = { major: number; minor: number; patch: number };

/**
 * The three numbers of a version, or nothing.
 *
 * `v2.0.0` and `2.0.0` alike, and a build suffix after a plus is ignored, because it says how
 * a copy was built and not which version it is. A preview, `2.1.0-rc.1`, is not a version a
 * copy is asked to update to, so it reads as nothing.
 */
export function parseVersion(text: string): Version | null {
	const found = /^v?(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.]+)?$/.exec(text.trim());
	if (!found) return null;
	return { major: Number(found[1]), minor: Number(found[2]), patch: Number(found[3]) };
}

/** Negative when `one` comes before `other`, positive after, zero for the same version. */
export function compareVersions(one: Version, other: Version): number {
	return one.major - other.major || one.minor - other.minor || one.patch - other.patch;
}

/** Where a copy stands against the latest version published. */
export type VersionState = "current" | "behind" | "ahead";

export function versionState(mine: Version, latest: Version): VersionState {
	const difference = compareVersions(mine, latest);
	if (difference === 0) return "current";
	return difference < 0 ? "behind" : "ahead";
}

/** Whether going from one to the other changes the major version, which is what breaks. */
export function crossesMajor(one: Version, other: Version): boolean {
	return one.major !== other.major;
}

/** Written as people read it, with the v in front. */
export function versionText(version: Version): string {
	return `v${version.major}.${version.minor}.${version.patch}`;
}
