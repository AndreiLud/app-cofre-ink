// The data, and what the person can do with it.
//
// This screen had six sections of equal weight, every one of them open, and somebody
// arriving to do the one thing they came for had to read all of it first. Most of what
// was on it is something a person does once a year or never.
//
// So it is ordered by how often it is done rather than by what the code calls it. Where
// the data is and when it was last copied, first, because that is the question the
// screen is really being asked. Then the three things somebody actually does: save a
// copy, bring one back, read a statement in. Everything else is behind one line of text
// that says what is inside, and the zone that erases is last and looks it.
//
// Nothing here happens without being asked, and the two that write into the space say
// what they are about to do before they do it.

import { mirrorToSheet } from "@cofre/cloud";
import { writeAmount, writeCsv } from "@cofre/importers";
import type { Backup, RecordForExport, RestoreResult } from "@cofre/storage";
import { Button, Callout, Dialog, Disclosure, Field, Icon, Panel, SectionTitle } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { DangerZone } from "../components/DangerZone.tsx";
import { Destinations } from "../components/Destinations.tsx";
import {
	downloadCsv,
	downloadJson,
	FileTooLargeError,
	fileNameFor,
	LARGEST_FILE,
	readPickedFile,
} from "../lib/download.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { lastMet, storedDestination } from "../storage/destinations.ts";

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
	const { session, currentSpace, spaces, mode, reload } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const [problem, setProblem] = useState<string | null>(null);
	const [restored, setRestored] = useState<RestoreResult | null>(null);
	const [waiting, setWaiting] = useState<File | null>(null);
	const [sheet, setSheet] = useState(storedSheet);
	const [mirrored, setMirrored] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<number | null>(() => backupAt(spaceId));

	function failed(error: unknown) {
		if (error instanceof FileTooLargeError) {
			setProblem(t("data.tooLarge", { megabytes: Math.round(LARGEST_FILE / 1024 / 1024) }));
			return;
		}
		setProblem(error instanceof Error ? error.message : String(error));
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
				t("data.column.installment"),
			],
			rows: records.map((record) => [
				record.happenedOn,
				record.description,
				writeAmount(record.amount),
				record.currency,
				t(`transactionKind.${record.kind}`),
				t(`transactionStatus.${record.status}`),
				record.account,
				record.counterAccount,
				record.card,
				record.category,
				record.priority === null ? null : t(`priority.${record.priority}`),
				record.notes,
				record.invoiceMonth,
				record.installment,
			]),
		};
	}

	const exportSpace = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			return session.backup.exportSpace(spaceId);
		},
		onSuccess: (backup: Backup) => {
			setProblem(null);
			downloadJson(fileNameFor("cofre_espaco", "json"), backup);
			rememberBackup(spaceId);
			setSavedAt(Date.now());
		},
		onError: failed,
	});

	const exportAll = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			return session.backup.exportEverything();
		},
		onSuccess: (backup: Backup) => {
			setProblem(null);
			downloadJson(fileNameFor("cofre_completo", "json"), backup);
		},
		onError: failed,
	});

	const exportRecords = useMutation({
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

	const restore = useMutation({
		mutationFn: async (file: File) => {
			if (!session) throw new Error("no session");
			const text = new TextDecoder().decode(await readPickedFile(file));
			return session.backup.restore(JSON.parse(text) as Backup);
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
			failed(error);
		},
	});

	if (!currentSpace) return null;

	const when = (at: number) => new Date(at).toLocaleString(i18n.resolvedLanguage ?? "pt-BR");

	// What this device is set up to keep a copy in, and when it last managed to.
	const destination = storedDestination();
	const met = spaceId === "" ? null : lastMet(spaceId, destination.kind);

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
						<dt className="text-quiet">{t("data.lastBackup")}</dt>
						<dd className={savedAt === null ? "text-seal" : "text-ink"}>
							{savedAt === null ? t("data.neverBackedUp") : when(savedAt)}
						</dd>
					</div>
					<div className="flex flex-wrap justify-between gap-2 pt-2">
						<dt className="text-quiet">{t("data.copyIn")}</dt>
						<dd className="text-ink">
							{met === null
								? t("data.noCopyYet")
								: t("data.copyMet", {
										where: t(`destination.${destination.kind}`),
										when: when(met),
									})}
						</dd>
					</div>
				</dl>
			</Panel>

			<Panel title={t("data.everydayTitle")} description={t("data.everydayBody")}>
				<div className="divide-y divide-line">
					<Action
						title={t("data.saveCopy")}
						action={
							<Button
								variant="primary"
								disabled={spaceId === "" || exportSpace.isPending}
								onClick={() => exportSpace.mutate()}
							>
								{t("data.saveCopyAction")}
							</Button>
						}
					>
						{t("data.saveCopyBody", { name: currentSpace.name })}
					</Action>

					<Action
						title={t("data.bringBack")}
						action={
							<label className="cursor-pointer rounded-sm border border-lineStrong bg-sunken px-3 py-2 text-sm text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
								{t("data.bringBackAction")}
								<input
									type="file"
									accept=".json,application/json"
									className="sr-only"
									onChange={(event) => {
										const file = event.target.files?.[0];
										event.target.value = "";
										// Chosen, not yet read: it writes into the space, so it
										// says what it is about to do first.
										if (file) setWaiting(file);
									}}
								/>
							</label>
						}
					>
						{t("data.bringBackBody")}
					</Action>

					<Action
						title={t("data.importTitle")}
						action={
							<Button variant="secondary" onClick={() => void navigate({ to: ROUTES.import })}>
								{t("data.importAction")}
							</Button>
						}
					>
						{t("data.importBody")}
					</Action>
				</div>
			</Panel>

			{/* Open already when it is set up, because then it is not a rarity any more:
			    it is the button somebody came here to press. */}
			<Disclosure
				summary={t("data.syncTitle")}
				hint={t("data.syncBody")}
				open={destination.kind !== "file" || met !== null}
			>
				<Destinations />
			</Disclosure>

			<Disclosure summary={t("data.moreTitle")} hint={t("data.moreBody")}>
				<div className="divide-y divide-line">
					{spaces.length > 1 ? (
						<Action
							title={t("data.exportEverything")}
							action={
								<Button
									variant="secondary"
									disabled={exportAll.isPending}
									onClick={() => exportAll.mutate()}
								>
									{t("data.saveCopyAction")}
								</Button>
							}
						>
							{t("data.exportEverythingBody")}
						</Action>
					) : null}

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

			{/* Reading a file in writes into the space, so it says what it will do. It
			    adds and never removes, which is the part somebody needs to hear. */}
			<Dialog
				open={waiting !== null}
				onOpenChange={(next) => {
					if (!next) setWaiting(null);
				}}
				title={t("data.bringBackConfirmTitle")}
				description={t("data.bringBackConfirmBody", { name: waiting?.name ?? "" })}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setWaiting(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="primary"
							disabled={restore.isPending}
							onClick={() => waiting && restore.mutate(waiting)}
						>
							{restore.isPending ? t("data.bringingBack") : t("data.bringBackNow")}
						</Button>
					</>
				}
			>
				<Callout tone="neutral">
					<span className="flex items-start gap-2">
						<Icon name="check" className="mt-0.5 shrink-0 text-cedar" />
						{t("data.bringBackAdds")}
					</span>
				</Callout>
			</Dialog>
		</div>
	);
}
