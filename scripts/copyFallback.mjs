// One page, many addresses, and a host that only knows about files.
//
// The application answers every address itself, so asking a static host for
// /lancamentos asks it for a file that was never written. This writes 404.html, which
// is the page, so a host that cannot find something sends the application and the
// router reads the address. GitHub Pages and most plain servers work that way.
//
// A file named _redirects used to be written beside it, which is the dialect Netlify
// and Cloudflare Pages read. It was taken out because Cloudflare Workers, which is
// where this is published, parses that file and refuses the one rule in it: the rule
// says every address is the page, and Workers already says the same thing in its own
// configuration, so the two together read as a loop and the deploy is rejected.
// docs/en/deploy.md carries the line for anybody publishing to Netlify.
//
// A server that is configured properly, Nginx or Caddy or the Cofre server itself,
// never asks for any of this.

import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "apps", "web", "dist");

copyFileSync(join(dist, "index.html"), join(dist, "404.html"));

console.log("Fallback page written: 404.html");
