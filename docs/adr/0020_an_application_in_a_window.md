# ADR 0020: An application in a window, on a telephone and on a computer

**Status:** Partly superseded by
[0021](0021_a_web_application_that_tidies_itself.md)
**Date:** 22 September 2026
**Deciders:** Andrei Ludescher (owner)

> **What is still true and what is not.** The telephone application is this build
> installed from the browser, and that is what shipped and what remains. The desktop
> shell described below, a window of its own built with Tauri, was dropped: the next
> record says why, and nothing in the repository builds one any more. The parts of this
> record about the manifest, the icons, the service worker and the way every address is
> written against the base of the build are the ones still in force.

## Context

The product promised four ways to run: a browser, a server of the owner's, a cloud, and
an application of its own. Three of them exist. This registry is about the fourth, and
about the plainest requirement of the whole product: somebody standing on a platform
with no signal opens Cofre and writes down what they just spent.

The owner asked for a telephone application as well as a desktop one.

## Decision

### The telephone application is this build, installed

Not React Native, not a second interface, not a wrapper around a website. The same files,
installed from the browser, with the same database in the same storage. A manifest, a set
of icons, a service worker, and a line on the settings screen that offers the
installation when the browser says it can and explains the share menu when it cannot,
which is every iPhone.

This is the decision that everything else follows from. A second codebase for a
telephone would be a second place for every bug and a second thing to keep in step with
the repository layer, for a product whose entire logic already runs in a page.

### The worker is written by the build, from the build

`scripts/buildServiceWorker.mjs` lists what the build produced, hashes it into a cache
name, and writes a worker that knows those exact file names. No caching library. The
rules are short enough to read in one sitting:

1. Files the build named with a hash never change, so they are kept forever and served
   from storage first.
2. A page is asked for over the network and comes from storage when there is no network.
   That is what opening the application on the underground is.
3. Nothing else is touched. A server, a drive or the Banco Central is asked directly, or
   fails, and the screen says which.

Everything is looked up **by address and never by the request that arrived**. A page
being reloaded asks for its files again in a way that tells a cache to ignore what it
has, so a cache asked with that request answers that it has nothing while holding the
file. This cost an afternoon and is the reason the rule is written down here.

The script hashes itself into the cache name, so changing a rule starts a new cache
rather than keeping one that was filled under the old rules.

### The mark is drawn, not stored

`scripts/makeIcons.mjs` is a PNG encoder and some arithmetic. It writes what a browser
wants, and the icon file formats that Windows and macOS insist on, from the same few
dozen lines. A repository anybody can clone should not carry binaries nobody can read a
diff of, and changing the mark should be changing a number.

### The desktop and the telephone shell is Tauri 2 around the same build

`apps/desktop` holds a Rust crate with no commands, no plugins and no bridge. It opens a
window at the build. The database is the same SQLite file in the same browser storage,
kept this time in the folder that belongs to this application rather than in a browser
profile. The same crate builds the Android and iOS applications, which is the reason for
choosing it over Electron.

**Nothing in it was built on the machine where it was written.** Rust, the MSVC build
tools and the Android SDK are all absent there. What is verified is the configuration,
which the Tauri command line reads and validates, and the icons, which Windows itself
decodes. What is not verified is the compilation. The guide of the day said exactly what
had to be installed and what to expect, and said this too. That part of the guide went
with the shell.

### Every address is written against the base of the build

The page, the manifest, the worker and the router all read `BASE_URL` rather than
assuming a slash. The build therefore works at the root of a domain and inside a folder
of one, which is what a project page on GitHub Pages is. The worker learns the base by
reading the page the build just wrote, so there is no setting to pass twice and get
wrong.

The build also writes `404.html` and carries `_redirects`, which are the two dialects
static hosts speak for "every address is the page".

### The shell cannot sign in to a drive, and the screen says so

Dropbox and Drive only return a person to an address that starts with http, and the
shell serves the page from an address of its own. So those two destinations are disabled
inside the shell, with a line saying to connect them once in a browser, or to use a
file, a WebDAV or a server, which all work there unchanged. Two ways out exist for later:
a deep link registered with the operating system, or a small server on the loopback
address during the sign in. Neither is worth building before somebody wants it.

## Consequences

1. Offline is a tested property, not a claim. `e2e/installable.spec.ts` cuts the
   connection and reloads.
2. An update reaches an installed application the next time it opens with a connection,
   because the new worker takes over immediately and deletes the old cache.
3. The desktop and mobile applications cannot be built in continuous integration until a
   Rust toolchain is added to it, and the pipeline does not pretend otherwise.
4. Browser storage is where the data is, in all four modes. Clearing site data in the
   shell would clear the database, which the guide says in as many words.
5. The demo is a copy of `dist` on any static host, with no server and no build step of
   its own.
