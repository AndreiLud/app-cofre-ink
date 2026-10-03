// Asking GitHub which version was published last, when somebody presses the button.
//
// Never on a schedule: rule 5 says nothing leaves the owner's server without somebody asking,
// and a server that asked every day would tell GitHub every day that it exists. The answer is
// kept an hour and a failure five minutes, so a second press does not ask again, and presses
// that arrive together share one request.

import { CloudError, type PublishedRelease, type Releases } from "@cofre/cloud";
import { parseVersion, type Version, versionState, versionText } from "@cofre/core";

/** What reads the published versions: GitHub on a real server, a stub in a test. */
export type ReleasesReader = (mine: Version) => Promise<Releases>;

const ANSWER_KEPT = 60 * 60 * 1000;
const FAILURE_KEPT = 5 * 60 * 1000;

/** A published version as the page receives it, with the version written out. */
export type ReleaseSaid = {
	version: string;
	publishedOn: string | null;
	notes: string;
	page: string;
};

export type UpdateAnswer = {
	/** The version this server runs. */
	version: string;
	state: "current" | "behind" | "ahead";
	/** When GitHub was asked, in milliseconds, which the screen says as an hour. */
	checkedAt: number;
	latest: ReleaseSaid | null;
	/** Every version newer than this one, the highest first. */
	newer: ReleaseSaid[];
};

/** The names a failure has, which the page says in a sentence each. */
export type UpdateFailure = "githubRefused" | "githubUnreachable" | "githubUnreadable";

export type UpdateCheck = () => Promise<
	{ ok: true; answer: UpdateAnswer } | { ok: false; error: UpdateFailure }
>;

function said(release: PublishedRelease): ReleaseSaid {
	return {
		version: versionText(release.version),
		publishedOn: release.publishedOn,
		notes: release.notes,
		page: release.page,
	};
}

/** What a failure is called: refused, nothing answered, or an answer nobody can read. */
export function failureOf(reason: unknown): UpdateFailure {
	if (reason instanceof CloudError) {
		if (reason.status === 0) return "githubUnreachable";
		if (reason.status === 403 || reason.status === 429) return "githubRefused";
	}
	return "githubUnreadable";
}

export function createUpdateCheck(input: {
	version: string;
	releases: ReleasesReader;
	now?: () => number;
}): UpdateCheck {
	const now = input.now ?? Date.now;
	const mine = parseVersion(input.version) ?? { major: 0, minor: 0, patch: 0 };
	let kept: {
		until: number;
		result: { ok: true; answer: UpdateAnswer } | { ok: false; error: UpdateFailure };
	} | null = null;
	let asking: Promise<
		{ ok: true; answer: UpdateAnswer } | { ok: false; error: UpdateFailure }
	> | null = null;

	return async () => {
		if (kept && now() < kept.until) return kept.result;
		if (asking) return asking;

		asking = (async () => {
			try {
				const found = await input.releases(mine);
				const latest = found.latest;
				const answer: UpdateAnswer = {
					version: versionText(mine),
					state: latest ? versionState(mine, latest.version) : "current",
					checkedAt: now(),
					latest: latest ? said(latest) : null,
					newer: found.newer.map(said),
				};
				const result = { ok: true as const, answer };
				kept = { until: now() + ANSWER_KEPT, result };
				return result;
			} catch (reason) {
				const result = { ok: false as const, error: failureOf(reason) };
				kept = { until: now() + FAILURE_KEPT, result };
				return result;
			} finally {
				asking = null;
			}
		})();
		return asking;
	};
}
