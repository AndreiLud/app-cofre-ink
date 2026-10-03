// The data, and what the person can do with it.
//
// This screen had six sections of equal weight, every one of them open, and somebody
// arriving to do the one thing they came for had to read all of it first. Most of what
// was on it is something a person does once a year or never.
//
// So it is ordered by how often it is done rather than by what the code calls it. Where
// the data is and when it was last copied, first, because that is the question the
// screen is really being asked.
//
// Then a copy, and a copy is one of two things and never a third. Either somebody makes
// it, which is a file they download and keep, or a machine makes it, which is a place
// of theirs that is kept up to date on its own. Those are the two panels, in that order,
// and everything that used to sit between them (a file that was also a destination, a
// backup of one space and a backup of all of them under different names) was the reason
// somebody could end up holding the wrong file and not know it.
//
// Reading a statement in is not a copy at all and sits on its own. The zone that erases
// is last and looks it. Nothing here happens without being asked, and the two that write
// into the space say what they are about to do before they do it.

import { mirrorToSheet, unpackBundle } from "@cofre/cloud";
import { writeAmount, writeCsv } from "@cofre/importers";
import type { Backup, RecordForExport, RestoreResult } from "@cofre/storage";
import {
	BACKUP_FORMAT,
	BACKUP_VERSION,
	backupFromBundle,
	RuleError,
	replaceTheCopy,
} from "@cofre/storage";
import { Button, Callout, Dialog, Disclosure, Field, Icon, Panel, SectionTitle } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AboutThisCopy, MANUAL_COPY } from "../components/AboutThisCopy.tsx";
import { AutomaticBackup } from "../components/AutomaticBackup.tsx";
import { DangerZone } from "../components/DangerZone.tsx";
import { downloadCsv, downloadJson, fileNameFor, readPickedFile } from "../lib/download.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import {
	readyToBackUp,
	storedDestination,
	storedWhen,
	whenSettingsChange,
} from "../storage/destinations.ts";
import { storeFrom } from "../storage/storeFrom.ts";

const BACKUP_KEY = "cofreBackupAt";

function rememberBackup(spaceId: string): void {
	try {
		localStorage.setItem(`${BACKUP_KEY}:${spaceId}`, String(Date.now()));
	} catch {
		// Without storage the screen simply cannot say when the last one was.
	}
}

function backupAt(spaceId: string): number | null {
	try {
		const value = Number(localStorage.getItem(`${BACKUP_KEY}:${spaceId}`));
		return Number.isFinite(value) && value > 0 ? value : null;
	} catch {
		return null;
	}
}

/**
 * When the last copy was, over several spaces.
 *
 * A backup takes whichever spaces were ticked, so there is no single date any more and
 * the panel has to choose which one it shows. It shows the oldest, and says never when
 * any of them has never been saved, because the question behind that line is whether the
 * data is safe and the answer to that is the weakest of the spaces, not the luckiest.
 */
function oldestBackup(spaceIds: readonly string[]): number | null {
	if (spaceIds.length === 0) return null;
	let oldest: number | null = null;
	for (const spaceId of spaceIds) {
		const at = backupAt(spaceId);
		if (at === null) return null;
		if (oldest === null || at < oldest) oldest = at;
	}
	return oldest;
}

/** A refusal about a role, whichever side of the wire it came from. */
function refused(error: unknown): boolean {
	const named = error as { name?: string; status?: number } | null;
	return named?.name === "PermissionError" || named?.status === 403;
}

/** One thing this screen can do: a sentence, and the button that does it. */
function Action({
	title,
	children,
	action,
}: {
	title: string;
	children: ReactNode;
	action: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3 py-3">
			<span className="min-w-0 max-w-[62ch]">
				<span className="block text-sm font-medium text-ink">{title}</span>
				<span className="block text-sm leading-relaxed text-quiet">{children}</span>
			</span>
			<span className="flex shrink-0 flex-wrap gap-2">{action}</span>
		</div>
	);
}

/** One space with a box in front of it, for the two lists on this screen. */
function SpaceToTick({
	name,
	checked,
	disabled,
	why,
	onChange,
}: {
	name: string;
	checked: boolean;
	disabled?: boolean;
	why?: string;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-start gap-3 text-sm">
			<input
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={(event) => onChange(event.target.checked)}
				className="mt-1 size-4 accent-[var(--ink)]"
			/>
			<span className="min-w-0">
				<span className="font-medium text-ink">{name}</span>
				{why ? <span className="block text-quiet">{why}</span> : null}
			</span>
		</label>
	);
}

function RestoreSummary({ result }: { result: RestoreResult }) {
	const { t } = useTranslation();
	return (
		<Callout tone="neutral" title={t("data.restoredTitle")}>
			<ul className="space-y-1">
				{result.spaces.map((space) => (
					<li key={space.spaceId}>
						{t("data.restoredSpace", { name: space.name, count: space.written })}
						{space.skipped.map((entry) => (
							<span key={`${entry.table}:${entry.reason}`} className="block text-xs">
								{t(`data.skipped.${entry.reason}`, { count: entry.count, table: entry.table })}
							</span>
						))}
					</li>
				))}
			</ul>
		</Callout>
	);
}

const SHEET_KEY = "cofreSheet";

function storedSheet(): { token: string; spreadsheetId: string } {
	try {
		const raw = localStorage.getItem(SHEET_KEY);
		if (raw) return JSON.parse(raw) as { token: string; spreadsheetId: string };
	} catch {
		// Without storage the fields start empty, which still works.
	}
	return { token: "", spreadsheetId: "" };
}

export function DataPage() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { session, driver, currentSpace, spaces, mode, reload, chooseAgain } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const [problem, setProblem] = useState<string | null>(null);
	const [restored, setRestored] = useState<RestoreResult | null>(null);
	const [waiting, setWaiting] = useState<{ name: string; backup: Backup } | null>(null);
	/** Unticked spaces, for the copy being written and for the file waiting to come back. */
	const [leftOut, setLeftOut] = useState<Record<string, boolean>>({});
	const [leftBehind, setLeftBehind] = useState<Record<string, boolean>>({});
	/** Whether the file coming back should become the automatic copy as well. */
	const [alsoTheBackup, setAlsoTheBackup] = useState(false);
	/**
	 * The panel at the top says whether the copy is switched on, and the panel that
	 * switches it on is further down the same screen. They read the same settings, so
	 * the one that does not own them has to hear when they move.
	 */
	const [backingUp, setBackingUp] = useState(storedWhen);
	const [destination, setDestination] = useState(storedDestination);
	useEffect(
		() =>
			whenSettingsChange(() => {
				setBackingUp(storedWhen());
				setDestination(storedDestination());
			}),
		[],
	);
	const [sheet, setSheet] = useState(storedSheet);
	const [mirrored, setMirrored] = useState<string | null>(null);

	/** Which spaces this person may copy, which is a permission and not a guess. */
	const copyable = useQuery({
		queryKey: ["copyableSpaces"],
		enabled: Boolean(session),
		queryFn: () => session?.backup.copyable() ?? [],
	});
	const mayCopy = new Set(copyable.data ?? []);

	// The other permission, asked apart from the one above. The two hold the same roles
	// today, and a screen that asked one and acted on the other would break the day either
	// list changed, with nothing saying so.
	const restorable = useQuery({
		queryKey: ["restorableSpaces"],
		enabled: Boolean(session),
		queryFn: () => session?.backup.restorable() ?? [],
	});
	const mayRestoreInto = (spaceId: string) => new Set(restorable.data ?? []).has(spaceId);
	const chosen = spaces.filter((space) => mayCopy.has(space.id) && !leftOut[space.id]);

	function failed(error: unknown) {
		setProblem(sayWhy(error, t));
	}

	function rememberSheet(next: { token: string; spreadsheetId: string }) {
		setSheet(next);
		try {
			localStorage.setItem(SHEET_KEY, JSON.stringify(next));
		} catch {
			// The fields last for this tab, which is enough to press the button.
		}
	}

	/** The records as a table, which is what both the spreadsheet and the file want. */
	function asTable(records: readonly RecordForExport[]) {
		return {
			header: [
				t("table.date"),
				t("table.description"),
				t("table.amount"),
				t("data.column.currency"),
				t("data.column.kind"),
				t("data.column.status"),
				t("data.column.account"),
				t("data.column.counterAccount"),
				t("transaction.card"),
				t("table.category"),
				t("data.column.priority"),
				t("data.column.notes"),
				t("data.column.invoice"),
				t("data.column.originInvoice"),
				t("data.column.installment"),
			],
			rows: records.map((record) => [
				record.happenedOn,
				record.description,
				writeAmount(record.amount),
				record.currency,
				// The interface has no transfers any more: money that went into a card paid its
				// invoice, and anything else moved between two accounts.
				record.kind === "transfer"
					? t(
							record.counterKind === "credit"
								? "transactionKind.payment"
								: "transactionKind.transfer",
						)
					: t(`transactionKind.${record.kind}`),
				t(`transactionStatus.${record.status}`),
				record.account,
				record.counterAccount,
				record.card,
				record.category,
				record.priority === null ? null : t(`priority.${record.priority}`),
				record.notes,
				record.invoiceMonth,
				// A part of paying an invoice with another card, or of splitting one, is a purchase
				// on an invoice of the card it leaves, which the column before cannot hold.
				record.originInvoiceMonth,
				record.installment,
			]),
		};
	}

	const saveBackup = useMutation({
		mutationKey: ["theCopyItself"],
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			return session.backup.exportSpaces(chosen.map((space) => space.id));
		},
		onSuccess: (backup: Backup) => {
			setProblem(null);
			downloadJson(fileNameFor("cofre_backup", "json"), backup);
			// Every space that went into the file was copied, so every one of them has a
			// date now. The panel above reads them back on this same render.
			for (const space of chosen) rememberBackup(space.id);
		},
		onError: failed,
	});

	const exportRecords = useMutation({
		mutationKey: ["theCopyItself"],
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			return session.backup.recordsForExport(spaceId);
		},
		onSuccess: (records) => {
			setProblem(null);
			const table = asTable(records);
			downloadCsv(fileNameFor("cofre_lancamentos", "csv"), writeCsv(table.header, table.rows));
		},
		onError: failed,
	});

	const mirror = useMutation({
		mutationKey: ["theCopyItself"],
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			const table = asTable(await session.backup.recordsForExport(spaceId));
			return mirrorToSheet(
				{
					token: sheet.token,
					spreadsheetId: sheet.spreadsheetId === "" ? null : sheet.spreadsheetId,
					title: `Cofre: ${currentSpace?.name ?? ""}`,
				},
				table.header,
				table.rows,
			);
		},
		onSuccess: (result) => {
			setProblem(null);
			setMirrored(result.url);
			rememberSheet({ ...sheet, spreadsheetId: result.spreadsheetId });
		},
		onError: failed,
	});

	/**
	 * Reading the file happens when it is picked, not when it is confirmed, because the
	 * dialog has to say which spaces are inside before anybody agrees to anything.
	 */
	async function readTheFile(file: File): Promise<void> {
		try {
			const bytes = await readPickedFile(file);
			// Two files hold a whole space: the copy somebody keeps, which is the rows,
			// and the one an automatic backup leaves in a folder, which is every change
			// ever made to them. The second folds into the first, so both come back
			// through this one door instead of the person having to know which is which.
			const bundle = unpackBundle(bytes);

			// Said here rather than after the person has agreed to something, and said
			// about every shape of wrong file. A renamed PDF used to reach JSON.parse and
			// put its English complaint on the screen, and a JSON of the right shape with
			// no list of spaces used to fall over reading the length of nothing.
			let backup: Backup;
			if (bundle) {
				backup = backupFromBundle(bundle);
			} else {
				try {
					backup = JSON.parse(new TextDecoder().decode(bytes)) as Backup;
				} catch {
					throw new RuleError("notABackup", "this file is not even JSON");
				}
			}

			if (backup?.format !== BACKUP_FORMAT) {
				throw new RuleError("notABackup", "this file is not a backup of this application");
			}
			if (backup.version > BACKUP_VERSION) {
				throw new RuleError("backupIsNewer", "this backup was written by a newer version");
			}
			if (!Array.isArray(backup.spaces) || backup.spaces.length === 0) {
				throw new RuleError("backupHasNoSpace", "this backup carries no space at all");
			}

			setProblem(null);
			setLeftBehind({});
			setAlsoTheBackup(false);
			setWaiting({ name: file.name, backup });
		} catch (error) {
			failed(error);
		}
	}

	const insideTheFile = waiting?.backup.spaces ?? [];

	/**
	 * Spaces in the file that are already here and are not this person's to write into.
	 *
	 * This door asked nothing and refused at the end, which is the cost the one question
	 * was built to remove: somebody picked a file, read the dialog, ticked the spaces and
	 * pressed the destructive button to be told no. A space the file carries that is not
	 * here at all is open to anybody, because one that arrives with nobody in it is
	 * nobody's to refuse.
	 */
	const notMine = insideTheFile
		.filter((space) => spaces.some((here) => here.id === space.id) && !mayRestoreInto(space.id))
		.map((space) => space.id);
	const bringing = insideTheFile.filter(
		(space) => !leftBehind[space.id] && !notMine.includes(space.id),
	);

	const restore = useMutation({
		mutationFn: async () => {
			if (!session || !waiting) throw new Error("no session");
			const only = bringing.map((space) => space.id);
			const result = await session.backup.restore(waiting.backup, { only });

			// With a copy keeping itself up to date somewhere, this file just made the two
			// sides differ. Either it becomes the copy too, or the next pass finds the
			// difference and asks about it, and the person said which.
			//
			// The spaces the restore actually wrote, not the ones named in the file. A
			// personal space of another device merges into the one here and a space that
			// belongs to somebody else arrives with a new identifier, and asking to write
			// over identifiers nobody has threw "there is nothing here to write over that"
			// after the restore had already happened.
			if (alsoTheBackup && driver) {
				const settings = storedDestination();
				const store =
					settings.kind === null
						? null
						: storeFrom(settings, t(`destination.${settings.kind}Short`));
				if (store) {
					await replaceTheCopy(
						driver,
						store,
						result.spaces.map((one) => one.spaceId),
					);
				}
			}
			return result;
		},
		onSuccess: async (result) => {
			setProblem(null);
			setRestored(result);
			setWaiting(null);
			await reload();
			void queries.invalidateQueries();
		},
		onError: (error: unknown) => {
			setWaiting(null);
			// The one refusal this door still has: a space that is already here and is
			// run by somebody else. It is about a role, so it is said as one.
			if (refused(error)) {
				setProblem(t("data.restoreNotYours"));
				return;
			}
			failed(error);
		},
	});

	if (!currentSpace) return null;

	const when = (at: number) => new Date(at).toLocaleString(i18n.resolvedLanguage ?? "pt-BR");

	/**
	 * A place that holds a file, switched on, complete, with a database here to copy from.
	 *
	 * Complete matters as much as chosen: with the address blanked out this aimed a read
	 * and a write of every restored space at the address this application is served from,
	 * carrying the person's application password in the header.
	 */
	const keepingACopy = backingUp.on && readyToBackUp(destination) && driver !== null;
	const mine = spaces.filter((space) => mayCopy.has(space.id));
	const savedAt = oldestBackup(mine.map((space) => space.id));

	return (
		<div className="space-y-5">
			<SectionTitle level="h1">{t("data.title")}</SectionTitle>

			{problem ? <Callout tone="problem">{problem}</Callout> : null}
			{restored ? <RestoreSummary result={restored} /> : null}

			{/* The question this screen is really being asked, answered before anything
			    on it can be pressed. */}
			<Panel title={t("data.whereTitle")}>
				<dl className="divide-y divide-line text-sm">
					<div className="flex flex-wrap justify-between gap-2 pb-2">
						<dt className="text-quiet">{t("data.whereLives")}</dt>
						<dd className="text-ink">
							{mode === "server" ? t("data.livesOnServer") : t("data.livesHere")}
						</dd>
					</div>
					<div className="flex flex-wrap justify-between gap-2 py-2">
						<dt className="text-quiet">
							{t("data.lastBackup")}
							{mine.length > 1 ? (
								<span className="block text-xs">{t("data.lastBackupOldest")}</span>
							) : null}
						</dt>
						<dd className={savedAt === null ? "text-seal" : "text-ink"}>
							{savedAt === null ? t("data.neverBackedUp") : when(savedAt)}
						</dd>
					</div>
					{/* The backup of this browser, so not a line to draw in server mode,
					    where it never runs. Settings left over from browser mode used to
					    make this say it was active in a place nothing was writing to. */}
					{mode === "server" ? null : (
						<div className="flex flex-wrap justify-between gap-2 pt-2">
							<dt className="text-quiet">{t("data.copyIn")}</dt>
							{/* What is happening, which is being asked for and having somewhere
							    to write it. This line and the panel below it used to answer
							    that question differently on the same screen. */}
							<dd className={keepingACopy ? "text-ink" : "text-seal"}>
								{keepingACopy && destination.kind !== null
									? t("auto.onAt", { where: t(`destination.${destination.kind}Short`) })
									: t("auto.off")}
							</dd>
						</div>
					)}
				</dl>

				{/* The way out of the answer above, which until now was only on screens
				    reached by accident. Somebody who started in this browser and wants
				    their records on the telephone comes here looking for exactly this. */}
				<div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
					{mode === "server" ? null : (
						<Button
							variant="secondary"
							size="small"
							onClick={() => document.getElementById("copia")?.scrollIntoView({ block: "start" })}
						>
							{t("data.turnOnSync")}
						</Button>
					)}
					<Button variant="quiet" size="small" onClick={chooseAgain}>
						{t("data.changeMode")}
					</Button>
				</div>
				{mode === "server" ? null : (
					<p className="mt-2 text-xs text-quiet">{t("data.changeModeHint")}</p>
				)}
			</Panel>

			{/* The first of the two ways to have a copy: somebody makes it. With an id of its
			    own, because the steps to update a server point here and #copia is the panel
			    below, which a server does not have. */}
			<div id={MANUAL_COPY}>
				<Panel title={t("data.manualTitle")} description={t("data.manualBody")}>
					<div className="divide-y divide-line">
						<div className="space-y-3 pb-4">
							<span className="block text-sm font-medium text-ink">{t("data.saveCopy")}</span>
							<span className="block max-w-[62ch] text-sm leading-relaxed text-quiet">
								{t("data.saveCopyBody")}
							</span>

							{/* With one space there is nothing to choose, so nothing is asked. */}
							{spaces.length > 1 ? (
								<fieldset className="space-y-2">
									<legend className="pb-1 text-sm text-quiet">{t("data.backupWhich")}</legend>
									{spaces.map((space) => (
										<SpaceToTick
											key={space.id}
											name={space.name}
											checked={mayCopy.has(space.id) && !leftOut[space.id]}
											disabled={!mayCopy.has(space.id)}
											why={mayCopy.has(space.id) ? undefined : t("data.backupCannot")}
											onChange={(checked) => setLeftOut({ ...leftOut, [space.id]: !checked })}
										/>
									))}
								</fieldset>
							) : null}

							<div className="flex flex-wrap items-center gap-3">
								<Button
									variant="primary"
									disabled={chosen.length === 0 || saveBackup.isPending}
									onClick={() => saveBackup.mutate()}
								>
									{t("data.saveCopyAction")}
								</Button>
								{chosen.length === 0 ? (
									<span className="text-sm text-seal">{t("data.backupPickOne")}</span>
								) : null}
							</div>
						</div>

						<Action
							title={t("data.bringBack")}
							action={
								<label className="cursor-pointer rounded-sm border border-lineStrong bg-sunken px-3 py-2 text-sm text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
									{t("data.bringBackAction")}
									<input
										type="file"
										accept=".json,.gz,application/json,application/gzip"
										className="sr-only"
										onChange={(event) => {
											const file = event.target.files?.[0];
											event.target.value = "";
											// Read, not written: the dialog says what is inside first.
											if (file) void readTheFile(file);
										}}
									/>
								</label>
							}
						>
							{t("data.bringBackBody")}
						</Action>
					</div>
				</Panel>
			</div>

			{/* The second: a machine makes it, in a place of theirs.
			    Only where there is a database in this browser for it to copy from. In
			    server mode the data is on the server and the copy of it is made there,
			    and this panel would have offered to turn on something that cannot run:
			    it said "Active in a WebDAV folder" and then never wrote anything. */}
			{mode === "server" ? null : (
				<div id="copia">
					<Panel title={t("auto.title")} description={t("auto.body")}>
						<AutomaticBackup />
					</Panel>
				</div>
			)}

			{/* Not a copy at all: it reads a file from the bank and writes records. */}
			<Panel title={t("data.importTitle")} description={t("data.importBody")}>
				<Button variant="secondary" onClick={() => void navigate({ to: ROUTES.import })}>
					{t("data.importAction")}
				</Button>
			</Panel>

			<Disclosure summary={t("data.moreTitle")} hint={t("data.moreBody")}>
				<div className="divide-y divide-line">
					<Action
						title={t("data.exportRecords")}
						action={
							<Button
								variant="secondary"
								disabled={spaceId === "" || exportRecords.isPending}
								onClick={() => exportRecords.mutate()}
							>
								{t("data.exportRecordsAction")}
							</Button>
						}
					>
						{t("data.exportRecordsBody")}
					</Action>
				</div>

				<div className="space-y-3 border-t border-line pt-4">
					<p className="text-sm font-medium text-ink">{t("data.sheetTitle")}</p>
					<p className="max-w-[62ch] text-sm leading-relaxed text-quiet">{t("data.sheetBody")}</p>
					<div className="max-w-md space-y-3">
						<Field
							label={t("data.sheetToken")}
							type="password"
							value={sheet.token}
							onChange={(event) => rememberSheet({ ...sheet, token: event.target.value })}
							hint={t("destination.secretStaysHere")}
						/>
						<Field
							label={t("data.sheetId")}
							value={sheet.spreadsheetId}
							onChange={(event) => rememberSheet({ ...sheet, spreadsheetId: event.target.value })}
							hint={t("data.sheetIdHint")}
						/>
						<Button
							variant="secondary"
							disabled={sheet.token === "" || spaceId === "" || mirror.isPending}
							onClick={() => mirror.mutate()}
						>
							{t("data.sheetAction")}
						</Button>
						{mirrored ? (
							<p className="text-sm text-quiet">
								{t("data.sheetDone")}{" "}
								<a className="underline" href={mirrored} target="_blank" rel="noreferrer">
									{mirrored}
								</a>
							</p>
						) : null}
					</div>
				</div>
			</Disclosure>

			<DangerZone />

			{/* Outside the red border, which is for what cannot be undone. */}
			<AboutThisCopy />

			{/* Reading a file in writes into the space, so it says what it will do. It
			    adds and never removes, which is the part somebody needs to hear. */}
			<Dialog
				open={waiting !== null}
				onOpenChange={(next) => {
					if (!next) setWaiting(null);
				}}
				title={t("data.bringBackConfirmTitle")}
				description={t("data.bringBackConfirmBody", { name: waiting?.name ?? "" })}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setWaiting(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="primary"
							disabled={restore.isPending || bringing.length === 0}
							onClick={() => restore.mutate()}
						>
							{restore.isPending ? t("data.bringingBack") : t("data.bringBackNow")}
						</Button>
					</>
				}
			>
				<div className="space-y-3">
					{/* One row per space in the file, and the ones that are already here and
					    are somebody else's are said to be, rather than ticked and refused at
					    the end. Bringing a space that is not here at all is open to anybody,
					    because a space that arrives with nobody in it is nobody's to refuse
					    and whoever brings it in becomes its owner. Writing into one that is
					    here asks for the permission to restore, which two roles have. */}
					{insideTheFile.length > 1 || notMine.length > 0 ? (
						<fieldset className="space-y-2">
							<legend className="pb-1 text-sm text-quiet">{t("data.bringBackWhich")}</legend>
							{insideTheFile.map((space) =>
								notMine.includes(space.id) ? (
									<p key={space.id} className="text-sm text-quiet">
										{t("data.bringBackNotYours", { name: space.name })}
									</p>
								) : (
									<SpaceToTick
										key={space.id}
										name={space.name}
										checked={!leftBehind[space.id]}
										onChange={(checked) => setLeftBehind({ ...leftBehind, [space.id]: !checked })}
									/>
								),
							)}
							{bringing.length === 0 ? (
								<p className="text-sm text-seal">{t("data.bringBackPickOne")}</p>
							) : null}
						</fieldset>
					) : null}

					<Callout tone="neutral">
						<span className="flex items-start gap-2">
							<Icon name="check" className="mt-0.5 shrink-0 text-cedar" />
							{t("data.bringBackAdds")}
						</span>
					</Callout>

					{/* With a copy keeping itself up to date somewhere, this file is about
					    to make the two sides differ, and there are only two honest answers
					    to that. Neither is chosen for them. */}
					{keepingACopy ? (
						<div className="space-y-2 border-t border-line pt-3">
							<label className="flex items-start gap-3 text-sm">
								<input
									type="checkbox"
									checked={alsoTheBackup}
									onChange={(event) => setAlsoTheBackup(event.target.checked)}
									className="mt-1 size-4 accent-[var(--ink)]"
								/>
								<span>
									<span className="font-medium text-ink">{t("data.alsoTheBackup")}</span>
									<span className="block text-quiet">{t("data.alsoTheBackupHint")}</span>
								</span>
							</label>
							{alsoTheBackup ? null : (
								<p className="text-sm leading-relaxed text-quiet">
									{t("data.notAlsoTheBackupHint")}
								</p>
							)}
						</div>
					) : null}
				</div>
			</Dialog>
		</div>
	);
}
