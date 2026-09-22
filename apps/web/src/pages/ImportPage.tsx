// Reading a file from the bank into a space.
//
// Nothing is written until the person presses the button at the end. Everything before
// it is showing them what the file says: which column is which, what will be written,
// and what looks like something already here. An import that decides on its own is how
// somebody ends up with two of every purchase in a month and no way to tell which.

import { pickRule, todayIn } from "@cofre/core";
import type { FieldName, MarkedRecord, RecognisedDocument, SignMeaning } from "@cofre/importers";
import { guessAccount, markDuplicates, readFile, shapeOf } from "@cofre/importers";
import type { ImportedRecord } from "@cofre/storage";
import {
	Button,
	Callout,
	EmptyState,
	Icon,
	SectionTitle,
	Segmented,
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
import { FileTooLargeError, LARGEST_FILE, readPickedFile } from "../lib/download.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import {
	recallAccount,
	recallColumns,
	recallSign,
	rememberAccount,
	rememberColumns,
	rememberSign,
} from "../storage/importMemory.ts";

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

/** Under this, the screen asks the person to look at the record before saying yes. */
const SURE_ENOUGH = 0.67;

/**
 * What a recognised document turned out to be, said in one line.
 *
 * A file with columns needs no such line: it said what it was. A document had to be
 * understood, and what was understood about it as a whole is the first thing to check,
 * because a due date read as a purchase is visible here and nowhere else.
 */
function WhatItIs({ document }: { document: RecognisedDocument }) {
	const { t } = useTranslation();
	const { amountsHidden } = useCofre();

	const facts = [
		document.institution,
		document.period
			? t("importing.between", { from: document.period.from, to: document.period.to })
			: null,
		document.dueOn ? t("importing.dueOn", { day: document.dueOn }) : null,
	].filter((fact): fact is string => fact !== null);

	return (
		<Callout tone="neutral" title={t(`importing.kind.${document.kind}`)}>
			<p>
				{facts.join(" · ")}
				{document.total === null ? null : (
					<>
						{facts.length > 0 ? " · " : ""}
						{t("importing.saysTotal")}{" "}
						<span className={amountsHidden ? "blur-sm" : undefined}>
							<Value amount={document.total} tone="neutral" />
						</span>
					</>
				)}
			</p>
		</Callout>
	);
}

export function ImportPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const [picked, setPicked] = useState<Picked | null>(null);
	const [fields, setFields] = useState<FieldName[] | null>(null);
	const [sign, setSign] = useState<SignMeaning | null>(null);
	const [accountId, setAccountId] = useState("");
	const [left, setLeft] = useState<Set<number>>(new Set());
	const [problem, setProblem] = useState<string | null>(null);
	const [written, setWritten] = useState<number | null>(null);

	const accounts = useQuery({
		queryKey: ["accounts", spaceId, "open"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});

	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");

	// Reading the file again with a corrected mapping is cheap and keeps one path:
	// whatever is on screen is exactly what the reader produced. The correction can
	// come from this screen or from the last time a file of this shape was read.
	const read = useMemo(() => {
		if (!picked) return null;
		const first = readFile(picked.bytes, { fileName: picked.name, today });
		if (!first.mapping) return first;

		const shape = shapeOf(first.header);
		const corrected = fields ?? recallColumns(spaceId, shape);
		const chosenSign = sign ?? recallSign(spaceId, shape);
		if (!corrected && !chosenSign) return first;

		return readFile(picked.bytes, {
			fileName: picked.name,
			today,
			mapping: {
				...first.mapping,
				fields: corrected ?? first.mapping.fields,
				positiveMeans: chosenSign ?? first.mapping.positiveMeans,
			},
		});
	}, [picked, fields, sign, today, spaceId]);

	const usable = (accounts.data ?? []).filter((account) => account.archivedAt === null);

	/** What the file says about where it belongs, before anybody is asked. */
	const guessed = useMemo(() => {
		if (!read || usable.length === 0) return null;

		const shape = shapeOf(read.header);
		const bank = read.document?.institution ?? read.accountHint ?? "";
		const remembered =
			recallAccount(spaceId, shape) ?? (bank === "" ? null : recallAccount(spaceId, bank));
		if (remembered && usable.some((account) => account.id === remembered)) {
			return { id: remembered, why: "remembered" as const };
		}

		return guessAccount(
			{
				institution: read.document?.institution ?? null,
				accountHint: read.accountHint,
				kind: read.document?.kind ?? null,
			},
			usable.map((account) => ({
				id: account.id,
				name: account.name,
				kind: account.kind,
				institution: account.institution,
			})),
		);
	}, [read, usable, spaceId]);

	const chosen =
		usable.find((account) => account.id === accountId) ??
		usable.find((account) => account.id === guessed?.id) ??
		usable[0];

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

	// The rules of the space run at the moment of writing, so what they will do is
	// worked out here with the same function and shown before anything is written.
	const rules = useQuery({
		queryKey: ["rules", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.rules.list(spaceId) ?? [],
	});

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	const sortedInto = useMemo(() => {
		const usableRules = (rules.data ?? []).filter((rule) => rule.disabledAt === null);
		const names = new Map((categories.data ?? []).map((category) => [category.id, category.name]));

		return marked.map((record) => {
			if (usableRules.length === 0 || !chosen) return null;
			const found = pickRule(usableRules, {
				description: record.description,
				accountId: chosen.id,
				kind: record.amount < 0 ? "expense" : "income",
			});
			return found?.categoryId ? (names.get(found.categoryId) ?? null) : null;
		});
	}, [marked, rules.data, categories.data, chosen]);

	const willBeSorted = sortedInto.filter((name) => name !== null).length;

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

		try {
			setPicked({ name: file.name, bytes: await readPickedFile(file) });
		} catch (error) {
			setPicked(null);
			setProblem(
				error instanceof FileTooLargeError
					? t("data.tooLarge", { megabytes: Math.round(LARGEST_FILE / 1024 / 1024) })
					: error instanceof Error
						? error.message
						: String(error),
			);
		}
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
			// What this import took to get right is what the next one starts from.
			if (read && chosen) {
				const shape = shapeOf(read.header);
				rememberAccount(spaceId, shape, chosen.id);
				const bank = read.document?.institution ?? read.accountHint ?? "";
				if (bank !== "") rememberAccount(spaceId, bank, chosen.id);
				if (read.mapping) {
					rememberColumns(spaceId, shape, read.mapping.fields);
					rememberSign(spaceId, shape, read.mapping.positiveMeans);
				}
			}

			setWritten(result.written);
			setPicked(null);
			setFields(null);
			setSign(null);
			void queries.invalidateQueries();
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	const duplicates = marked.filter((record) => record.duplicateOf !== null).length;
	const unsure = marked.filter((record) => record.confidence < SURE_ENOUGH).length;

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
					accept=".csv,.txt,.ofx,.qfx,.qif,.xlsx,.json,.pdf"
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
					{read.document ? <WhatItIs document={read.document} /> : null}

					<div className="flex flex-wrap items-end gap-4">
						<div className="min-w-[14rem] grow sm:grow-0">
							<Select
								label={t("importing.account")}
								value={chosen?.id ?? ""}
								onChange={(event) => setAccountId(event.target.value)}
								options={usable.map((account) => ({ value: account.id, label: account.name }))}
								hint={
									guessed && chosen?.id === guessed.id
										? t(`importing.chose.${guessed.why}`)
										: t("importing.accountHint")
								}
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
							{willBeSorted > 0 ? ` ${t("importing.willSort", { count: willBeSorted })}` : ""}
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

							{/* A card invoice has no use for a sign: every line of it is a
							    purchase. Read as written it would turn a month of shopping
							    into a month of salaries, so the guess is shown and can be
							    turned round. */}
							{read.mapping.fields.includes("amount") ? (
								<div className="max-w-md pt-2">
									<Segmented
										label={t("importing.signTitle")}
										value={read.mapping.positiveMeans}
										onChange={setSign}
										options={[
											{ value: "expense", label: t("importing.signExpense") },
											{ value: "asWritten", label: t("importing.signAsWritten") },
										]}
									/>
									<p className="pt-1 text-xs text-graphite">
										{read.mapping.positiveMeans === "expense"
											? t("importing.signGuessedExpense")
											: t("importing.signHint")}
									</p>
								</div>
							) : null}
						</section>
					) : null}

					{duplicates > 0 ? (
						<Callout tone="attention" title={t("importing.duplicatesTitle", { count: duplicates })}>
							{t("importing.duplicatesBody")}
						</Callout>
					) : null}

					{unsure > 0 ? (
						<Callout tone="attention" title={t("importing.unsureTitle", { count: unsure })}>
							{t("importing.unsureBody")}
						</Callout>
					) : null}

					{/* Nothing to correct and nothing in doubt: say so, so the person presses
					    the button instead of reading every line looking for a catch. */}
					{unsure === 0 && duplicates === 0 && read.records.length > 0 && chosen ? (
						<Callout tone="neutral">
							{t("importing.allClear", { count: keeping.length, account: chosen.name })}
						</Callout>
					) : null}

					{read.records.length === 0 ? (
						<EmptyState
							title={t("importing.emptyTitle")}
							description={t(
								`importing.${
									read.skipped[0]?.reason === "unreadable"
										? "unreadable"
										: read.skipped[0]?.reason === "noText"
											? "noText"
											: "emptyBody"
								}`,
							)}
						/>
					) : (
						<Table caption={t("importing.caption")}>
							<TableHead>
								<TableRow>
									<TableHeader className="w-10">{t("importing.keep")}</TableHeader>
									<TableHeader>{t("table.date")}</TableHeader>
									<TableHeader>{t("table.description")}</TableHeader>
									<TableHeader numeric={true}>{t("table.amount")}</TableHeader>
									{/* These two columns would take half the width of a phone to say
									    nothing on most rows, so there they sit under the description. */}
									<TableHeader className="hidden sm:table-cell">{t("table.category")}</TableHeader>
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
												{sortedInto[index] ? (
													<span className="block text-xs text-graphite sm:hidden">
														{sortedInto[index]}
													</span>
												) : null}
												{record.duplicateOf === null ? null : (
													<span className="block text-xs text-graphite sm:hidden">
														{certain ? t("importing.sameEntry") : t("importing.looksTheSame")}
													</span>
												)}
												{/* What the reader was not sure about, beside the line it read,
												    which is the only way somebody can check it. */}
												{record.confidence < SURE_ENOUGH ? (
													<span className="block text-xs text-ochre">
														{t("importing.checkThisOne")}
														{record.source ? (
															<span className="block font-mono text-graphite">{record.source}</span>
														) : null}
													</span>
												) : null}
											</TableCell>
											<TableCell numeric={true}>
												<Value
													amount={record.amount}
													currency={chosen?.currency ?? "BRL"}
													tone={record.amount < 0 ? "negative" : "positive"}
												/>
											</TableCell>
											<TableCell className="hidden text-xs text-graphite sm:table-cell">
												{sortedInto[index] ?? ""}
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

					{read.skipped.length > 0 &&
					read.skipped[0]?.reason !== "unreadable" &&
					read.skipped[0]?.reason !== "noText" ? (
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
