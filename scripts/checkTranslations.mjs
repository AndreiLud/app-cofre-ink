#!/usr/bin/env node
// The two languages say the same things.
//
// A key that exists in Portuguese and not in English does not fail anything: the
// interface quietly shows the key itself, which looks like "dashboard.attention" in the
// middle of a screen and is usually found by a stranger rather than by us. A name
// inside a sentence that exists in one language and not the other is worse, because the
// sentence comes out with a gap in it.
//
// So this walks both files and refuses five things:
//
//   1. a key one language has and the other does not
//   2. an empty string, which is a key somebody meant to come back to
//   3. a {{name}} in one language that is not in the other
//   4. a rule the model can refuse with, that neither language has a sentence for
//   5. a sentence asked for by a screen without the names it needs, which prints the
//      {{name}} to a person exactly as it is written here
//
// The fourth one is the same class of fault seen from the other end. A refusal carries
// the name of the rule and the interface looks that name up under "rules"; a name with
// nothing behind it falls back to "I could not finish that. Try again." So the model
// grows a rule, nobody writes the sentence, and the refusal that was written to explain
// something explains nothing. There were eighteen of those.
//
// The fifth was found twice in one release, once by a reading and once by opening the
// built application and looking at it: a headline that said "Em {{day}}." and a table
// caption that said "em {{month}}". Both languages held the same sentence with the same
// name in it, so the three checks above were all satisfied, and the screen said the name
// out loud. It is the cheapest of the five to check and the only one that catches a
// sentence that is right in the file and wrong on the screen.
//
// Plural forms count as one key: i18next chooses between "_one" and "_other" by the
// count, and a language is allowed to need fewer of them than another.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tableFor } from "./roleTable.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const locales = join(root, "apps", "web", "src", "locales");
const LANGUAGES = ["pt", "en"];

const ROLE_TABLE_START =
	"<!-- roleTable: written by scripts/roleTable.mjs, do not edit by hand -->";
const ROLE_TABLE_END = "<!-- /roleTable -->";

/**
 * Every source file that is not a test.
 *
 * Both extensions: a rule thrown from a React file was invisible here, because ".tsx"
 * does not end with ".ts", and two rules lived only in one.
 */
function sourcesIn(dir) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourcesIn(path);
		const source = path.endsWith(".ts") || path.endsWith(".tsx");
		return source && !/\.test\.tsx?$/.test(path) ? [path] : [];
	});
}

/**
 * The name of every rule the model can refuse with, and where it is thrown.
 *
 * Two patterns, because a name is not always the first argument written out: one of them
 * is chosen by a ternary inside the call. Anything else, a name held in a variable or
 * built from a template, cannot be found by reading and is refused outright, so a rule
 * that this cannot check stops the build rather than passing it quietly.
 */
function rulesThrown() {
	const found = new Map();
	const problems = [];
	const folders = ["packages", "apps", "scripts"];

	for (const file of folders.flatMap((one) => sourcesIn(join(root, one)))) {
		const text = readFileSync(file, "utf8");
		const where = file.replace(root, "").replace(/^[\\/]/, "");

		for (const call of text.matchAll(/new (?:RuleError|SplitError)\(([\s\S]{0,200}?)[,)]/g)) {
			const head = call[1];
			// Every name written out, and not the thing a ternary compares against: the one
			// call that picks between two rules tests a method by name first.
			const names = [...head.matchAll(/(?<!==\s)"([A-Za-z][A-Za-z0-9]*)"/g)].map((one) => one[1]);
			if (names.length === 0) {
				// A name that cannot be read here is a name nobody can check. The one place
				// that rethrows a rule it was handed says so.
				if (!/error\.rule/.test(head)) problems.push(`${where}: a rule name that cannot be read`);
				continue;
			}
			for (const name of names) if (!found.has(name)) found.set(name, where);
		}
	}

	return { found, problems };
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

/**
 * Every screen asking for a sentence and not giving it the names it needs.
 *
 * Only the plainest call is read, `t("some.key")` with nothing after the key, because that
 * is the one that can be decided by reading: anything with a second argument is passing
 * something, and whether it passes the right names is a question for a person. A call that
 * builds its key from a template is skipped for the same reason, and a key this cannot find
 * in the file is skipped rather than reported, because the screens legitimately ask for keys
 * that are chosen at runtime.
 *
 * `{{app}}` is the one name a sentence may ask for and never be given: the interface fills
 * it in for every call, which is what registry 0033 decided so the product name lives in one
 * place. `{{count}}` is the other, because i18next passes it for a plural on its own.
 */
function sentencesMissingTheirNames(table) {
	const problems = [];
	for (const file of sourcesIn(join(root, "apps", "web", "src"))) {
		const where = file.replace(root, "").replace(/^[\\/]/, "");
		const lines = readFileSync(file, "utf8").split("\n");

		lines.forEach((line, index) => {
			for (const call of line.matchAll(/\bt\(\s*"([a-zA-Z][\w.]*)"\s*\)/g)) {
				const key = call[1];
				const sentence = table.get(key);
				if (sentence === undefined) continue;
				const wanted = [...namesIn(sentence)].filter((name) => name !== "app" && name !== "count");
				if (wanted.length === 0) continue;
				problems.push(
					`${where}:${index + 1}: t("${key}") is asked for without {{${wanted.join("}}, {{")}}}`,
				);
			}
		});
	}
	return problems;
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

	// The sentences the screens ask for without the names those sentences need. Read from
	// one language, because the check above has already refused any key whose two languages
	// disagree about which names they hold.
	const first = tables.get(LANGUAGES[0]);
	if (first) problems.push(...sentencesMissingTheirNames(first));

	const { found: rules, problems: unreadable } = rulesThrown();
	problems.push(...unreadable);
	for (const [name, file] of rules) {
		for (const language of LANGUAGES) {
			const table = tables.get(language);
			if (table && !table.has(`rules.${name}`)) {
				problems.push(`${language}.json has no sentence for the rule "${name}" (${file})`);
			}
		}
	}

	// And the table in the guides, which is the same matrix written for a reader. It was
	// written by hand and it drifted: eleven of the thirty five permissions were in it, an
	// editor was shown as able to delete an account, and the one read permission that
	// excludes a role said yes for everybody.
	for (const [language, folder] of [
		["en", "en"],
		["pt", "pt-BR"],
	]) {
		const path = join(root, "docs", folder, "dataModel.md");
		if (!existsSync(path)) continue;
		const text = readFileSync(path, "utf8");
		const start = text.indexOf(ROLE_TABLE_START);
		const end = text.indexOf(ROLE_TABLE_END);
		if (start === -1 || end === -1) {
			problems.push(`docs/${folder}/dataModel.md has no role table markers`);
			continue;
		}
		const written = text.slice(start + ROLE_TABLE_START.length, end).trim();
		if (written !== tableFor(language).trim()) {
			problems.push(
				`docs/${folder}/dataModel.md no longer matches the matrix, run: node scripts/roleTable.mjs print ${language}`,
			);
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
