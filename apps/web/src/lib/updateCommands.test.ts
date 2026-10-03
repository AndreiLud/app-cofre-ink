// Part 2, K.4 and K.8.4 of the request for 2.0.0: every way of updating starts with a copy in
// a folder outside the clone, and none of them writes a file with a redirection.

import { describe, expect, it } from "vitest";
import { BACKUPS, type UpdateWay, updateSteps } from "./updateCommands.ts";

const WAYS: UpdateWay[] = [
	{
		database: "sqlite",
		installedWith: "compose",
		version: "2.0.0",
		databasePath: "/data/cofre.db",
	},
	{
		database: "sqlite",
		installedWith: "dockerRun",
		version: "2.0.0",
		databasePath: "/data/cofre.db",
	},
	{ database: "sqlite", installedWith: "built", version: "2.0.0", databasePath: "/data/cofre.db" },
	{
		database: "sqlite",
		installedWith: "source",
		version: "2.0.0",
		databasePath: "./data/cofre.db",
	},
	{ database: "postgres", installedWith: "compose", version: "2.0.0", databasePath: null },
];

describe("how to update", () => {
	it("starts every way with a copy outside the clone, named after the version", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: it is the shell that reads ${HOME}
		expect(BACKUPS).toBe("${HOME}/cofreBackups");
		for (const way of WAYS) {
			const [first] = updateSteps(way);
			expect(first?.step).toBe("copy");
			expect(first?.lines.some((line) => line.includes(BACKUPS))).toBe(true);
			expect(first?.lines.some((line) => line.includes("cofre_v2.0.0"))).toBe(true);
		}
	});

	it("never writes a file with a redirection, and never asks for mkdir -p", () => {
		for (const way of WAYS) {
			for (const line of updateSteps(way).flatMap((step) => step.lines)) {
				expect(line).not.toMatch(/\s>\s|\s>>\s/);
				expect(line).not.toContain("mkdir -p");
			}
		}
	});

	it("reads the secret before the container of docker run is removed", () => {
		const lines = updateSteps(WAYS[1] as UpdateWay).flatMap((step) => step.lines);
		expect(lines.indexOf("docker inspect cofre")).toBeLessThan(lines.indexOf("docker rm cofre"));
		expect(lines.at(-1)).toContain("--env-file cofre.env");
	});

	it("follows the line of the major version the copy runs", () => {
		const two = updateSteps(WAYS[1] as UpdateWay).flatMap((step) => step.lines);
		expect(two).toContain("docker pull ghcr.io/andreilud/app-cofre-ink:2");
		const three = updateSteps({ ...(WAYS[1] as UpdateWay), version: "3.1.0" }).flatMap(
			(step) => step.lines,
		);
		expect(three).toContain("docker pull ghcr.io/andreilud/app-cofre-ink:3");
	});
});
