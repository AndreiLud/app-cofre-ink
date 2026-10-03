// Real documents, when there are any. Part 2, E.20 of the request for 2.0.0.
//
// The folder `samples/` at the root of the repository holds invoices and statements somebody
// brought in, each PDF with a JSON beside it saying what it holds; git ignores all of it but its
// README. This reads every one and compares the reading with what its JSON says. With only the
// README there, it is skipped, and says so: the layouts the other tests read are invented.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readFile } from "./pipeline.ts";

/** Found from where this file is, so the test runs from any folder. */
const FOLDER = fileURLToPath(new URL("../../../samples/", import.meta.url));

type Expected = {
	kind: "invoice" | "statement";
	institution: string;
	digits: string[];
	dueOn?: string;
	total: number | null;
	entries: { day: string; description: string; amount: number }[];
	sum: number;
};

/** Every PDF with its JSON beside it, one folder for each institution. */
function samples(): { name: string; pdf: string; expected: Expected }[] {
	if (!existsSync(FOLDER)) return [];
	return readdirSync(FOLDER)
		.map((entry) => join(FOLDER, entry))
		.filter((path) => statSync(path).isDirectory())
		.flatMap((folder) =>
			readdirSync(folder)
				.filter((file) => file.toLowerCase().endsWith(".pdf"))
				.map((file) => join(folder, file))
				.filter((pdf) => existsSync(pdf.replace(/\.pdf$/i, ".json")))
				.map((pdf) => ({
					name: pdf.slice(FOLDER.length),
					pdf,
					expected: JSON.parse(readFileSync(pdf.replace(/\.pdf$/i, ".json"), "utf8")) as Expected,
				})),
		);
}

const found = samples();

describe("the real documents in samples/", () => {
	if (found.length === 0) {
		it.skip("has none yet: only its README is there, and the layouts read elsewhere are invented", () => {});
		return;
	}

	for (const sample of found) {
		it(`reads ${sample.name} as its JSON says`, () => {
			const read = readFile(new Uint8Array(readFileSync(sample.pdf)), {
				fileName: sample.name,
				today: sample.expected.dueOn ?? "2026-01-01",
			});
			const { expected } = sample;
			expect(read.kind).toBe(expected.kind);
			expect(read.document?.institution?.toLowerCase() ?? "").toBe(expected.institution);
			expect(read.document?.cards ?? []).toEqual(expected.digits);
			expect(read.document?.total ?? null).toBe(expected.total);
			expect(
				read.records.map((record) => ({
					day: record.happenedOn,
					description: record.description,
					amount: record.amount,
				})),
			).toEqual(expected.entries);
			expect(read.records.reduce((sum, record) => sum + record.amount, 0)).toBe(expected.sum);
		});
	}
});
