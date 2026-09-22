// Where the data leaves.
//
// Everything else in Cofre is reversible or recoverable: a record is archived, a space
// is removed and its rows sit there, a backup brings it all back. This is the one place
// that is none of those things, so it looks different, it is at the bottom, and nothing
// in it happens without the name being typed out.
//
// It is here rather than behind a support address because of the promise the project
// makes. Data that the owner cannot take back is data somebody else is holding.

import type { Space } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Panel } from "@cofre/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";

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

	// In browser mode the whole database is one file on this machine, so erasing
	// everything means the file. On a server it means the spaces of this account, and
	// the account itself stays, because signing up again is not the same question.
	const onThisDevice = mode === "browser";

	function open(next: Target) {
		setTarget(next);
		setTyped("");
		setProblem(null);
		setDone(null);
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
				const result = await session.erasure.eraseSpace(target.space.id);
				queries.clear();
				await reload();
				setTarget(null);
				setDone(
					result.spaceRemoved
						? t("danger.spaceGone", { name: result.name, count: result.rows })
						: t("danger.spaceEmptied", { name: result.name, count: result.rows }),
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
