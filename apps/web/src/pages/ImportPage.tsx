// Reading a file from the bank into a space.
//
// Nothing is written until the person presses the button at the end. Everything before
// it is showing them what the file says: which column is which, what will be written,
// and what looks like something already here. An import that decides on its own is how
// somebody ends up with two of every purchase in a month and no way to tell which.

import type { FieldName, MarkedRecord } from "@cofre/importers";
import { markDuplicates, readFile } from "@cofre/importers";
import type { ImportedRecord } from "@cofre/storage";
import {
	Button,
	Callout,
	EmptyState,
	Icon,
	SectionTitle,
	Select,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ChangeEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { readPickedFile } from "../lib/download.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

const FIELDS: FieldName[] = [
	"happenedOn",
	"description",
	"amount",
	"debit",
	"credit",
	"notes",
	"externalId",
	"category",
	"ignore",
];

type Picked = {
	name: string;
	bytes: Uint8Array;
};

export function ImportPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const [picked, setPicked] = useState<Picked | null>(null);
	const [fields, setFields] = useState<FieldName[] | null>(null);
	const [accountId, setAccountId] = useState("");
	const [left, setLeft] = useState<Set<number>>(new Set());
	const [problem, setProblem] = useState<string | null>(null);
	const [written, setWritten] = useState<number | null>(null);

	const accounts = useQuery({
		queryKey: ["accounts", spaceId, "open"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});

	const usable = (accounts.data ?? []).filter((account) => account.archivedAt === null);
	const chosen = usable.find((account) => account.id === accountId) ?? usable[0];

	// Reading the file again with a corrected mapping is cheap and keeps one path:
	// whatever is on screen is exactly what the reader produced.
	const read = useMemo(() => {
		if (!picked) return null;
		const first = readFile(picked.bytes, { fileName: picked.name });
		if (!fields || !first.mapping) return first;
		return readFile(picked.bytes, {
			fileName: picked.name,
			mapping: { ...first.mapping, fields },
		});
	}, [picked, fields]);

	const span = useMemo(() => {
		const days = (read?.records ?? []).map((record) => record.happenedOn).sort();
		return { from: days[0], to: days[days.length - 1] };
	}, [read]);

	const existing = useQuery({
		queryKey: ["importExisting", spaceId, chosen?.id, span.from, span.to],
		enabled: Boolean(session && spaceId !== "" && span.from !== undefined),
		queryFn: () =>
			session?.imports.existing(spaceId, {
				from: span.from,
				to: span.to,
				accountId: chosen?.id,
			}) ?? [],
	});

	const marked: MarkedRecord[] = useMemo(() => {
		if (!read) return [];
		return markDuplicates(read.records, existing.data ?? []);
	}, [read, existing.data]);

	const keeping = marked.filter(
		(record, index) => !left.has(index) && !(record.certain && record.duplicateOf !== null),
	);

	async function pick(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		setProblem(null);
		setWritten(null);
		setLeft(new Set());
		setFields(null);
		setPicked({ name: file.name, bytes: await readPickedFile(file) });
	}

	function toggle(index: number) {
		setLeft((current) => {
			const next = new Set(current);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	}

	const save = useMutation({
		mutationFn: async () => {
			if (!session || !chosen) throw new Error("no session");
			const records: ImportedRecord[] = keeping.map((record) => ({
				happenedOn: record.happenedOn,
				amount: record.amount,
				description: record.description,
				notes: record.notes,
				externalId: record.externalId,
			}));
			return session.imports.create({ spaceId, accountId: chosen.id, records });
		},
		onSuccess: (result) => {
			setWritten(result.written);
			setPicked(null);
			setFields(null);
			void queries.invalidateQueries();
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	const duplicates = marked.filter((record) => record.duplicateOf !== null).length;

	return (
		<div className="space-y-6">
			<SectionTitle
				level="h1"
				action={
					<Button size="small" variant="quiet" onClick={() => void navigate({ to: ROUTES.data })}>
						{t("data.title")}
					</Button>
				}
			>
				{t("importing.title")}
			</SectionTitle>

			<p className="max-w-[60ch] text-sm text-graphite">{t("importing.explain")}</p>

			{written !== null ? (
				<Callout
					tone="neutral"
					title={t("importing.doneTitle", { count: written })}
					action={
						<Button
							size="small"
							variant="secondary"
							onClick={() => void navigate({ to: ROUTES.transactions })}
						>
							{t("importing.seeRecords")}
						</Button>
					}
				>
					{t("importing.doneBody", { count: written })}
				</Callout>
			) : null}

			<div className="space-y-3 border-y border-rule py-4">
				<label htmlFor="statementFile" className="block text-sm font-medium text-ink">
					{t("importing.pick")}
				</label>
				<input
					id="statementFile"
					type="file"
					accept=".csv,.txt,.ofx,.qfx,.qif,.xlsx,.json"
					onChange={(event) => void pick(event)}
					className="block w-full max-w-md text-sm text-ink file:mr-3 file:rounded-sm file:border file:border-rule file:bg-raised file:px-3 file:py-2 file:text-sm file:text-ink"
				/>
				<p className="text-xs text-graphite">{t("importing.pickHint")}</p>
			</div>

			{usable.length === 0 && accounts.isFetched ? (
				<Callout tone="attention" title={t("importing.noAccountTitle")}>
					{t("importing.noAccountBody")}
				</Callout>
			) : null}

			{read === null ? null : (
				<div className="space-y-5">
					<div className="flex flex-wrap items-end gap-4">
						<div className="min-w-[14rem] grow sm:grow-0">
							<Select
								label={t("importing.account")}
								value={chosen?.id ?? ""}
								onChange={(event) => setAccountId(event.target.value)}
								options={usable.map((account) => ({ value: account.id, label: account.name }))}
								hint={t("importing.accountHint")}
							/>
						</div>
						<p className="text-sm text-graphite">
							{t("importing.found", {
								count: read.records.length,
								format: read.format.toUpperCase(),
							})}
							{read.skipped.length > 0
								? ` ${t("importing.skipped", { count: read.skipped.length })}`
								: ""}
						</p>
					</div>

					{read.mapping && read.header.length > 0 ? (
						<section className="space-y-2">
							<h2 className="font-serif text-lg">{t("importing.columnsTitle")}</h2>
							<p className="max-w-[60ch] text-sm text-graphite">{t("importing.columnsHint")}</p>
							<div className="flex flex-wrap gap-3">
								{read.header.map((name, index) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: a column of a file is its position, and two columns can carry the same name
									<div key={`${name}:${index}`} className="w-44">
										<Select
											label={
												name === "" ? t("importing.columnNumber", { number: index + 1 }) : name
											}
											value={read.mapping?.fields[index] ?? "ignore"}
											onChange={(event) => {
												const next = [...(read.mapping?.fields ?? [])];
												next[index] = event.target.value as FieldName;
												setFields(next);
											}}
											options={FIELDS.map((field) => ({
												value: field,
												label: t(`importing.field.${field}`),
											}))}
										/>
									</div>
								))}
							</div>
						</section>
					) : null}

					{duplicates > 0 ? (
						<Callout tone="attention" title={t("importing.duplicatesTitle", { count: duplicates })}>
							{t("importing.duplicatesBody")}
						</Callout>
					) : null}

					{read.records.length === 0 ? (
						<EmptyState
							title={t("importing.emptyTitle")}
							description={
								read.skipped[0]?.reason === "unreadable"
									? t("importing.unreadable")
									: t("importing.emptyBody")
							}
						/>
					) : (
						<Table caption={t("importing.caption")}>
							<TableHead>
								<TableRow>
									<TableHeader className="w-10">{t("importing.keep")}</TableHeader>
									<TableHeader>{t("table.date")}</TableHeader>
									<TableHeader>{t("table.description")}</TableHeader>
									<TableHeader numeric={true}>{t("table.amount")}</TableHeader>
									{/* On a phone this column would take a quarter of the width to say
									    nothing on most rows, so there it sits under the description. */}
									<TableHeader className="hidden sm:table-cell">
										{t("importing.already")}
									</TableHeader>
								</TableRow>
							</TableHead>
							<TableBody>
								{marked.map((record, index) => {
									const certain = record.certain && record.duplicateOf !== null;
									const off = certain || left.has(index);
									return (
										<TableRow key={`${record.line}:${record.externalId ?? index}`}>
											<TableCell>
												<input
													type="checkbox"
													checked={!off}
													disabled={certain}
													onChange={() => toggle(index)}
													aria-label={t("importing.keepRow", { description: record.description })}
													className="size-4 accent-ink"
												/>
											</TableCell>
											<TableCell className="whitespace-nowrap font-mono text-xs">
												{record.happenedOn}
											</TableCell>
											<TableCell>
												{record.description}
												{record.duplicateOf === null ? null : (
													<span className="block text-xs text-graphite sm:hidden">
														{certain ? t("importing.sameEntry") : t("importing.looksTheSame")}
													</span>
												)}
											</TableCell>
											<TableCell numeric={true}>
												<Value
													amount={record.amount}
													currency={chosen?.currency ?? "BRL"}
													tone={record.amount < 0 ? "negative" : "positive"}
												/>
											</TableCell>
											<TableCell className="hidden whitespace-nowrap text-xs text-graphite sm:table-cell">
												{record.duplicateOf === null
													? ""
													: certain
														? t("importing.sameEntry")
														: t("importing.looksTheSame")}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}

					{read.skipped.length > 0 && read.skipped[0]?.reason !== "unreadable" ? (
						<details className="text-sm text-graphite">
							<summary className="cursor-pointer">
								{t("importing.skippedTitle", { count: read.skipped.length })}
							</summary>
							<ul className="mt-2 space-y-1 font-mono text-xs">
								{read.skipped.slice(0, 20).map((row) => (
									<li key={row.line}>
										{t("importing.line", { line: row.line })} {t(`importing.reason.${row.reason}`)}{" "}
										{row.values.join(" ")}
									</li>
								))}
							</ul>
						</details>
					) : null}

					{problem ? <Callout tone="problem">{problem}</Callout> : null}

					<div className="flex flex-wrap items-center gap-3">
						<Button
							variant="primary"
							icon={<Icon name="plus" />}
							disabled={keeping.length === 0 || !chosen || save.isPending}
							onClick={() => save.mutate()}
						>
							{keeping.length === 0
								? t("importing.nothingToWrite")
								: t("importing.write", { count: keeping.length })}
						</Button>
						<Button variant="quiet" onClick={() => setPicked(null)}>
							{t("actions.cancel")}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
