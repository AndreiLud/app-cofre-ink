// The engine of the browser mode, exercised under Node against the same suite.
// Persistence in OPFS is proven separately, in docs/spikeOpfs.md.

import { runConformanceSuite } from "../conformance/index.ts";
import { openSqliteWasmMemory } from "./sqliteWasm.ts";

runConformanceSuite({
	name: "sqlite as webassembly",
	open: () => openSqliteWasmMemory(),
});
