// The session of browser mode, with the one thing a database cannot do.
//
// Everything a screen asks for is answered by the repository layer running here, in
// this tab, against the database in this browser. The exception is the three public
// indices: they come from the Banco Central, and asking for them is a request, not a
// query. In server mode the server makes that request for everybody; here, the browser
// makes it for itself, when somebody presses the button.

import { fetchSeries } from "@cofre/cloud";
import type { IndexSeries, Session } from "@cofre/storage";
import type { CofreSession } from "./cofreSession.ts";

export function asCofreSession(session: Session): CofreSession {
	return {
		...session,
		indices: {
			list: (series, range) => session.indices.list(series, range),
			latest: () => session.indices.latest(),
			refresh: async (input: { series: IndexSeries[]; from: string }) => {
				const written: Record<string, number> = {};
				for (const series of input.series) {
					// One at a time, on purpose: three requests at once to a public service
					// is how a public service starts refusing them.
					const points = await fetchSeries(series, { from: input.from });
					written[series] = await session.indices.save(series, points);
				}
				return written;
			},
		},
	};
}
