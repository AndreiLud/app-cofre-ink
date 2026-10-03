// The engine of the browser mode, exercised under Node against the same suite.
// Persistence in OPFS is proven separately, in docs/spikeOpfs.md.
//
// Through one queue, as the browser runs every query, so a read made outside a transaction
// while it is open hangs here as it hangs in a browser (oneQueue.ts).

import { runConformanceSuite } from "../conformance/index.ts";
import { inOneQueue } from "./oneQueue.ts";
import { openSqliteWasmMemory } from "./sqliteWasm.ts";

runConformanceSuite({
	name: "sqlite as webassembly",
	open: async () => inOneQueue(await openSqliteWasmMemory()),
});
