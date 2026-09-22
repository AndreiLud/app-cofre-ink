// One page, many addresses, and a host that only knows about files.
//
// The application answers every address itself, so asking a static host for
// /lancamentos asks it for a file that was never written. Hosts solve this in two ways
// and the build satisfies both without anybody configuring anything:
//
// 1. A file named 404.html, which is what GitHub Pages and most plain servers send when
//    they cannot find something. It is the page, so the application opens and the
//    router reads the address.
// 2. A file named _redirects, which is what Netlify and Cloudflare Pages read, saying
//    the same thing in their own words. It sits in public and is copied by the build.
//
// A server that is configured properly, Nginx or Caddy or the Cofre server itself,
// never asks either of them, and they cost a few kilobytes.

import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "apps", "web", "dist");

copyFileSync(join(dist, "index.html"), join(dist, "404.html"));

console.log("Fallback page written: 404.html");
