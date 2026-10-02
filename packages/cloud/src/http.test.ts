import { describe, expect, it } from "vitest";
import { addressOfAPlace, CloudError, looksReachable } from "./http.ts";

// One function decides three things: whether the field beside somebody's password shows an
// error, whether a backup may be armed at all, and what every request in this package is
// sent to. It had no test of its own, which is how the three came to be able to disagree.

const REACHABLE = [
	// The two shapes a service hands somebody and they paste in whole.
	"libsql://casa.turso.io",
	"casa.turso.io",
	"casa.turso.io:8080",
	// And an address written out, which is what a WebDAV folder looks like.
	"https://nuvem.exemplo.com/remote.php/dav/files/ana/cofre",
	"http://localhost:8080/dav",
	// A trailing slash is somebody copying a browser address bar.
	"https://nuvem.exemplo.com/dav/",
];

const NOT_REACHABLE = [
	"",
	"   ",
	// A line of text, which is what somebody types when they mean a folder on this machine.
	"minha pasta",
	// A path with no host: fetch would resolve it against whatever serves this page, and
	// every call here carries a credential.
	"/cofre",
	"../cofre",
	// A scheme this cannot speak, so the password would go nowhere useful.
	"ftp://casa.turso.io",
	"file:///home/ana/cofre",
];

describe("the address of a destination", () => {
	it("takes the two shapes a service hands somebody", () => {
		for (const url of REACHABLE) {
			expect(looksReachable(url), url).toBe(true);
		}
	});

	it("refuses anything that is not somewhere else", () => {
		for (const url of NOT_REACHABLE) {
			expect(looksReachable(url), url).toBe(false);
		}
	});

	it("answers the same as the call that uses it", () => {
		for (const url of [...REACHABLE, ...NOT_REACHABLE]) {
			let threw = false;
			try {
				addressOfAPlace(url, "teste");
			} catch (error) {
				threw = true;
				expect(error, url).toBeInstanceOf(CloudError);
			}
			expect(threw, url).toBe(!looksReachable(url));
		}
	});

	it("puts https in front of a bare host, and leaves an address alone", () => {
		expect(addressOfAPlace("casa.turso.io", "teste")).toBe("https://casa.turso.io");
		expect(addressOfAPlace("libsql://casa.turso.io", "teste")).toBe("https://casa.turso.io");
		expect(addressOfAPlace("http://localhost:8080/dav", "teste")).toBe("http://localhost:8080/dav");
	});

	it("takes a trailing slash off, so one folder is one address", () => {
		expect(addressOfAPlace("https://nuvem.exemplo.com/dav/", "teste")).toBe(
			"https://nuvem.exemplo.com/dav",
		);
	});
});
