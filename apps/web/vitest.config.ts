// A test runner for the parts of the browser application that are not a screen.
//
// This app had none, and that is the real reason the sweep before 1.1.0 shipped seventeen
// corrections with four tests: nine of them were branches in here, and Playwright was the
// only harness that reached any of them. A browser test for a pure function is a minute of
// somebody's life for an assertion that takes a millisecond.
//
// Node and not a browser environment, deliberately. What is tested here is the code that
// reads an error, reads a stored setting or works out what the address of a list says, none
// of which needs a document. The day something here needs one, it is a screen and it belongs
// in the Playwright flows instead.

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
