// Which versions of this application were published, read from GitHub.
//
// Asked only when somebody presses the button on a server, never on its own: rule 5 says
// nothing leaves the owner's server without an explicit action, and asking a third party which
// version is the latest is something leaving. What GitHub sees is the address of the server
// asking and nothing else: no token, no cookie and no name of this application, so it learns
// as little as a request can tell it.
//
// The list of releases and never "the latest release": GitHub calls latest whatever was
// published last, so a correction to the old line published after 2.0.0, a 1.2.2, would be
// called the latest and the screen would tell a server on 2.0.0 that it is ahead.

import { compareVersions, parseVersion, type Version } from "@cofre/core";
import { CloudError, callJson, type Fetcher } from "./http.ts";

export const RELEASES_URL =
	"https://api.github.com/repos/AndreiLud/app-cofre-ink/releases?per_page=10";

/** The page of a version, built from the version read and never from a link in the answer. */
export function releasePageOf(version: Version): string {
	return `https://github.com/AndreiLud/app-cofre-ink/releases/tag/v${version.major}.${version.minor}.${version.patch}`;
}

/** Notes past this are cut, because they are shown and not read as a document. */
export const NOTES_LIMIT = 8000;

/** How long the server waits for GitHub before saying it did not answer. */
export const WAIT = 10_000;

export type PublishedRelease = {
	version: Version;
	/** The day it was published, as a calendar day. */
	publishedOn: string | null;
	/** Plain text, cut at the limit. The screen makes elements of it, never markup. */
	notes: string;
	page: string;
};

export type Releases = {
	/** The highest version published, whenever it was published. */
	latest: PublishedRelease | null;
	/** Every published version newer than the one asking, the highest first. */
	newer: PublishedRelease[];
};

type GitHubRelease = {
	tag_name?: unknown;
	draft?: unknown;
	prerelease?: unknown;
	published_at?: unknown;
	body?: unknown;
};

function releaseOf(raw: GitHubRelease): PublishedRelease | null {
	if (raw.draft === true || raw.prerelease === true) return null;
	if (typeof raw.tag_name !== "string") return null;
	const version = parseVersion(raw.tag_name);
	if (!version) return null;
	const notes = typeof raw.body === "string" ? raw.body : "";
	return {
		version,
		publishedOn:
			typeof raw.published_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw.published_at)
				? raw.published_at.slice(0, 10)
				: null,
		notes: notes.length > NOTES_LIMIT ? `${notes.slice(0, NOTES_LIMIT)}…` : notes,
		page: releasePageOf(version),
	};
}

/**
 * The published versions, against the one asking.
 *
 * Drafts, previews and tags that are not a version are left out. One GET, with the headers a
 * plain request has and no others.
 */
export async function readReleases(
	mine: Version,
	options: { fetcher?: Fetcher; wait?: number } = {},
): Promise<Releases> {
	let raw: unknown;
	try {
		raw = await callJson<unknown>(RELEASES_URL, {
			fetcher: options.fetcher,
			where: "GitHub",
			headers: { Accept: "application/vnd.github+json" },
			signal: AbortSignal.timeout(options.wait ?? WAIT),
		});
	} catch (reason) {
		if (reason instanceof CloudError) throw reason;
		// An answer that is not JSON is an answer nobody can read.
		throw new CloudError("GitHub", 200, reason instanceof Error ? reason.message : "");
	}
	if (!Array.isArray(raw)) throw new CloudError("GitHub", 200, "not a list of releases");

	const published = (raw as GitHubRelease[])
		.map(releaseOf)
		.filter((one): one is PublishedRelease => one !== null)
		.sort((one, other) => compareVersions(other.version, one.version));

	return {
		latest: published[0] ?? null,
		newer: published.filter((one) => compareVersions(one.version, mine) > 0),
	};
}
