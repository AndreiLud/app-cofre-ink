// Who writes the records a series owes.
//
// The calendar did, when it was opened, and nothing else: a rent set up on the calendar and
// never looked at again was not on the overview's list of what falls due, and seventy days
// later the series had written nothing past the two months it wrote the day it was set up.
// The consolidated view reads every space, so a space nobody opened was missing from it too.
//
// So it is mounted around the whole application, beside the copy that keeps itself, and it
// writes for every space this person may write a series in: when the application opens, when
// another space is chosen, and when the day turns while it is open. The server writes nothing
// by itself; what it holds is written when somebody opens the application against it.

import { todayIn } from "@cofre/core";
import { METHOD_PERMISSIONS, roleCan } from "@cofre/storage";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { afterRecordsChange } from "../lib/afterRecords.ts";
import { useCofre } from "./CofreProvider.tsx";

/** How often the day is looked at while the application stays open. */
const LOOK_AT_THE_DAY = 60_000;

export function useSeriesWriter(): void {
	const { session, spaces, user, currentSpace } = useCofre();
	const queries = useQueryClient();
	const timezone = currentSpace?.timezone ?? "America/Sao_Paulo";
	const [day, setDay] = useState(() => todayIn(timezone));

	// The day turning while the application is open, on a clock and when it comes back into view.
	useEffect(() => {
		const look = () => setDay(todayIn(timezone));
		const timer = window.setInterval(look, LOOK_AT_THE_DAY);
		document.addEventListener("visibilitychange", look);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", look);
		};
	}, [timezone]);

	const opened = currentSpace?.id;
	useEffect(() => {
		if (!session || !user) return;
		void opened;
		void day;
		let stopped = false;

		void (async () => {
			let wrote = false;
			for (const space of spaces) {
				if (stopped) return;
				try {
					// The same read the screens make to decide what to draw, so it is usually
					// already there. A role that may not write a series is not asked to: the
					// refusal would be a line in the console on every opening.
					const members = await queries.fetchQuery({
						queryKey: ["members", space.id],
						queryFn: () => session.members.list(space.id),
					});
					const role = members.find((one) => one.userId === user.id)?.role ?? null;
					if (!roleCan(role, METHOD_PERMISSIONS["recurrences.materialize"])) continue;
					if ((await session.recurrences.materialize({ spaceId: space.id })) > 0) wrote = true;
				} catch (error) {
					// Nothing on screen: a person who did not ask for this has nothing to do about
					// it, and the next opening tries again. But not thrown away either.
					console.warn("the series could not be written", error);
				}
			}
			if (wrote && !stopped) afterRecordsChange(queries);
		})();

		return () => {
			stopped = true;
		};
	}, [session, user, spaces, opened, day, queries]);
}
