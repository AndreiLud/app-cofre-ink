// Where the data leaves.
//
// Everything else in Cofre is reversible or recoverable: a record is archived, a space
// is removed and its rows sit there, a backup brings it all back. This is the one place
// that is none of those things, so it looks different, it is at the bottom, and nothing
// in it happens without the name being typed out.
//
// It is here rather than behind a support address because of the promise the project
// makes. Data that the owner cannot take back is data somebody else is holding.

import { CloudError } from "@cofre/cloud";
import type { Space } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Panel } from "@cofre/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";
import { rememberWhen, storedDestination, storedWhen } from "../storage/destinations.ts";

type Target = { kind: "space"; space: Space } | { kind: "everything" };

export function DangerZone() {
	const { t } = useTranslation();
	const { session, spaces, mode, reload, signOut, eraseDevice } = useCofre();
	const queries = useQueryClient();

	const [target, setTarget] = useState<Target | null>(null);
	const [typed, setTyped] = useState("");
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const [done, setDone] = useState<string | null>(null);
	// Ticked by default, because somebody erasing a space means the space and not a copy
	// of it left behind in a folder. Unticking it keeps the copy, and then the backup has
	// to go off, which is the line under the box.
	const [alsoTheCopy, setAlsoTheCopy] = useState(true);

	const destination = storedDestination();
	const backingUp = storedWhen();
	/**
	 * The automatic backup is on and pointed somewhere.
	 *
	 * It is the reason this dialog has a question in it. An erased space leaves no
	 * deletion marks, so the copy in the place is simply ahead, and the next run brings
	 * the whole space back, reports it as a success, and says nothing.
	 */
	// Browser mode only. In server mode the data is on the server and this backup never
	// runs, so settings left over from browser mode used to offer to delete a file named
	// after a space of the server, at a place that has nothing to do with it.
	const copyKeepsIt = mode === "browser" && backingUp.on && destination.kind !== null;

	// In browser mode the whole database is one file on this machine, so erasing
	// everything means the file. On a server it means the spaces of this account, and
	// the account itself stays, because signing up again is not the same question.
	const onThisDevice = mode === "browser";

	function open(next: Target) {
		setTarget(next);
		setTyped("");
		setProblem(null);
		setDone(null);
		setAlsoTheCopy(true);
	}

	/**
	 * Take the copy of this space at the destination away, or switch the backup off.
	 *
	 * One of the two has to happen. The engine refuses on purpose to write an empty log
	 * over a full one, so an erasure cannot travel to the place by itself, and a place
	 * left holding the space is a place that puts it back within seconds.
	 */
	async function dealWithTheCopy(spaceId: string): Promise<void> {
		if (!copyKeepsIt || destination.kind === null) return;

		if (!alsoTheCopy) {
			rememberWhen({ ...backingUp, on: false });
			return;
		}

		const { storeFrom } = await import("../storage/storeFrom.ts");
		const store = storeFrom(destination, t(`destination.${destination.kind}Short`));
		if (store === null) return;
		await store.remove(spaceId);
	}

	/**
	 * What happens when the place cannot be reached at the moment of erasing.
	 *
	 * The copy goes first, so a destination that is off, or a token that expired, stops
	 * the whole thing with nothing lost. It used to erase here first and reach for the
	 * place afterwards, and a failure there left the space gone from this device, the
	 * backup still on, and the place still holding it, so the next run brought the
	 * emptied space straight back.
	 */
	function couldNotReachIt(error: unknown): string {
		if (error instanceof CloudError) {
			if (error.status === 0) return t("destination.unreachable", { where: error.where });
			if (error.status === 401 || error.status === 403) {
				return t("destination.refused", { where: error.where });
			}
			return t("destination.answered", { where: error.where, status: error.status });
		}
		return error instanceof Error ? error.message : String(error);
	}

	/** What has to be typed out, so that no amount of clicking alone is enough. */
	const word = target?.kind === "space" ? target.space.name : t("danger.confirmWord");
	const ready = typed.trim().toLowerCase() === word.trim().toLowerCase();

	async function erase() {
		if (!target || !ready) return;
		setBusy(true);
		setProblem(null);
		try {
			if (target.kind === "space") {
				if (!session) throw new Error("no session");

				// The place first, and the space only once that worked. The two failures
				// are not the same size: a copy that goes while the erasure fails leaves
				// the data here, and an erasure that goes while the copy stays leaves the
				// place ahead, which puts the whole space back within seconds.
				try {
					await dealWithTheCopy(target.space.id);
				} catch (error) {
					setProblem(couldNotReachIt(error));
					return;
				}

				const result = await session.erasure.eraseSpace(target.space.id);
				queries.clear();
				await reload();
				setTarget(null);
				setDone(
					[
						result.spaceRemoved
							? t("danger.spaceGone", { name: result.name, count: result.rows })
							: t("danger.spaceEmptied", { name: result.name, count: result.rows }),
						copyKeepsIt ? t(alsoTheCopy ? "danger.copyGone" : "danger.backupOff") : null,
					]
						.filter(Boolean)
						.join(" "),
				);
				return;
			}

			// This one does not come back to say what it did: the browser reloads onto
			// onboarding, and the server mode signs out onto the sign in screen.
			if (onThisDevice) {
				await eraseDevice();
				return;
			}
			if (!session) throw new Error("no session");
			await session.erasure.eraseEverything();
			queries.clear();
			await signOut();
		} catch (error) {
			setProblem(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	return (
		// The one panel on the screen that is not the same as the others, because the
		// one thing worse than a destructive action that is hard to find is one that
		// looks like everything around it. The colour is the one already used for money
		// leaving and for something being wrong, so it needs no explaining.
		<Panel
			title={<span className="text-seal">{t("danger.title")}</span>}
			description={t("danger.explain")}
			className="mt-3 border-seal/60"
		>
			{done ? <Callout tone="neutral">{done}</Callout> : null}

			<ul className="divide-y divide-line">
				{spaces.map((space) => (
					<li key={space.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
						<span className="min-w-0">
							<span className="text-sm text-ink">{space.name}</span>
							<span className="block text-xs text-quiet">
								{space.kind === "personal"
									? t("danger.personalKeeps")
									: t("danger.sharedGoes", { name: space.name })}
							</span>
						</span>
						<Button
							size="small"
							variant="destructive"
							onClick={() => open({ kind: "space", space })}
						>
							{t("danger.eraseSpace")}
						</Button>
					</li>
				))}

				<li className="flex flex-wrap items-baseline justify-between gap-3 py-3">
					<span className="min-w-0">
						<span className="text-sm text-ink">{t("danger.everythingTitle")}</span>
						<span className="block text-xs text-quiet">
							{onThisDevice ? t("danger.everythingHereBody") : t("danger.everythingServerBody")}
						</span>
					</span>
					<Button size="small" variant="destructive" onClick={() => open({ kind: "everything" })}>
						{t("danger.eraseEverything")}
					</Button>
				</li>
			</ul>

			<Dialog
				open={target !== null}
				onOpenChange={(next) => {
					if (!next) setTarget(null);
				}}
				title={
					target?.kind === "space"
						? t("danger.confirmSpaceTitle", { name: target.space.name })
						: t("danger.confirmEverythingTitle")
				}
				description={
					target?.kind === "space"
						? target.space.kind === "personal"
							? t("danger.confirmPersonalBody")
							: t("danger.confirmSharedBody")
						: onThisDevice
							? t("danger.confirmEverythingHereBody")
							: t("danger.confirmEverythingServerBody")
				}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setTarget(null)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="destructive" disabled={!ready || busy} onClick={() => void erase()}>
							{busy ? t("danger.erasing") : t("danger.eraseNow")}
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<Callout tone="problem">{t("danger.noUndo")}</Callout>

					{/* Only for one space, and only when a copy of it is being kept
					    somewhere. Erasing everything in browser mode takes the whole file
					    and the settings with it, so there is nothing left to run a backup. */}
					{target?.kind === "space" && copyKeepsIt ? (
						<div className="rounded-sm border border-line bg-sunken p-3">
							<label className="flex items-start gap-2 text-sm text-ink">
								<input
									type="checkbox"
									className="mt-1"
									checked={alsoTheCopy}
									onChange={(event) => setAlsoTheCopy(event.target.checked)}
								/>
								<span>
									{t("danger.alsoTheCopy", {
										where: t(`destination.${destination.kind ?? "webdav"}Short`),
									})}
								</span>
							</label>
							<p className="mt-2 text-xs leading-relaxed text-quiet">
								{t(alsoTheCopy ? "danger.alsoTheCopyHint" : "danger.keepTheCopyHint")}
							</p>
						</div>
					) : null}

					<Field
						label={t("danger.typeToConfirm", { word })}
						value={typed}
						onChange={(event) => setTyped(event.target.value)}
						autoComplete="off"
					/>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</div>
			</Dialog>
		</Panel>
	);
}
