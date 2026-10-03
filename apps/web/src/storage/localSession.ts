// The session of browser mode, with the one thing a database cannot do.
//
// Everything a screen asks for is answered by the repository layer running here, in
// this tab, against the database in this browser. The exception is the three public
// indices: they come from the Banco Central, and asking for them is a request, not a
// query. In server mode the server makes that request for everybody; here, the browser
// makes it for itself, when somebody presses the button.

import { fetchEveryIndex } from "@cofre/cloud";
import type { Session } from "@cofre/storage";
import type { CofreSession } from "./cofreSession.ts";

export function asCofreSession(session: Session): CofreSession {
	return {
		...session,
		indices: {
			list: (series, range) => session.indices.list(series, range),
			latest: () => session.indices.latest(),
			refresh: async (input: { today: string }) => {
				// One request at a time, inside: six requests at once to a public service is how a
				// public service starts refusing them.
				const fetched = await fetchEveryIndex({
					held: await session.indices.held(),
					today: input.today,
				});
				const written: Record<string, number> = {};
				for (const [series, points] of Object.entries(fetched.monthly)) {
					written[series] = await session.indices.save(series as "cdi" | "selic" | "ipca", points);
				}
				for (const [series, points] of Object.entries(fetched.daily)) {
					written[series] = await session.indices.saveDays(
						series as "cdiDaily" | "selicDaily" | "savings",
						points,
					);
				}
				return written;
			},
		},
	};
}
