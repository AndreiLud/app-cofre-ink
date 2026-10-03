// What this copy is, read from the environment and the mounts. Part 2, K.1 and K.4.6 of the
// request for 2.0.0: the commands that fit the way a copy was installed, and the warning when
// its data is somewhere a new container will not find it.

import { describe, expect, it } from "vitest";
import { dataOnAVolume, installedWithOf } from "./about.ts";
import { readConfig } from "./config.ts";

const configured = (extra: Record<string, string>) =>
	readConfig({ COFRE_SECRET: "a".repeat(40), NODE_ENV: "test", ...extra } as NodeJS.ProcessEnv);

/** A few lines of /proc/self/mountinfo, the fields this reads in their places. */
function mounts(...lines: [root: string, point: string][]): string {
	return lines
		.map(
			([root, point], index) =>
				`${index + 20} 1 0:${index} ${root} ${point} rw,relatime - ext4 /dev/sda1 rw`,
		)
		.join("\n");
}

describe("how this copy was installed", () => {
	it("is read from the image and from compose, and empty is absent", () => {
		expect(installedWithOf(configured({}))).toBe("source");
		expect(installedWithOf(configured({ COFRE_IMAGE_SOURCE: "local" }))).toBe("built");
		expect(installedWithOf(configured({ COFRE_IMAGE_SOURCE: "ghcr" }))).toBe("dockerRun");
		expect(
			installedWithOf(configured({ COFRE_IMAGE_SOURCE: "ghcr", COFRE_INSTALLED_WITH: "compose" })),
		).toBe("compose");
		expect(
			installedWithOf(configured({ COFRE_IMAGE_SOURCE: "ghcr", COFRE_INSTALLED_WITH: "" })),
		).toBe("dockerRun");
	});
});

describe("whether the data outlives the container", () => {
	const root = ["/", "/"] as [string, string];

	it("is yes on a named volume and on a folder of the machine", () => {
		expect(
			dataOnAVolume(
				"/data/cofre.db",
				mounts(root, ["/var/lib/docker/volumes/cofre_cofreData/_data", "/data"]),
			),
		).toBe(true);
		expect(dataOnAVolume("/data/cofre.db", mounts(root, ["/home/ana/cofre", "/data"]))).toBe(true);
	});

	it("is no on the container's own disk, and on a volume Docker named by itself", () => {
		expect(dataOnAVolume("/data/cofre.db", mounts(root))).toBe(false);
		expect(
			dataOnAVolume(
				"/data/cofre.db",
				mounts(root, [`/var/lib/docker/volumes/${"a1".repeat(32)}/_data`, "/data"]),
			),
		).toBe(false);
	});

	it("says nothing for PostgreSQL, or when the mounts cannot be read", () => {
		expect(dataOnAVolume("postgres://cofre@database/cofre", mounts(root))).toBeNull();
		expect(dataOnAVolume("/data/cofre.db", null)).toBeNull();
	});
});
