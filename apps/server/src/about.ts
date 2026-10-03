// What this copy of the server is: its version, how it was installed, and where its data is.
//
// The screen of updates shows the commands that fit the way a copy was installed, and warns
// when the data lives somewhere a new container will not find it. All of that is read here,
// once, from the root package.json, the environment and the mounts the process sees.

import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import type { Config } from "./config.ts";

/** The version of the root package.json, which is the version of every part of a release. */
export function readAppVersion(): string {
	// apps/server/src to the root, which in the image is /app, where the Dockerfile copies it.
	const file = new URL("../../../package.json", import.meta.url);
	const parsed = JSON.parse(readFileSync(file, "utf8")) as { version?: unknown };
	return typeof parsed.version === "string" ? parsed.version : "0.0.0";
}

/** How this copy was installed, which decides the commands that update it. */
export type InstalledWith = "compose" | "dockerRun" | "built" | "source";

/**
 * From what the image and the compose file say about themselves. The published image is built
 * with COFRE_IMAGE_SOURCE=ghcr, one built here with local, and the compose file adds
 * COFRE_INSTALLED_WITH=compose; with no image at all this is running from the source.
 */
export function installedWithOf(config: Config): InstalledWith {
	if (config.COFRE_IMAGE_SOURCE === undefined) return "source";
	if (config.COFRE_IMAGE_SOURCE === "local") return "built";
	return config.COFRE_INSTALLED_WITH === "compose" ? "compose" : "dockerRun";
}

/** The image this copy runs, as a person would name it, or nothing outside a container. */
export function imageOf(config: Config): string | null {
	if (config.COFRE_IMAGE_SOURCE === "ghcr") return "ghcr.io/andreilud/app-cofre-ink";
	if (config.COFRE_IMAGE_SOURCE === "local") return "local";
	return null;
}

/** One line of /proc/self/mountinfo: where something is mounted, and what of it. */
type Mount = { root: string; point: string };

function mountsOf(text: string): Mount[] {
	return text
		.split("\n")
		.map((line) => line.split(" "))
		.filter((fields) => fields.length > 5)
		.map((fields) => ({ root: unescaped(fields[3] ?? ""), point: unescaped(fields[4] ?? "") }));
}

/** The kernel writes a space in a path as \040 and so on. */
function unescaped(path: string): string {
	return path.replace(/\\([0-7]{3})/g, (_all, code: string) =>
		String.fromCharCode(Number.parseInt(code, 8)),
	);
}

/**
 * Whether the database file is on something that outlives the container.
 *
 * A named volume or a folder of the machine mounted in, yes. The container's own disk, no: it
 * goes with the container. And an anonymous volume, which `VOLUME /data` gives a `docker run`
 * started without `-v`, no as well, because the next container gets a new one, empty. A volume
 * Docker named by itself is sixty four hexadecimal characters. Nothing for PostgreSQL, whose data
 * is not here, and nothing outside a container or when the mounts cannot be read.
 */
export function dataOnAVolume(databasePath: string, mountinfo: string | null): boolean | null {
	if (databasePath.startsWith("postgres") || mountinfo === null) return null;
	// A relative path is relative to where the process runs, which in the image is /app.
	const absolute = posix.resolve(databasePath);
	const holding = mountsOf(mountinfo)
		.filter(
			(mount) =>
				absolute === mount.point || absolute.startsWith(`${mount.point.replace(/\/$/, "")}/`),
		)
		.sort((one, other) => other.point.length - one.point.length)[0];
	if (!holding || holding.point === "/") return false;
	if (/\/volumes\/[0-9a-f]{64}\/_data$/.test(holding.root)) return false;
	return true;
}

/**
 * The mounts this process sees, inside a container, or nothing. Only inside one: on a machine
 * running from the source every path is on the machine's own disk, which is where it belongs.
 */
export function readMountinfo(config: Config): string | null {
	if (installedWithOf(config) === "source") return null;
	try {
		if (!existsSync("/proc/self/mountinfo")) return null;
		return readFileSync("/proc/self/mountinfo", "utf8");
	} catch {
		return null;
	}
}
