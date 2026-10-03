// Whether a tag is the highest version published, which is the only one `latest` may point at.
//
// The image action put `latest` on every tag it built. A correction to the old line, a 1.2.2
// published after 2.0.0, would then have moved `latest` back to the old line, and everybody who
// follows it with `docker run` would have been taken backwards over a database that 2.0.0
// already migrated. So the release asks this first, and puts `latest` only on the highest.
//
// Only plain versions count: a tag that is not vX.Y.Z, or that is a preview, is neither the
// highest nor a reason for another tag not to be.

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The three numbers of a plain version tag, or nothing. A build suffix after a plus is ignored. */
export function versionOf(tag) {
	const found = /^v?(\d+)\.(\d+)\.(\d+)(\+.*)?$/.exec(String(tag).trim());
	if (!found) return null;
	return [Number(found[1]), Number(found[2]), Number(found[3])];
}

function compare(one, other) {
	for (let index = 0; index < 3; index += 1) {
		const difference = (one[index] ?? 0) - (other[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

/** Whether `tag` is at least as high as every plain version among `tags`. */
export function isHighest(tag, tags) {
	const mine = versionOf(tag);
	if (!mine) return false;
	return tags
		.map(versionOf)
		.filter((version) => version !== null)
		.every((version) => compare(mine, version) >= 0);
}

function main() {
	const tag = process.argv[2];
	if (!tag) {
		console.error("Which tag: node scripts/isHighestTag.mjs v2.0.0");
		process.exit(1);
	}
	const listed = spawnSync("git", ["tag", "--list", "v*"], { encoding: "utf8" });
	if (listed.status !== 0) {
		console.error(`git could not list the tags. ${listed.stderr ?? ""}`.trim());
		process.exit(1);
	}
	const tags = listed.stdout.split("\n").filter(Boolean);
	const answer = isHighest(tag, [...tags, tag]);
	console.log(`${tag} is ${answer ? "" : "not "}the highest version tagged.`);
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `highest=${answer}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
