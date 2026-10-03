// What the repository holds, and what git ignores, checked rather than assumed.
//
// The ignore file is a list of rules, and a rule that is wrong says nothing: a statement
// dropped at the root goes in with the next "add everything", a backup written into the clone
// by the guide's own command goes in with it, and nobody finds out until the repository is
// public. So this reads two things and only reads them. Every file git tracks, refused when it
// is something nobody should commit or larger than a source file ever is. And a list of
// canaries, paths that must be ignored and paths that must not, asked of git itself.
//
// Run by `pnpm check`, before every commit and in CI. Without git on the PATH it says so and
// passes, because a machine that cannot ask git cannot have committed anything either; in CI,
// where git is always there, not finding it is a failure.

import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Larger than any source file is, and smaller than any document worth worrying about. */
export const LARGEST = 1024 * 1024;

/** The one file that is legitimately larger: the lockfile is generated and long. */
const ALLOWED_LARGE = new Set(["pnpm-lock.yaml"]);

/** What a bank hands over, and what this application and the guides write out. */
const DOCUMENT = /\.(pdf|ofx|qfx|qif|csv|xls|xlsx|sql)$|\.json\.gz$|\.tar\.gz$/i;
const DATABASE = /\.(db|db-journal|db-wal|db-shm|sqlite|sqlite3)$/i;
const BACKUP = /(^|\/)cofre_[^/]*\.json$/i;

/** The canaries: these must be ignored. */
export const IGNORED = [
	"shots/a.png",
	"apps/web/shots/a.png",
	"samples/nubank/fatura.pdf",
	"fatura.ofx",
	"cofre.tar.gz",
	"CLAUDE.local.md",
	"apps/server/data/cofre.db",
	".env",
];

/** And these must not, or the camera, the samples README or a source folder go missing. */
export const KEPT = [
	"apps/web/e2e/shots.spec.ts",
	"samples/README.md",
	".env.example",
	"LICENSE",
	"packages/core/src/data/x.ts",
];

/**
 * Why a tracked file should not be tracked, or nothing.
 *
 * A path as git prints it, with forward slashes, and its size in bytes.
 */
export function reasonsFor(path, size) {
	const reasons = [];
	const name = path.split("/").at(-1) ?? path;
	if (DOCUMENT.test(path)) reasons.push("a statement, a spreadsheet, a backup or a dump");
	if (DATABASE.test(path)) reasons.push("a database");
	if (BACKUP.test(path)) reasons.push("a backup this application writes");
	if (/(^|\/)samples\//.test(path) && path !== "samples/README.md") {
		reasons.push("a sample document, which stays on the machine it was put on");
	}
	if (/(^|\/)shots\//.test(path)) reasons.push("a picture or a report taken for a review");
	if (/^\.env/.test(name) && name !== ".env.example") reasons.push("a file of secrets");
	if (/^\.dev\.vars/.test(name)) reasons.push("a file of secrets");
	if (name === "CLAUDE.md" || name === "CLAUDE.local.md") {
		reasons.push("notes to the tooling, kept out of the repository");
	}
	if (size > LARGEST && !ALLOWED_LARGE.has(path)) {
		reasons.push(`larger than ${LARGEST / 1024 / 1024} MB`);
	}
	return reasons;
}

function git(args) {
	return spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function main() {
	const probe = git(["--version"]);
	if (probe.error) {
		if (process.env.CI) {
			console.error("Repository: git is not on the PATH, and in CI it has to be.");
			process.exit(1);
		}
		console.log("Repository: git is not on the PATH here, so nothing was checked.");
		return;
	}

	const problems = [];

	const listed = git(["ls-files", "-z"]);
	if (listed.status !== 0) {
		console.error(`Repository: git could not list the files. ${listed.stderr.trim()}`);
		process.exit(1);
	}
	for (const path of listed.stdout.split("\0").filter(Boolean)) {
		let size = 0;
		try {
			size = statSync(path).size;
		} catch {
			// Tracked and deleted in the working copy: what matters is what is committed.
		}
		for (const reason of reasonsFor(path, size)) problems.push(`${path}: ${reason}`);
	}

	for (const path of IGNORED) {
		const asked = git(["check-ignore", "--no-index", "-q", path]);
		if (asked.status !== 0) problems.push(`${path}: should be ignored, and git does not ignore it`);
	}
	for (const path of KEPT) {
		const asked = git(["check-ignore", "--no-index", "-q", path]);
		if (asked.status === 0) problems.push(`${path}: is ignored, and has to stay in the repository`);
	}

	if (problems.length > 0) {
		console.error("Repository: what is tracked or ignored is not what it should be.\n");
		for (const problem of problems) console.error(`  ${problem}`);
		console.error(
			"\nA statement, a backup or a database stays outside the clone, in a folder of its own.",
		);
		process.exit(1);
	}
	console.log("Repository: clean.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
