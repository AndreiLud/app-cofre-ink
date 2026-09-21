import { runConformanceSuite } from "../conformance/index.ts";
import { openNodeSqlite } from "./nodeSqlite.ts";

runConformanceSuite({
	name: "sqlite through node",
	open: async () => openNodeSqlite({ location: ":memory:" }),
});
