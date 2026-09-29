#!/usr/bin/env node
// The table of what each role may do, written from the matrix rather than by hand.
//
// It was written by hand, and it drifted: eleven of the thirty five permissions were in
// it, an editor was shown as able to delete an account when they cannot, a viewer was
// shown as writing nothing when they keep saved filters, and the one read permission that
// excludes a role said yes for everybody. A table nobody can check is a table that says
// whatever it said last.
//
// So this prints it, in both languages, from packages/storage/src/actor.ts, and
// checkTranslations refuses a document whose table no longer matches.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

export const ROLES = ["owner", "admin", "editor", "viewer", "logger"];

/** The name each language gives a role, taken from the interface so the two agree. */
function roleNames(language) {
	const path = join(root, "apps", "web", "src", "locales", `${language}.json`);
	const table = JSON.parse(readFileSync(path, "utf8"));
	return ROLES.map((role) => table.role[role]);
}

/** Every permission, in the order the matrix holds them, and who has each. */
export function permissions() {
	const source = readFileSync(join(root, "packages", "storage", "src", "actor.ts"), "utf8");
	const start = source.indexOf("export const PERMISSIONS = {");
	const end = source.indexOf("} as const satisfies", start);
	if (start === -1 || end === -1) throw new Error("the matrix is not where it was");

	const found = [];
	// A camelCase name is a name too: member.changeRole was silently left out of the
	// table for want of a capital letter in this pattern.
	for (const match of source.slice(start, end).matchAll(/"([a-zA-Z.]+)":\s*\[([^\]]+)\]/g)) {
		const roles = [...match[2].matchAll(/"([a-z]+)"/g)].map((one) => one[1]);
		found.push({ name: match[1], roles });
	}
	return found;
}

/** The table as Markdown, in one language. */
export function tableFor(language) {
	const names = roleNames(language);
	const what = language === "pt" ? "o que" : "what";
	const lines = [
		`| ${what} | ${names.join(" | ")} |`,
		`| --- | ${names.map(() => "---").join(" | ")} |`,
	];
	const yes = language === "pt" ? "sim" : "yes";
	const no = language === "pt" ? "não" : "no";

	for (const permission of permissions()) {
		const cells = ROLES.map((role) => (permission.roles.includes(role) ? yes : no));
		lines.push(`| \`${permission.name}\` | ${cells.join(" | ")} |`);
	}
	return lines.join("\n");
}

if (process.argv[2] === "print") {
	console.log(tableFor(process.argv[3] === "pt" ? "pt" : "en"));
}
