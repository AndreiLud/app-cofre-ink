// The data, and what the person can do with it.
//
// Taking everything out in one file, putting it back somewhere else, keeping a copy
// somewhere the person chooses, and mirroring the records into a spreadsheet for
// whoever prefers one. Every button on this screen says where the data goes, and
// nothing on it happens until one is pressed.

import { mirrorToSheet } from "@cofre/cloud";
import { writeAmount, writeCsv } from "@cofre/importers";
import type { Backup, RecordForExport, RestoreResult } from "@cofre/storage";
import { Button, Callout, Field, SectionTitle } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Destinations } from "../components/Destinations.tsx";
import { downloadCsv, downloadJson, fileNameFor, readPickedFile } from "../lib/download.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

function Section({
	title,
	children,
	description,
}: {
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<section className="space-y-3 border-t border-rule pt-5">
			<h2 className="font-serif text-lg">{title}</h2>
			<p className="max-w-[60ch] text-sm text-graphite">{description}</p>
			{children}
		</section>
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
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { session, currentSpace, spaces, reload } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const [problem, setProblem] = useState<string | null>(null);
	const [restored, setRestored] = useState<RestoreResult | null>(null);
	const [sheet, setSheet] = useState(storedSheet);
	const [mirrored, setMirrored] = useState<string | null>(null);

	function failed(error: unknown) {
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
			await reload();
			void queries.invalidateQueries();
		},
		onError: failed,
	});

	return (
		<div className="space-y-6">
			<SectionTitle level="h1">{t("data.title")}</SectionTitle>
			<p className="max-w-[60ch] text-sm text-graphite">{t("data.explain")}</p>

			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			<Section title={t("data.importTitle")} description={t("data.importBody")}>
				<Button variant="primary" onClick={() => void navigate({ to: ROUTES.import })}>
					{t("data.importAction")}
				</Button>
			</Section>

			<Section title={t("data.exportTitle")} description={t("data.exportBody")}>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="secondary"
						disabled={spaceId === "" || exportSpace.isPending}
						onClick={() => exportSpace.mutate()}
					>
						{t("data.exportSpace", { name: currentSpace?.name ?? "" })}
					</Button>
					{spaces.length > 1 ? (
						<Button
							variant="secondary"
							disabled={exportAll.isPending}
							onClick={() => exportAll.mutate()}
						>
							{t("data.exportEverything")}
						</Button>
					) : null}
					<Button
						variant="quiet"
						disabled={spaceId === "" || exportRecords.isPending}
						onClick={() => exportRecords.mutate()}
					>
						{t("data.exportRecords")}
					</Button>
				</div>
			</Section>

			<Section title={t("data.sheetTitle")} description={t("data.sheetBody")}>
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
						<p className="text-sm text-graphite">
							{t("data.sheetDone")}{" "}
							<a className="underline" href={mirrored} target="_blank" rel="noreferrer">
								{mirrored}
							</a>
						</p>
					) : null}
				</div>
			</Section>

			<Section title={t("data.restoreTitle")} description={t("data.restoreBody")}>
				<label htmlFor="backupFile" className="block text-sm font-medium text-ink">
					{t("data.restorePick")}
				</label>
				<input
					id="backupFile"
					type="file"
					accept=".json,application/json"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) restore.mutate(file);
						event.target.value = "";
					}}
					className="block w-full max-w-md text-sm text-ink file:mr-3 file:rounded-sm file:border file:border-rule file:bg-raised file:px-3 file:py-2 file:text-sm file:text-ink"
				/>
				{restored ? <RestoreSummary result={restored} /> : null}
			</Section>

			<Section title={t("data.syncTitle")} description={t("data.syncBody")}>
				<Destinations />
			</Section>
		</div>
	);
}
