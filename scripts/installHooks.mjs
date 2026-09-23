// Installs the git hooks after an install, when there is a repository to install them
// into. Inside the container image, in a downloaded archive or on a machine where git
// is not on the PATH there is nothing to do, and failing there would only teach people
// to ignore the output of pnpm install.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".git")) process.exit(0);

const run = spawnSync("simple-git-hooks", [], { stdio: "inherit", shell: true });

if (run.status !== 0) {
	console.log(
		"Cofre: the git hooks are not installed, so the writing rule will not run before" +
			" your commits. With git on the PATH, run: pnpm exec simple-git-hooks",
	);
}

process.exit(0);
