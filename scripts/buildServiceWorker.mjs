// The part that makes it an application on a phone.
//
// A service worker written by hand, from the files the build actually produced, rather
// than by a plugin that brings a caching library with it. What it has to do is small
// and the rules are worth being able to read:
//
// 1. Everything with a hash in its name never changes, so it is cached forever and
//    served from there first. That is the whole of the interface and the SQLite build.
// 2. The page itself is asked for over the network, and when there is no network the
//    cached copy is served, which is what opening the application on the underground is.
// 3. Nothing else is cached. Requests to a server, to a drive or to the Banco Central
//    go out as they are, or fail, and the screen says so.
//
// A new build has a new cache name, and the old one is deleted the moment the new
// worker takes over, so a stale interface never survives an update.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "apps", "web", "dist");

function everyFile(folder) {
	const found = [];
	for (const entry of readdirSync(folder)) {
		const full = join(folder, entry);
		if (statSync(full).isDirectory()) found.push(...everyFile(full));
		else found.push(full);
	}
	return found;
}

const files = everyFile(dist)
	.map((file) => `/${relative(dist, file).split("\\").join("/")}`)
	// The worker itself is never cached by itself, and a map is for a developer.
	.filter((path) => path !== "/sw.js" && !path.endsWith(".map"));

const digest = createHash("sha256");
// This file too, so that changing the rules below starts a new cache instead of
// keeping one that was filled under the old ones.
digest.update(readFileSync(fileURLToPath(import.meta.url)));
for (const path of files) {
	digest.update(path);
	digest.update(readFileSync(join(dist, path.slice(1))));
}
const version = digest.digest("hex").slice(0, 12);

// What is worth having before it is asked for: the page, the manifest, the icons and
// everything the build named with a hash.
const precache = files.filter(
	(path) =>
		path === "/index.html" ||
		path === "/manifest.webmanifest" ||
		path.startsWith("/icons/") ||
		path.startsWith("/assets/"),
);

const worker = `// Written by scripts/buildServiceWorker.mjs. Do not edit by hand.
const CACHE = "cofre-${version}";
const PRECACHE = ${JSON.stringify(precache, null, 1)};

self.addEventListener("install", (event) => {
	// The new worker takes over as soon as it is ready. There is one tab and one
	// person, and waiting for every tab to close means waiting forever.
	self.skipWaiting();
	event.waitUntil(
		caches.open(CACHE).then((cache) =>
			// One at a time is slower and survives one file failing, which matters more.
			Promise.allSettled(PRECACHE.map((path) => cache.add(path))),
		),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))),
			)
			.then(() => self.clients.claim()),
	);
});

// Everything is looked up by address and never by the request that arrived.
//
// A page that is being reloaded asks for its files again in a way that says "do not
// give me what you have stored", and a cache asked with that request answers that it
// has nothing, even though it has the file. The address is the same either way, so the
// address is what is used, and the answer is the copy that was kept.
async function kept(path) {
	const cache = await caches.open(CACHE);
	return await cache.match(path, { ignoreSearch: true, ignoreVary: true });
}

async function page(request) {
	try {
		return await fetch(request);
	} catch (reason) {
		const stored = await kept("/index.html");
		if (stored) return stored;
		throw reason;
	}
}

async function file(path, request) {
	const stored = await kept(path);
	if (stored) return stored;
	const fresh = await fetch(request);
	if (fresh.ok) {
		const cache = await caches.open(CACHE);
		await cache.put(path, fresh.clone());
	}
	return fresh;
}

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;

	const url = new URL(request.url);
	// Anything that is not this application is not this application's business.
	if (url.origin !== self.location.origin) return;

	// A page, whichever address it is: the router answers every one of them, so the
	// page comes from the network when there is one and from here when there is not.
	if (request.mode === "navigate") {
		event.respondWith(page(request));
		return;
	}

	// Everything the build named: cached forever, because the name changes when the
	// file does. Anything else, a server or a drive or the Banco Central, goes out as
	// it is, or fails, and the screen says so.
	const mine =
		url.pathname.startsWith("/assets/") ||
		url.pathname.startsWith("/icons/") ||
		url.pathname === "/manifest.webmanifest";
	if (!mine) return;

	event.respondWith(file(url.pathname, request));
});
`;

writeFileSync(join(dist, "sw.js"), worker);
console.log(`Service worker written: ${precache.length} files, cache cofre-${version}`);
