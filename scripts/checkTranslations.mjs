#!/usr/bin/env node
// The two languages say the same things.
//
// A key that exists in Portuguese and not in English does not fail anything: the
// interface quietly shows the key itself, which looks like "dashboard.attention" in the
// middle of a screen and is usually found by a stranger rather than by us. A name
// inside a sentence that exists in one language and not the other is worse, because the
// sentence comes out with a gap in it.
//
// So this walks both files and refuses four things:
//
//   1. a key one language has and the other does not
//   2. an empty string, which is a key somebody meant to come back to
//   3. a {{name}} in one language that is not in the other
//   4. a rule the model can refuse with, that neither language has a sentence for
//
// The fourth one is the same class of fault seen from the other end. A refusal carries
// the name of the rule and the interface looks that name up under "rules"; a name with
// nothing behind it falls back to "I could not finish that. Try again." So the model
// grows a rule, nobody writes the sentence, and the refusal that was written to explain
// something explains nothing. There were eighteen of those.
//
// Plural forms count as one key: i18next chooses between "_one" and "_other" by the
// count, and a language is allowed to need fewer of them than another.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const locales = join(root, "apps", "web", "src", "locales");
const LANGUAGES = ["pt", "en"];

/** Every TypeScript file that is not a test, under the folders that hold the rules. */
function sourcesIn(dir) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourcesIn(path);
		return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
	});
}

/** The name of every rule the model can refuse with, and where it is thrown. */
function rulesThrown() {
	const found = new Map();
	for (const file of [...sourcesIn(join(root, "packages")), ...sourcesIn(join(root, "apps"))]) {
		const text = readFileSync(file, "utf8");
		for (const match of text.matchAll(/new (?:RuleError|SplitError)\(\s*"([A-Za-z]+)"/g)) {
			if (!found.has(match[1])) found.set(match[1], file.replace(root, "").replace(/^[\\/]/, ""));
		}
	}
	return found;
}

/** Every key, flattened, with the plural suffix removed. */
function keysOf(value, path, found) {
	if (typeof value === "string") {
		found.set(path.replace(/_(one|other|zero|two|few|many)$/, ""), value);
		return found;
	}
	if (value && typeof value === "object") {
		for (const [name, inner] of Object.entries(value)) {
			keysOf(inner, path === "" ? name : `${path}.${name}`, found);
		}
	}
	return found;
}

function namesIn(text) {
	return new Set([...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)/g)].map((match) => match[1]));
}

function main() {
	const problems = [];
	const tables = new Map();

	for (const language of LANGUAGES) {
		const file = join(locales, `${language}.json`);
		if (!existsSync(file)) {
			problems.push(`${language}.json is missing`);
			continue;
		}
		tables.set(language, keysOf(JSON.parse(readFileSync(file, "utf8")), "", new Map()));
	}

	if (problems.length === 0) {
		const [first, second] = LANGUAGES;
		const one = tables.get(first);
		const other = tables.get(second);

		for (const key of one.keys()) {
			if (!other.has(key)) problems.push(`${second}.json has no "${key}"`);
		}
		for (const key of other.keys()) {
			if (!one.has(key)) problems.push(`${first}.json has no "${key}"`);
		}

		for (const [language, table] of tables) {
			for (const [key, text] of table) {
				if (text.trim() === "") problems.push(`${language}.json: "${key}" is empty`);
			}
		}

		for (const [key, text] of one) {
			if (!other.has(key)) continue;
			const mine = namesIn(text);
			const theirs = namesIn(other.get(key));
			for (const name of mine) {
				// A plural form may leave the count out of one of its two sentences, so
				// the count is the one name that is allowed to differ.
				if (name !== "count" && !theirs.has(name)) {
					problems.push(`${second}.json: "${key}" does not use {{${name}}}`);
				}
			}
			for (const name of theirs) {
				if (name !== "count" && !mine.has(name)) {
					problems.push(`${first}.json: "${key}" does not use {{${name}}}`);
				}
			}
		}
	}

	const rules = rulesThrown();
	for (const [name, file] of rules) {
		for (const language of LANGUAGES) {
			const table = tables.get(language);
			if (table && !table.has(`rules.${name}`)) {
				problems.push(`${language}.json has no sentence for the rule "${name}" (${file})`);
			}
		}
	}

	if (problems.length > 0) {
		for (const problem of problems) console.error(problem);
		console.error("");
		console.error(`Translations: ${problems.length} problem(s) found.`);
		process.exitCode = 1;
		return;
	}

	const total = tables.get(LANGUAGES[0])?.size ?? 0;
	console.log(`Translations: ${total} keys, both languages, ${rules.size} rules, clean.`);
}

main();
