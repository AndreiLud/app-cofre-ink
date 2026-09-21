#!/usr/bin/env node
// Writing rule checker.
// The project forbids the hyphen, the en dash and the em dash as punctuation,
// as list markers and as word joiners in any text written for people.
// This script scans Markdown prose and interface translation files and fails
// when it finds one of those characters outside an allowed context.
//
// Allowed contexts inside Markdown:
//   1. fenced code blocks, opened with three backticks or three tildes
//   2. inline code spans between backticks
//   3. link and image destinations, reference definitions and bare links
//   4. table delimiter rows and thematic breaks
//   5. the YAML front matter fence at the top of a file
//
// Usage:
//   node scripts/checkWriting.mjs                  scans the repository
//   node scripts/checkWriting.mjs file.md ...      scans the given files
//   node scripts/checkWriting.mjs --commitMsg PATH scans a commit message

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, isAbsolute, sep } from "node:path";

// The class below holds eight characters that look almost the same on screen:
// hyphen minus, hyphen, non breaking hyphen, figure dash, en dash, em dash,
// horizontal bar and minus sign. The map after it turns one into a readable name.
const FORBIDDEN = /[-‐‑‒–—―−]/;
const FORBIDDEN_NAMES = {
	"-": "hyphen",
	"‐": "hyphen",
	"‑": "non breaking hyphen",
	"‒": "figure dash",
	"–": "en dash",
	"—": "em dash",
	"―": "horizontal bar",
	"−": "minus sign",
};

const SKIPPED_DIRECTORIES = new Set([
	"node_modules",
	".git",
	".turbo",
	".vercel",
	"dist",
	"build",
	"coverage",
	"out",
	"target",
	"playwright-report",
	"test-results",
]);

// Translation files live in any folder called locales or messages.
const TRANSLATION_FOLDERS = new Set(["locales", "messages"]);

const root = process.cwd();

function collectFiles(directory, found) {
	for (const entry of readdirSync(directory)) {
		if (SKIPPED_DIRECTORIES.has(entry) || entry.startsWith(".")) {
			if (entry !== ".github") continue;
		}
		const full = join(directory, entry);
		const stats = statSync(full);
		if (stats.isDirectory()) {
			collectFiles(full, found);
			continue;
		}
		const extension = extname(entry).toLowerCase();
		if (extension === ".md") {
			found.push({ path: full, kind: "markdown" });
			continue;
		}
		if (extension === ".json" && isInsideTranslationFolder(full)) {
			found.push({ path: full, kind: "translation" });
		}
	}
	return found;
}

function isInsideTranslationFolder(fullPath) {
	return relative(root, fullPath)
		.split(sep)
		.some((segment) => TRANSLATION_FOLDERS.has(segment.toLowerCase()));
}

function describe(character) {
	return FORBIDDEN_NAMES[character] ?? "dash";
}

function isTableDelimiter(line) {
	return /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("|") && line.includes("-");
}

function isThematicBreak(line) {
	return /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function stripAllowed(line) {
	return line
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/\]\([^)]*\)/g, "]( )")
		.replace(/^\s*\[[^\]]+\]:\s*\S+/g, " ")
		.replace(/https?:\/\/\S+/g, " ")
		.replace(/<[^>\s]+>/g, " ");
}

function checkMarkdown(text) {
	const problems = [];
	const lines = text.split(/\r?\n/);
	let insideFence = false;
	let fenceCharacter = "";
	let insideFrontMatter = false;

	for (let index = 0; index < lines.length; index += 1) {
		const raw = lines[index];
		const trimmed = raw.trim();

		if (index === 0 && trimmed === "---") {
			insideFrontMatter = true;
			continue;
		}
		if (insideFrontMatter) {
			if (trimmed === "---") insideFrontMatter = false;
			continue;
		}

		const fence = trimmed.match(/^(`{3,}|~{3,})/);
		if (fence) {
			const character = fence[1][0];
			if (!insideFence) {
				insideFence = true;
				fenceCharacter = character;
				continue;
			}
			if (character === fenceCharacter) {
				insideFence = false;
				continue;
			}
		}
		if (insideFence) continue;
		if (isTableDelimiter(trimmed) || isThematicBreak(trimmed)) continue;

		const scanned = stripAllowed(raw);
		const column = scanned.search(FORBIDDEN);
		if (column >= 0) {
			problems.push({
				line: index + 1,
				column: column + 1,
				character: scanned[column],
				excerpt: trimmed,
			});
		}
	}
	return problems;
}

function checkTranslation(text) {
	const problems = [];
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		problems.push({ line: 1, column: 1, character: "", excerpt: `invalid json: ${error.message}` });
		return problems;
	}

	const walk = (value, path) => {
		if (typeof value === "string") {
			const column = value.search(FORBIDDEN);
			if (column >= 0) {
				problems.push({
					line: 1,
					column: column + 1,
					character: value[column],
					excerpt: `${path}: ${value}`,
				});
			}
			return;
		}
		if (Array.isArray(value)) {
			value.forEach((item, index) => walk(item, `${path}[${index}]`));
			return;
		}
		if (value && typeof value === "object") {
			for (const [key, item] of Object.entries(value)) {
				walk(item, path ? `${path}.${key}` : key);
			}
		}
	};

	walk(parsed, "");
	return problems;
}

function checkCommitMessage(path) {
	if (!existsSync(path)) return [];
	const lines = readFileSync(path, "utf8").split(/\r?\n/);
	const problems = [];
	lines.forEach((raw, index) => {
		if (raw.startsWith("#")) return;
		const scanned = stripAllowed(raw);
		const column = scanned.search(FORBIDDEN);
		if (column >= 0) {
			problems.push({
				line: index + 1,
				column: column + 1,
				character: scanned[column],
				excerpt: raw.trim(),
			});
		}
	});
	return problems;
}

function report(label, problems) {
	for (const problem of problems) {
		const where = `${label}:${problem.line}:${problem.column}`;
		const what = problem.character ? `found ${describe(problem.character)}` : "invalid file";
		console.error(`${where}  ${what}`);
		console.error(`    ${problem.excerpt}`);
	}
}

function main() {
	const args = process.argv.slice(2);
	let failures = 0;

	const commitFlag = args.indexOf("--commitMsg");
	if (commitFlag >= 0) {
		const path = args[commitFlag + 1];
		const problems = checkCommitMessage(path);
		report("commit message", problems);
		failures += problems.length;
	} else {
		const explicit = args.filter((value) => !value.startsWith("-"));
		const files = explicit.length
			? explicit.map((given) => {
					const path = isAbsolute(given) ? given : join(root, given);
					return { path, kind: isInsideTranslationFolder(path) ? "translation" : "markdown" };
				})
			: collectFiles(root, []);

		for (const file of files) {
			if (!existsSync(file.path)) continue;
			const text = readFileSync(file.path, "utf8");
			const problems = file.kind === "translation" ? checkTranslation(text) : checkMarkdown(text);
			report(relative(root, file.path).split(sep).join("/"), problems);
			failures += problems.length;
		}
	}

	if (failures > 0) {
		console.error("");
		console.error(`Writing rule: ${failures} problem(s) found.`);
		console.error("Use a comma, a colon, a period, parentheses or rewrite the sentence.");
		console.error("Lists are numbered or become prose. Code belongs inside a fenced block.");
		process.exitCode = 1;
		return;
	}
	console.log("Writing rule: clean.");
}

main();
