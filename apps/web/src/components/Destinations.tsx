// Where a copy of this space lives, besides here.
//
// Five answers, and the screen is honest about what each one costs. A file always
// works and asks the person to move it. A server of theirs is the best of both and
// asks them to run one. A drive is convenient and asks them to make an application in
// their own account. What none of them do is put this data anywhere that belongs to
// this project.

import {
	BUNDLE_MEDIA_TYPE,
	bundleFileName,
	CloudError,
	createFileStore,
	createLibsqlStore,
	createWebdavStore,
	DESTINATIONS,
	type DestinationKind,
	packBundle,
	unpackBundle,
} from "@cofre/cloud";
import { type StoredBundle, type SyncBundle, type SyncStore, syncWithStore } from "@cofre/storage";
import { Button, Callout, Field, Select } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadBytes, FileTooLargeError, LARGEST_FILE, readPickedFile } from "../lib/download.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import {
	type DestinationSettings,
	lastMet,
	markMet,
	rememberDestination,
	storedDestination,
} from "../storage/destinations.ts";
import { normaliseServer } from "../storage/mode.ts";
import { createServerClient } from "../storage/remoteSession.ts";
import { lastSyncAt, SyncError, syncWithServer } from "../storage/syncClient.ts";

const KINDS: DestinationKind[] = ["file", "server", "database", "webdav"];

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

type Outcome = {
	sent: number;
	received: number;
	where: string;
	unchanged: boolean;
	/** The space the file turned out to be about, when it was not this one. */
	broughtIn: string | null;
};

export function Destinations() {
	const { t, i18n } = useTranslation();
	const { session, driver, mode, server, user, currentSpace, spaces, selectSpace, reload } =
		useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const [settings, setSettings] = useState<DestinationSettings>(storedDestination);
	const [incoming, setIncoming] = useState<{ bundle: SyncBundle; name: string } | null>(null);
	const [outcome, setOutcome] = useState<Outcome | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const [signedIn, setSignedIn] = useState(false);

	const kind = settings.kind;
	// Somebody already in server mode has an address. It is the one this would use.
	const serverAddress = settings.address === "" ? (server ?? "") : settings.address;

	const change = (next: Partial<DestinationSettings>) => {
		const merged = { ...settings, ...next };
		setSettings(merged);
		rememberDestination(merged);
	};

	function storeFor(): SyncStore {
		if (kind === "webdav") {
			return createWebdavStore({
				url: settings.address,
				user: settings.user,
				password: settings.secret,
				name: t("destination.webdav"),
			});
		}
		if (kind === "database") {
			return createLibsqlStore({
				url: settings.address,
				token: settings.secret,
				name: t("destination.database"),
			});
		}

		return createFileStore({
			name: t("destination.file"),
			read: async (): Promise<StoredBundle> => ({
				bundle: incoming?.bundle ?? null,
				revision: null,
			}),
			// Packed, because a log is the same twenty words over and over and a file a
			// fifth of the size is a sync that finishes on a real connection.
			write: (bundle) =>
				downloadBytes(bundleFileName(bundle.spaceId), packBundle(bundle), BUNDLE_MEDIA_TYPE),
		});
	}

	/** The space this exchange is about: the one that is open, or the one in the file. */
	const target = incoming?.bundle.spaceId ?? spaceId;
	const newToThisDevice = target !== "" && !spaces.some((space) => space.id === target);

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

	const sync = useMutation({
		mutationFn: async (): Promise<Outcome> => {
			if (!driver) throw new Error("no database");

			if (kind === "server") {
				const done = await syncWithServer(
					driver,
					normaliseServer(serverAddress),
					target,
					user ? { id: user.id, email: user.email, name: user.name, image: user.image } : undefined,
				);
				return {
					sent: done.pushed,
					received: done.pulled,
					where: normaliseServer(serverAddress),
					unchanged: done.pushed === 0 && done.pulled === 0,
					broughtIn: null,
				};
			}

			const store = storeFor();
			const done = await syncWithStore(driver, store, { spaceId: target });

			// A file that brought a space this device had never seen makes whoever read
			// it the owner of it, the same way the server does when one arrives there.
			let broughtIn: string | null = null;
			if (newToThisDevice && session) {
				const taken = await session.spaces.adopt(target);
				broughtIn = taken.name;
			}

			return {
				sent: done.pushed,
				received: done.pulled,
				where: done.store,
				unchanged: done.unchanged,
				broughtIn,
			};
		},
		onSuccess: async (done) => {
			setProblem(null);
			setOutcome(done);
			markMet(target, kind);
			await reload();
			void queries.invalidateQueries();
			if (done.broughtIn !== null) selectSpace(target);
			setIncoming(null);
		},
		onError: (error: unknown) => {
			if (error instanceof SyncError && error.status === 404) {
				setProblem(t("data.syncNotYours"));
				return;
			}
			// A personal space from another device cannot become a second personal space
			// here. The way to move one is the backup, which merges it into this one.
			const rule =
				error !== null && typeof error === "object" && "rule" in error
					? String((error as { rule: unknown }).rule)
					: null;
			if (rule === "onePersonalSpace") {
				setProblem(t("destination.personalFromAnotherDevice"));
				return;
			}
			setProblem(saidWhy(error, t));
		},
	});

	const met = target === "" ? null : lastMet(target, kind);
	const serverMet =
		spaceId === "" || settings.address === ""
			? null
			: lastSyncAt(spaceId, normaliseServer(settings.address));
	const seen = kind === "server" ? (serverMet ?? met) : met;

	const ready =
		kind === "file"
			? true
			: kind === "server"
				? serverAddress !== "" && (signedIn || mode === "server")
				: kind === "webdav"
					? settings.address !== "" && settings.user !== "" && settings.secret !== ""
					: settings.address !== "" && settings.secret !== "";

	return (
		<div className="space-y-4">
			<Select
				label={t("destination.where")}
				value={kind}
				onChange={(event) => {
					setOutcome(null);
					setProblem(null);
					change({ kind: event.target.value as DestinationKind });
				}}
				options={KINDS.map((value) => ({ value, label: t(`destination.${value}`) }))}
				hint={t(`destination.${kind}Hint`)}
			/>

			{DESTINATIONS[kind].safeTogether ? null : (
				<Callout tone="attention">{t("destination.notSafeTogether")}</Callout>
			)}
			{DESTINATIONS[kind].worksInABrowser ? null : (
				<Callout tone="attention">{t("destination.needsPermission")}</Callout>
			)}

			{kind === "file" ? (
				<div className="space-y-2">
					<label htmlFor="bundleFile" className="block text-sm font-medium text-ink">
						{t("destination.pickFile")}
					</label>
					<input
						id="bundleFile"
						type="file"
						accept=".json,.gz,application/json,application/gzip"
						onChange={(event) => {
							const file = event.target.files?.[0];
							event.target.value = "";
							if (!file) return;
							void readPickedFile(file)
								.then((bytes) => {
									// Packed or not: a file written by an older version still reads.
									const bundle = unpackBundle(bytes);
									if (bundle === null) {
										setProblem(t("destination.notABundle"));
										return;
									}
									setIncoming({ bundle, name: file.name });
									setProblem(null);
								})
								.catch(() => setProblem(t("destination.notABundle")));
						}}
						className="block w-full max-w-md text-sm text-ink file:mr-3 file:rounded-sm file:border file:border-lineStrong file:bg-sunken file:px-3 file:py-2 file:text-sm file:text-ink"
					/>
					<p className="text-xs text-quiet">{t("destination.pickFileHint")}</p>
					{incoming ? (
						<p className="text-sm text-quiet">
							{t("destination.fileHolds", {
								name: incoming.name,
								count: incoming.bundle.changes.length,
							})}
						</p>
					) : null}
				</div>
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

			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			<div className="space-y-2">
				<Button
					variant="primary"
					disabled={!ready || target === "" || sync.isPending}
					onClick={() => sync.mutate()}
				>
					{newToThisDevice
						? t("destination.bringIn")
						: t("data.syncNow", { name: currentSpace?.name ?? "" })}
				</Button>

				{outcome ? (
					<p className="text-sm text-quiet">
						{outcome.broughtIn !== null
							? t("destination.broughtIn", { name: outcome.broughtIn })
							: outcome.unchanged
								? t("destination.alreadyAgreed", { where: outcome.where })
								: t("data.syncDone", { sent: outcome.sent, received: outcome.received })}
					</p>
				) : null}

				{seen === null ? null : (
					<p className="text-xs text-quiet">
						{t("data.lastSync", {
							when: new Date(seen).toLocaleString(i18n.resolvedLanguage ?? "pt-BR"),
						})}
					</p>
				)}
			</div>
		</div>
	);
}
