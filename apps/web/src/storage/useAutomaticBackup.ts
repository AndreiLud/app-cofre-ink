// When the copy is brought up to date, and by what.
//
// Mounted once around the whole application, because a copy that only keeps up while
// somebody is looking at the data screen is not a copy that keeps up.
//
// Three things can start a run and the person chooses two of them. A change is not a
// choice: with the backup on, a change is the whole reason it is on, and it waits for
// the typing to stop first because somebody writing one record touches the database
// several times in a second. The other two cost a round trip when nothing changed, so
// they are asked for: when the application opens, and on a clock.

import { CloudError } from "@cofre/cloud";
import { runBackup } from "@cofre/storage";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { sayWhy } from "../lib/sayWhy.ts";
import { afterTheTyping } from "./backupRunner.ts";
import { setBackupState } from "./backupState.ts";
import { useCofre } from "./CofreProvider.tsx";
import {
	markMet,
	readyToBackUp,
	storedDestination,
	storedWhen,
	whenSettingsChange,
} from "./destinations.ts";

/** Long enough for a form to be filled in, short enough to feel like it is looking. */
const AFTER_THE_TYPING = 4000;

export function useAutomaticBackup(): void {
	const { driver, session, spaces } = useCofre();
	const { t, i18n } = useTranslation();
	const queries = useQueryClient();

	// The run reads these when it fires, not when this was set up, so a change of place
	// or of spaces takes effect without anything being torn down and built again.
	const latest = useRef({ spaces, session, t, language: i18n.resolvedLanguage });
	latest.current = { spaces, session, t, language: i18n.resolvedLanguage };

	useEffect(() => {
		if (!driver) return;

		let running = false;

		async function run(): Promise<void> {
			const settings = storedDestination();
			const when = storedWhen();
			// Picked is not the same as reachable. Without this the run armed itself the
			// moment a name was chosen from the list and failed on every pass until the
			// address and the secret were typed in.
			if (!when.on || !readyToBackUp(settings)) return;
			if (running || !driver) return;

			running = true;
			try {
				// Everything that can fail is inside here. Building the store was outside
				// it, and since a destination started refusing an address that is not an
				// address, that throw took the whole run down as a rejection nobody was
				// holding: no message, no time recorded, and a panel still saying Active.
				// Loading the chunk can fail the same way, on a stale deploy or offline.
				const { storeFrom } = await import("./storeFrom.ts");
				// The name a sentence about this place calls it, in the language on screen.
				// It used to be handed the bare kind, so anything the store said came out as
				// "webdav" or "database" in the middle of a translated sentence.
				const store = storeFrom(
					settings,
					latest.current.t(`destination.${settings.kind ?? "webdav"}Short`),
				);
				if (store === null) return;

				const allowed = await latest.current.session?.backup.copyable();
				const covered = latest.current.spaces
					.filter((space) => (allowed ?? []).includes(space.id))
					.map((space) => space.id);
				if (covered.length === 0) return;

				// Only once there is something to do. It used to be set before the two
				// returns above, which left the screen saying a backup was under way.
				setBackupState({ busy: true, problem: null });
				const done = await runBackup(driver, store, covered);
				for (const outcome of done.outcomes) {
					if (outcome.did !== "asked") markMet(outcome.spaceId, settings.kind ?? "");
				}
				// What came back holds the rows as they were before any repair made here.
				await latest.current.session?.repairs.afterArrival(
					done.outcomes.filter((one) => one.received > 0).map((one) => one.spaceId),
				);

				setBackupState({
					busy: false,
					at: done.at,
					waiting: done.waiting,
					problem: null,
					said: latest.current.t("auto.savedAt", {
						time: new Date(done.at).toLocaleTimeString(latest.current.language ?? "pt-BR", {
							hour: "2-digit",
							minute: "2-digit",
						}),
					}),
				});
				void queries.invalidateQueries();
			} catch (error) {
				setBackupState({
					busy: false,
					said: null,
					// A destination that says what went wrong says it better than a sentence
					// about the backup not finishing: an address that is not an address, a
					// token that expired, a service that answered with a number. Anything
					// else falls back to the bare name of the place, not the one the picker
					// shows, because that one carries its own article and reads as "in A
					// WebDAV folder".
					problem:
						error instanceof CloudError
							? sayWhy(error, latest.current.t)
							: latest.current.t("auto.failed", {
									where: latest.current.t(`destination.${settings.kind ?? "webdav"}Short`),
								}),
				});
				// The reason is in the console for whoever is looking, and on the screen in
				// one sentence for whoever is not.
				console.warn("the automatic backup did not finish", error);
			} finally {
				running = false;
			}
		}

		const waited = afterTheTyping(AFTER_THE_TYPING, () => void run());

		// Every change, once the typing stops. A mutation that succeeded is the only
		// signal this needs, and there is one place that sees all of them.
		//
		// Apart from the ones that are the copy itself. Backing up by hand, testing the
		// connection, writing a spreadsheet and handing over a CSV are all mutations that
		// succeed and none of them changed a record, so each of them used to set a second
		// run going four seconds later, against a place that had nothing new to hear.
		const stopWatching = queries.getMutationCache().subscribe((event) => {
			if (event.mutation?.state.status !== "success") return;
			const about = event.mutation.options.mutationKey?.[0];
			if (about === "theCopyItself") return;
			waited.poke();
		});

		// The clock, rebuilt whenever somebody changes what it was built from. Waiting an
		// hour to find out that fifteen minutes took effect is a small lie.
		let clock: ReturnType<typeof setInterval> | null = null;
		function setTheClock(): void {
			if (clock !== null) clearInterval(clock);
			clock = null;

			const when = storedWhen();
			if (!when.on || when.everyMinutes === null) return;
			clock = setInterval(() => void run(), when.everyMinutes * 60 * 1000);
		}

		const stopListening = whenSettingsChange(setTheClock);
		setTheClock();

		const opening = storedWhen();
		if (opening.on && opening.onLoad) void run();

		return () => {
			stopWatching();
			stopListening();
			waited.stop();
			if (clock !== null) clearInterval(clock);
		};
		// The settings are read inside the run, so this is set up once per database.
	}, [driver, queries]);
}
