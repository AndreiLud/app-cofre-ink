#!/usr/bin/env node
// The notes for one release, taken from the changelog, and a check that the release is
// coherent before anything is published.
//
// Three things have to agree, and the whole point of this script is that they cannot
// quietly stop agreeing: the tag that was pushed, the version in package.json, and a
// section in CHANGELOG.md. A release with notes nobody wrote is a release nobody can
// read six months later, and a tag that says one version while the package says
// another is a confusion that lives forever.
//
// Usage:
//   node scripts/releaseNotes.mjs v0.1.0        prints the notes, or fails saying why

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function stop(message) {
	console.error(message);
	process.exit(1);
}

const tag = process.argv[2];
if (!tag) stop("give it the tag, for example v0.1.0");

if (!/^v\d+\.\d+\.\d+(?:[.+][0-9A-Za-z.]+)?$/.test(tag)) {
	stop(`the tag ${tag} is not a version. Tags look like v0.1.0.`);
}

const version = tag.slice(1);

const declared = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
if (declared !== version) {
	stop(
		`the tag says ${version} and package.json says ${declared}. Change one of them so they agree.`,
	);
}

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");

// The section for this version, which runs from its heading to the next one.
const heading = new RegExp(`^## ${version.replace(/\./g, "\\.")}\\s*$`, "m");
const start = changelog.search(heading);
if (start === -1) stop(`CHANGELOG.md has no section called "## ${version}". Write one first.`);

const after = changelog.slice(start);
const next = after.slice(1).search(/^## /m);
const section = (next === -1 ? after : after.slice(0, next + 1)).trim();

const body = section.split("\n").slice(1).join("\n").trim();
if (body === "") stop(`the section for ${version} in CHANGELOG.md is empty.`);

console.log(body);
