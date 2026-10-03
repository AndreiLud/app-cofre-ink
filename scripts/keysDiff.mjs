// Every interface text added, changed or removed since a tag, in both languages.
//
//   node scripts/keysDiff.mjs v1.0.5 apps/web/shots/keys_diff.txt
//
// Written for the report of a release, which lists what a person reads differently. The file is
// written by this script in UTF-8 and never through a redirect of the shell: PowerShell writes a
// redirect in another encoding, and every accented word came out garbled.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [tag, out] = process.argv.slice(2);
if (!tag || !out) {
	console.error("Usage: node scripts/keysDiff.mjs <tag> <file to write>");
	process.exit(1);
}

/** Every key of a translation file, flattened to a.b.c, with its text. */
function flatten(node, prefix = "", into = new Map()) {
	for (const [key, value] of Object.entries(node)) {
		const name = prefix === "" ? key : `${prefix}.${key}`;
		if (value !== null && typeof value === "object") flatten(value, name, into);
		else into.set(name, String(value));
	}
	return into;
}

function atTag(language) {
	const shown = spawnSync("git", ["show", `${tag}:apps/web/src/locales/${language}.json`], {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (shown.status !== 0) {
		console.error(`git could not read ${language}.json at ${tag}. ${shown.stderr ?? ""}`.trim());
		process.exit(1);
	}
	return flatten(JSON.parse(shown.stdout));
}

function now(language) {
	return flatten(JSON.parse(readFileSync(`apps/web/src/locales/${language}.json`, "utf8")));
}

const before = { pt: atTag("pt"), en: atTag("en") };
const after = { pt: now("pt"), en: now("en") };

const added = [...after.pt.keys()].filter((key) => !before.pt.has(key));
const removed = [...before.pt.keys()].filter((key) => !after.pt.has(key));
const changed = [...after.pt.keys()].filter(
	(key) =>
		before.pt.has(key) &&
		(before.pt.get(key) !== after.pt.get(key) || before.en.get(key) !== after.en.get(key)),
);

const lines = [`Interface texts since ${tag}`, ""];
const both = (key, from) => [
	`  ${key}`,
	`    pt: ${from.pt.get(key) ?? ""}`,
	`    en: ${from.en.get(key) ?? ""}`,
];

lines.push(`NEW (${added.length})`);
for (const key of added.sort()) lines.push(...both(key, after));
lines.push("", `CHANGED (${changed.length})`);
for (const key of changed.sort()) {
	lines.push(`  ${key}`);
	lines.push(`    pt before: ${before.pt.get(key) ?? ""}`);
	lines.push(`    pt now:    ${after.pt.get(key) ?? ""}`);
	lines.push(`    en before: ${before.en.get(key) ?? ""}`);
	lines.push(`    en now:    ${after.en.get(key) ?? ""}`);
}
lines.push("", `REMOVED (${removed.length})`);
for (const key of removed.sort()) lines.push(...both(key, before));

writeFileSync(out, `${lines.join("\n")}\n`, "utf8");
console.log(
	`${added.length} new, ${changed.length} changed, ${removed.length} removed since ${tag}, written to ${out}`,
);
