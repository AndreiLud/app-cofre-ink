// A copy of everything, kept in a place of theirs, without being asked every time.
//
// This used to be four destinations of equal weight, one of which was a file the person
// carried, which put a thing somebody does by hand beside three things a machine does on
// its own. Carrying a file is now its own half of the screen, and what is left here is
// the half a machine can do: a server of theirs, an online database, a WebDAV folder.
//
// Three rules hold whichever one is picked. It covers every space at once, because a
// backup that covers some of them is a backup somebody trusts and should not. It says
// whether it is on, where it goes and when it last managed it, because a backup nobody
// can see the state of is a promise. And nothing here is ours: the address and the
// secret stay in this browser and the copy lands in a place the person already pays for
// or already runs.

import type { DestinationKind } from "@cofre/cloud";
import {
	BUNDLE_MEDIA_TYPE,
	bundleFileName,
	CloudError,
	DESTINATIONS,
	packBundle,
} from "@cofre/cloud";
import type { BackupOutcome, SyncStore } from "@cofre/storage";
import { keepMine, keepTheirs, runBackup, syncWithStore } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Select } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
	downloadBytes,
	downloadJson,
	FileTooLargeError,
	fileNameFor,
	LARGEST_FILE,
} from "../lib/download.ts";
import { backupState, setBackupState, subscribeToBackup } from "../storage/backupState.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import {
	type DestinationSettings,
	INTERVALS,
	lastBackupAt,
	markMet,
	rememberDestination,
	rememberWhen,
	storedDestination,
	storedWhen,
	type WhenToBackUp,
} from "../storage/destinations.ts";
import { normaliseServer } from "../storage/mode.ts";
import { createServerClient } from "../storage/remoteSession.ts";
import { storeFrom } from "../storage/storeFrom.ts";
import { SyncError, syncWithServer } from "../storage/syncClient.ts";

const KINDS: DestinationKind[] = ["server", "database", "webdav"];

/** A space that exists nowhere, for asking a place whether it answers at all. */
const PROBE = "conexao";

/**
 * What went wrong, in words.
 *
 * A drive answers with a number and a browser answers "Failed to fetch". Neither tells
 * the person what to do, and the three things that actually happen are always the same
 * three: no connection, a token that is no longer any good, or the service refusing for
 * a reason of its own.
 */
function saidWhy(error: unknown, t: (key: string, values?: Record<string, unknown>) => string) {
	if (error instanceof FileTooLargeError) {
		return t("data.tooLarge", { megabytes: Math.round(LARGEST_FILE / 1024 / 1024) });
	}
	if (error instanceof CloudError) {
		if (error.status === 0) return t("destination.unreachable", { where: error.where });
		if (error.status === 401 || error.status === 403) {
			return t("destination.refused", { where: error.where });
		}
		return t("destination.answered", { where: error.where, status: error.status });
	}
	if (error instanceof SyncError) return error.message;
	return error instanceof Error ? error.message : String(error);
}

export function AutomaticBackup() {
	const { session, driver, mode, server, user, spaces, reload } = useCofre();
	const { t, i18n } = useTranslation();
	const queries = useQueryClient();

	const [settings, setSettings] = useState<DestinationSettings>(storedDestination);
	const [when, setWhen] = useState<WhenToBackUp>(storedWhen);
	const [problem, setProblem] = useState<string | null>(null);
	const [said, setSaid] = useState<string | null>(null);
	const [signedIn, setSignedIn] = useState(false);

	// What the thing that runs on its own has been doing, which happens around the whole
	// application and not inside this screen.
	const running = useSyncExternalStore(subscribeToBackup, backupState, backupState);
	const [asking, setAsking] = useState<BackupOutcome | null>(null);
	const question = asking ?? running.waiting[0] ?? null;

	const kind = settings.kind;
	// Somebody already in server mode has an address. It is the one this would use.
	const serverAddress = settings.address === "" ? (server ?? "") : settings.address;

	/**
	 * A backup takes the spaces somebody may take a copy of, which is not the same list
	 * as the spaces they can read: a shared space they are a member of belongs to the
	 * people who run it. A server of theirs is the exception and takes everything they
	 * read, because there the two sides are the same space rather than a copy of it.
	 */
	const copyable = useQuery({
		queryKey: ["copyableSpaces"],
		enabled: Boolean(session),
		queryFn: () => session?.backup.copyable() ?? [],
	});
	const covered =
		kind === "server"
			? spaces.map((space) => space.id)
			: spaces.filter((space) => (copyable.data ?? []).includes(space.id)).map((space) => space.id);

	const change = (next: Partial<DestinationSettings>) => {
		const merged = { ...settings, ...next };
		setSettings(merged);
		rememberDestination(merged);
	};

	const changeWhen = (next: Partial<WhenToBackUp>) => {
		const merged = { ...when, ...next };
		setWhen(merged);
		rememberWhen(merged);
	};

	function storeFor(): SyncStore {
		const store = storeFrom(settings, t(`destination.${kind ?? "webdav"}`));
		if (store === null) throw new Error("a server of theirs is not a store");
		return store;
	}

	const where = kind === null ? "" : kind === "server" ? normaliseServer(serverAddress) : kind;
	const met = kind === null ? null : lastBackupAt(covered, where);

	const signIn = useMutation({
		mutationFn: async () => {
			const client = createServerClient(normaliseServer(serverAddress));
			await client.signIn({ email: settings.user.trim(), password: settings.secret });
			return client.me();
		},
		onSuccess: () => {
			setProblem(null);
			setSignedIn(true);
			change({ secret: "" });
		},
		onError: (error: unknown) => setProblem(saidWhy(error, t)),
	});

	/** Does this place answer, and does it let this browser in. Nothing is written. */
	const test = useMutation({
		mutationFn: async () => {
			if (kind === "server") {
				await createServerClient(normaliseServer(serverAddress)).me();
				return;
			}
			await storeFor().read(PROBE);
		},
		onSuccess: () => {
			setProblem(null);
			setSaid(t("auto.testOk"));
		},
		onError: (error: unknown) => {
			setSaid(null);
			setProblem(saidWhy(error, t));
		},
	});

	/**
	 * One exchange with the place, for every space at once. A space that fails stops the
	 * run: a backup that is partly done and says it is done is worse than one that says
	 * it could not finish.
	 */
	const backUp = useMutation({
		mutationFn: async () => {
			if (!driver) throw new Error("no database");
			if (covered.length === 0) throw new Error("no spaces");

			// A server of theirs is the other kind of agreement: it merges by record and
			// has nothing to ask anybody. A place that keeps a file is compared first and
			// stops on the one answer a machine may not give.
			if (kind === "server") {
				for (const spaceId of covered) {
					await syncWithServer(
						driver,
						normaliseServer(serverAddress),
						spaceId,
						user
							? { id: user.id, email: user.email, name: user.name, image: user.image }
							: undefined,
					);
					markMet(spaceId, where);
				}
				return Date.now();
			}

			const done = await runBackup(driver, storeFor(), covered);
			for (const outcome of done.outcomes) {
				if (outcome.did !== "asked") markMet(outcome.spaceId, where);
			}
			setBackupState({ at: done.at, waiting: done.waiting });
			return done.at;
		},
		onSuccess: async (at: number) => {
			setProblem(null);
			setSaid(
				t("auto.savedAt", {
					time: new Date(at).toLocaleTimeString(i18n.resolvedLanguage ?? "pt-BR", {
						hour: "2-digit",
						minute: "2-digit",
					}),
				}),
			);
			await reload();
			void queries.invalidateQueries();
		},
		onError: (error: unknown) => {
			setSaid(null);
			if (error instanceof SyncError && error.status === 404) {
				setProblem(t("data.syncNotYours"));
				return;
			}
			const rule =
				error !== null && typeof error === "object" && "rule" in error
					? String((error as { rule: unknown }).rule)
					: null;
			if (rule === "onePersonalSpace") {
				setProblem(t("destination.personalFromAnotherDevice"));
				return;
			}
			setProblem(t("auto.failed", { where: t(`destination.${kind ?? "webdav"}`) }));
		},
	});

	/** The name of the space a question is about, for the sentence that asks it. */
	const askedAbout = spaces.find((space) => space.id === question?.spaceId)?.name ?? "";

	/**
	 * The answer to the one question a machine may not answer.
	 *
	 * Two of the three lose something, and both of them hand the person a copy of the
	 * side that is about to go before it goes. Undoing is then the same door as any
	 * other file: restore it.
	 */
	const answer = useMutation({
		mutationFn: async (choice: "both" | "mine" | "theirs") => {
			if (!driver || !question) throw new Error("no question");
			const store = storeFor();
			const spaceId = question.spaceId;

			if (choice === "both") {
				await syncWithStore(driver, store, { spaceId });
			} else if (choice === "mine") {
				const bundle = question.comparison.bundle;
				if (bundle) downloadBytes(bundleFileName(spaceId), packBundle(bundle), BUNDLE_MEDIA_TYPE);
				await keepMine(driver, store, { spaceId, revision: question.comparison.revision });
			} else {
				if (!session) throw new Error("no session");
				downloadJson(
					fileNameFor("cofre_antes_de_trocar", "json"),
					await session.backup.exportSpaces([spaceId]),
				);
				await keepTheirs(driver, store, (id) => session.erasure.emptySpace(id), { spaceId });
			}

			markMet(spaceId, where);
			return spaceId;
		},
		onSuccess: async (spaceId: string) => {
			setAsking(null);
			setProblem(null);
			setBackupState({
				waiting: backupState().waiting.filter((one) => one.spaceId !== spaceId),
			});
			await reload();
			void queries.invalidateQueries();
		},
		onError: (error: unknown) => {
			setAsking(null);
			setProblem(saidWhy(error, t));
		},
	});

	const ready =
		kind === "server"
			? serverAddress !== "" && (signedIn || mode === "server")
			: kind === "webdav"
				? settings.address !== "" && settings.user !== "" && settings.secret !== ""
				: kind === "database"
					? settings.address !== "" && settings.secret !== ""
					: false;

	return (
		<div className="space-y-4">
			<Select
				label={t("destination.where")}
				value={kind ?? ""}
				onChange={(event) => {
					setSaid(null);
					setProblem(null);
					const picked = event.target.value;
					change({ kind: picked === "" ? null : (picked as DestinationKind) });
				}}
				options={[
					{ value: "", label: t("auto.pick") },
					...KINDS.map((value) => ({ value, label: t(`destination.${value}`) })),
				]}
				hint={kind === null ? undefined : t(`destination.${kind}Hint`)}
			/>

			{kind !== null && !DESTINATIONS[kind].worksInABrowser ? (
				<Callout tone="attention">{t("destination.needsPermission")}</Callout>
			) : null}

			{kind === "server" ? (
				<div className="max-w-md space-y-3">
					<Field
						label={t("data.server")}
						value={serverAddress}
						onChange={(event) => change({ address: event.target.value })}
						placeholder="https://cofre.seudominio.com"
						hint={t("data.serverHint")}
					/>
					{signedIn || mode === "server" ? null : (
						<>
							<Field
								label={t("onboarding.email")}
								type="email"
								autoComplete="email"
								value={settings.user}
								onChange={(event) => change({ user: event.target.value })}
							/>
							<Field
								label={t("signIn.password")}
								type="password"
								autoComplete="current-password"
								value={settings.secret}
								onChange={(event) => change({ secret: event.target.value })}
							/>
							<Button
								variant="secondary"
								disabled={serverAddress === "" || signIn.isPending}
								onClick={() => signIn.mutate()}
							>
								{t("data.connect")}
							</Button>
						</>
					)}
				</div>
			) : null}

			{kind === "webdav" ? (
				<div className="max-w-md space-y-3">
					<Field
						label={t("destination.folderAddress")}
						value={settings.address}
						onChange={(event) => change({ address: event.target.value })}
						placeholder="https://nuvem.exemplo.com/remote.php/dav/files/ana/cofre"
					/>
					<Field
						label={t("destination.user")}
						value={settings.user}
						onChange={(event) => change({ user: event.target.value })}
					/>
					<Field
						label={t("destination.appPassword")}
						type="password"
						value={settings.secret}
						onChange={(event) => change({ secret: event.target.value })}
						hint={t("destination.secretStaysHere")}
					/>
				</div>
			) : null}

			{kind === "database" ? (
				<div className="max-w-md space-y-3">
					<Field
						label={t("destination.databaseAddress")}
						value={settings.address}
						onChange={(event) => change({ address: event.target.value })}
						placeholder="https://cofre-voce.turso.io"
						hint={t("destination.databaseAddressHint")}
					/>
					<Field
						label={t("destination.token")}
						type="password"
						value={settings.secret}
						onChange={(event) => change({ secret: event.target.value })}
						hint={t("destination.secretStaysHere")}
					/>
				</div>
			) : null}

			{kind === null ? null : (
				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="secondary"
						size="small"
						disabled={!ready || test.isPending}
						onClick={() => test.mutate()}
					>
						{t("auto.test")}
					</Button>
					<Button
						variant={when.on ? "quiet" : "primary"}
						size="small"
						disabled={!ready}
						onClick={() => {
							changeWhen({ on: !when.on });
							setSaid(null);
							setProblem(null);
						}}
					>
						{when.on ? t("auto.turnOff") : t("auto.turnOn")}
					</Button>
					<Button
						variant="secondary"
						size="small"
						disabled={!ready || backUp.isPending || covered.length === 0}
						onClick={() => backUp.mutate()}
					>
						{t("auto.now")}
					</Button>
				</div>
			)}

			{(problem ?? running.problem) ? (
				<Callout tone="problem">{problem ?? running.problem}</Callout>
			) : null}
			{(said ?? running.said) ? <p className="text-sm text-quiet">{said ?? running.said}</p> : null}

			{/* A question that nobody has answered yet outlives the run that found it,
			    because the copy of that space stands still until it is answered. */}
			{question && asking === null ? (
				<Callout tone="attention" title={t("auto.conflictTitle")}>
					<span className="flex flex-wrap items-center gap-3">
						<span>{t("auto.conflictWaiting", { name: askedAbout })}</span>
						<Button variant="secondary" size="small" onClick={() => setAsking(question)}>
							{t("auto.conflictOpen")}
						</Button>
					</span>
				</Callout>
			) : null}

			{/* The state of the thing, always, because a backup nobody can see is a
			    promise rather than a copy. */}
			<dl className="divide-y divide-line border-t border-line pt-3 text-sm">
				<div className="flex flex-wrap justify-between gap-2 pb-2">
					<dt className="text-quiet">{t("auto.state")}</dt>
					<dd className={when.on ? "text-ink" : "text-seal"}>
						{when.on ? t("auto.on") : t("auto.off")}
					</dd>
				</div>
				<div className="flex flex-wrap justify-between gap-2 py-2">
					<dt className="text-quiet">{t("auto.place")}</dt>
					<dd className="text-ink">
						{kind === null ? t("data.noCopyYet") : t(`destination.${kind}`)}
					</dd>
				</div>
				<div className="flex flex-wrap justify-between gap-2 pt-2">
					<dt className="text-quiet">{t("auto.lastRun")}</dt>
					<dd className={met === null ? "text-seal" : "text-ink"}>
						{met === null
							? t("data.neverBackedUp")
							: new Date(met).toLocaleString(i18n.resolvedLanguage ?? "pt-BR")}
					</dd>
				</div>
			</dl>

			{when.on ? (
				// The legend sits inside the fieldset, so the line that separates this
				// from the state above belongs to a wrapper: a border under a legend is a
				// rule with a word punched through it.
				<div className="border-t border-line pt-3">
					<fieldset className="space-y-2">
						<legend className="pb-1 text-sm text-quiet">{t("auto.when")}</legend>
						<p className="text-sm text-ink">{t("auto.onChange")}</p>
						<label className="flex items-start gap-3 text-sm">
							<input
								type="checkbox"
								checked={when.onLoad}
								onChange={(event) => changeWhen({ onLoad: event.target.checked })}
								className="mt-1 size-4 accent-[var(--ink)]"
							/>
							<span className="text-ink">{t("auto.onLoad")}</span>
						</label>
						<Select
							label={t("auto.everyLabel")}
							value={when.everyMinutes === null ? "" : String(when.everyMinutes)}
							onChange={(event) =>
								changeWhen({
									everyMinutes: event.target.value === "" ? null : Number(event.target.value),
								})
							}
							options={[
								{ value: "", label: t("auto.everyNever") },
								...INTERVALS.map((minutes) => ({
									value: String(minutes),
									label: t(`auto.every${minutes}`),
								})),
							]}
						/>
					</fieldset>
				</div>
			) : null}

			{/* Both sides wrote since they last agreed. Nothing has been written over and
			    nothing will be until this is answered, and two of the three answers hand
			    back a copy of what they are about to let go of. */}
			<Dialog
				open={asking !== null}
				onOpenChange={(next) => {
					if (!next) setAsking(null);
				}}
				title={t("auto.conflictTitle")}
				description={t("auto.conflictBody", {
					name: askedAbout,
					here: asking?.comparison.onlyMine ?? 0,
					there: asking?.comparison.onlyTheirs ?? 0,
				})}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setAsking(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="primary"
							disabled={answer.isPending}
							onClick={() => answer.mutate("both")}
						>
							{t("auto.keepBoth")}
						</Button>
					</>
				}
			>
				<div className="space-y-3">
					<p className="text-sm leading-relaxed text-quiet">{t("auto.keepBothHint")}</p>
					<div className="flex flex-wrap gap-2 border-t border-line pt-3">
						<Button
							variant="secondary"
							size="small"
							disabled={answer.isPending}
							onClick={() => answer.mutate("mine")}
						>
							{t("auto.keepMine")}
						</Button>
						<Button
							variant="secondary"
							size="small"
							disabled={answer.isPending}
							onClick={() => answer.mutate("theirs")}
						>
							{t("auto.keepTheirs")}
						</Button>
					</div>
					<p className="text-sm leading-relaxed text-quiet">{t("auto.undoSaved")}</p>
				</div>
			</Dialog>
		</div>
	);
}
