// The commands that update a server, for each way it can be installed.
//
// In code and never in the translations: they are commands, which carry the hyphens of their
// options that the writing check rightly refuses in a sentence, and they are the same in both
// languages. Every way starts with a copy of the server written to a folder outside the clone,
// because the copy the interface writes does not carry the accounts people sign in with, which
// live only on the server. `${HOME}` is the same folder in bash and in PowerShell.
//
// Two traps are kept out on purpose. No `>`: in Windows PowerShell a redirection rewrites the
// file in another encoding and the restore fails. And no `mkdir -p`, which PowerShell refuses
// when the folder exists: a folder Docker mounts is made by Docker when it is missing, in both
// shells, so the copy makes its own folder.

/** How a copy was installed, which the server reads from its environment. */
export type InstalledWith = "compose" | "dockerRun" | "built" | "source";

export type UpdateWay = {
	/** Which database the server writes to, because PostgreSQL is copied another way. */
	database: "sqlite" | "postgres";
	installedWith: InstalledWith;
	/** The version running now, which names the copy. */
	version: string;
	/** Where the SQLite file is, for a server that runs without a container. */
	databasePath: string | null;
};

/** One step: the copy first, then the version that replaces this one. */
export type UpdateStep = { step: "copy" | "update"; lines: string[] };

/** The folder every copy goes to, outside the clone. Written for the shell, not interpolated here. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: it is the shell that reads ${HOME}
export const BACKUPS = "${HOME}/cofreBackups";

const IMAGE = "ghcr.io/andreilud/app-cofre-ink:2";

/** The steps, in the order they are run. */
export function updateSteps(way: UpdateWay): UpdateStep[] {
	const copy = `cofre_v${way.version.replace(/^v/, "")}`;

	if (way.database === "postgres") {
		return [
			{
				step: "copy",
				lines: [
					"docker compose stop cofre",
					// Makes the folder when it is missing, in either shell, which the copy below
					// does not do by itself.
					`docker run --rm -v ${BACKUPS}:/out alpine true`,
					`docker compose exec -T database pg_dump -U cofre -f /tmp/${copy}.sql cofre`,
					`docker compose cp database:/tmp/${copy}.sql ${BACKUPS}/`,
				],
			},
			{ step: "update", lines: ["docker compose pull", "docker compose up -d"] },
		];
	}

	if (way.installedWith === "compose") {
		return [
			{
				step: "copy",
				lines: [
					"docker compose stop",
					`docker run --rm -v cofre_cofreData:/data -v ${BACKUPS}:/out alpine tar czf /out/${copy}.tar.gz /data`,
				],
			},
			{ step: "update", lines: ["docker compose pull", "docker compose up -d"] },
		];
	}

	if (way.installedWith === "dockerRun") {
		return [
			{
				step: "copy",
				lines: [
					"docker stop cofre",
					`docker run --rm -v cofre:/data -v ${BACKUPS}:/out alpine tar czf /out/${copy}.tar.gz /data`,
				],
			},
			{
				step: "update",
				lines: [
					`docker pull ${IMAGE}`,
					// Read before the container is removed: a secret generated in the command of the
					// guide lives only in it, and without it everybody is signed out.
					"docker inspect cofre",
					"docker rm cofre",
					`docker run -d --name cofre -p 4321:4321 -v cofre:/data --env-file cofre.env ${IMAGE}`,
				],
			},
		];
	}

	if (way.installedWith === "built") {
		return [
			{
				step: "copy",
				lines: [
					"docker compose stop",
					`docker run --rm -v cofre_cofreData:/data -v ${BACKUPS}:/out alpine tar czf /out/${copy}.tar.gz /data`,
				],
			},
			{
				step: "update",
				lines: ["git pull", "docker compose -f compose.yaml -f compose.build.yaml up -d --build"],
			},
		];
	}

	// Without a container: the file itself, copied while the server is stopped. Node makes the
	// folder, which is there wherever this runs from the source, the same way in both shells.
	const file = way.databasePath ?? "./data/cofre.db";
	return [
		{
			step: "copy",
			lines: [
				`node -e "require('fs').mkdirSync(require('os').homedir() + '/cofreBackups', { recursive: true })"`,
				`cp ${file} ${BACKUPS}/${copy}.db`,
			],
		},
		{ step: "update", lines: ["git pull", "pnpm install", "pnpm build"] },
	];
}
