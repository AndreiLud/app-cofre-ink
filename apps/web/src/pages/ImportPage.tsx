// Reading a file from the bank into a space.
//
// Nothing is written until the person presses the button at the end. Everything before
// it is showing them what the file says: which column is which, what will be written,
// and what looks like something already here. An import that decides on its own is how
// somebody ends up with two of every purchase in a month and no way to tell which.

import {
	addMonthsToMonth,
	type CardCycle,
	invoiceMonthForDue,
	invoiceMonthOf,
	monthOf,
	pickRule,
	todayIn,
} from "@cofre/core";
import type {
	AccountGuess,
	DraftRecord,
	FieldName,
	InvoiceConvention,
	MarkedRecord,
	Nature,
	RecognisedDocument,
	SignMeaning,
} from "@cofre/importers";
import { guessAccount, markDuplicates, readFile, shapeOf } from "@cofre/importers";
import type { Account, ImportedRecord } from "@cofre/storage";
import {
	Button,
	Callout,
	EmptyState,
	Icon,
	SectionTitle,
	Segmented,
	Select,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ChangeEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { readPickedFile } from "../lib/download.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions, type Way, waysToPay } from "../lib/wayLabel.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import {
	documentKey,
	recallColumns,
	recallSign,
	recallWay,
	rememberColumns,
	rememberSign,
	rememberWay,
} from "../storage/importMemory.ts";
import { useWhatIMayDo } from "../storage/roles.ts";

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

/** What a line can be said to be, in the order the list offers them. */
const NATURES: Nature[] = ["purchase", "fee", "credit", "installment", "payment", "cardPayment"];

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
	const { t, i18n } = useTranslation();
	const { amountsHidden } = useCofre();
	// Inside a sentence, where the component that draws an amount cannot go.
	const asMoney = (cents: number) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency: document.currency,
		}).format(cents / 100);

	const facts = [
		document.institution,
		document.period
			? t("importing.between", { from: document.period.from, to: document.period.to })
			: null,
		document.dueOn ? t("importing.dueOn", { day: document.dueOn }) : null,
	].filter((fact): fact is string => fact !== null);

	const check = document.check;
	return (
		<>
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
				{check?.matches ? (
					<p>{check.flipped ? t("importing.checkFlipped") : t("importing.checkMatches")}</p>
				) : null}
			</Callout>
			{/* The lines do not come to what the document says: by how much, so somebody can look
			    for the sign the wrong way round or the line left out. */}
			{check && !check.matches ? (
				<Callout tone="attention" title={t("importing.checkDiffersTitle")}>
					{t(check.difference > 0 ? "importing.checkOver" : "importing.checkUnder", {
						amount: amountsHidden ? "R$ •••" : asMoney(Math.abs(check.difference)),
					})}{" "}
					{t("importing.checkDiffersBody")}
				</Callout>
			) : null}
		</>
	);
}

export function ImportPage() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const [picked, setPicked] = useState<Picked | null>(null);
	const [fields, setFields] = useState<FieldName[] | null>(null);
	const [sign, setSign] = useState<SignMeaning | null>(null);
	/** What the person said a document is, when the reader got it wrong. */
	const [documentKind, setDocumentKind] = useState<"statement" | "invoice" | null>(null);
	/** How the person said an invoice in a PDF writes a purchase, after turning it round. */
	const [convention, setConvention] = useState<InvoiceConvention | null>(null);
	/** Every sign of a file with no convention, turned round. */
	const [flipped, setFlipped] = useState(false);
	/** Lines the person turned round, by their place in the file: money out or money in. */
	const [turned, setTurned] = useState<Map<number, 1 | -1>>(new Map());
	/** What the person said a line is, when the reader got it wrong. */
	const [natures, setNatures] = useState<Map<number, Nature>>(new Map());
	/** The card the person said a line is on, when an invoice has more than one. */
	const [lineCards, setLineCards] = useState<Map<number, string>>(new Map());
	/** Lines with a loose "2/10" the person said are a part of a plan. */
	const [asParts, setAsParts] = useState<Set<number>>(new Set());
	/** The way the person chose, as the value of its line in the list, or nothing yet. */
	const [wayChosen, setWayChosen] = useState<string | null>(null);
	/** The invoice the person said the file is, when the one worked out was not it. */
	const [monthChosen, setMonthChosen] = useState<string | null>(null);
	/** The card and the invoice, when the import was opened from the invoices of a card. */
	const asked = useSearch({ from: ROUTES.import });
	const [left, setLeft] = useState<Set<number>>(new Set());
	const [problem, setProblem] = useState<string | null>(null);
	const [written, setWritten] = useState<number | null>(null);

	/**
	 * This screen is nothing but writing records, so a role that writes none of them has
	 * no reason to be walked through it. It used to read the file, guess the account, map
	 * the columns and mark the repeats, and only refuse at the end, throwing the whole of
	 * that work away.
	 */
	const { mayCall, ready, role } = useWhatIMayDo(spaceId);
	const mayWrite = mayCall("transactions.create");

	const accounts = useQuery({
		queryKey: ["accounts", spaceId, "open"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});

	// A statement names a card by its four digits, so the cards are part of working out
	// which account a file is about.
	const cards = useQuery({
		queryKey: ["cards", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.cards.list(spaceId) ?? [],
	});

	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");

	// Reading the file again with a corrected mapping is cheap and keeps one path:
	// whatever is on screen is exactly what the reader produced. The correction can
	// come from this screen or from the last time a file of this shape was read.
	const read = useMemo(() => {
		if (!picked) return null;
		const said = {
			...(documentKind === null ? {} : { kind: documentKind }),
			...(convention === null ? {} : { convention }),
		};
		const first = readFile(picked.bytes, { fileName: picked.name, today, ...said });
		if (!first.mapping) return first;

		const shape = shapeOf(first.header);
		const corrected = fields ?? recallColumns(spaceId, shape);
		// The file beats what was remembered: a sign remembered for the shape is used only when
		// the file could not say, which is a file with no negative number and too few lines. An
		// invoice whose payment and refund are negative was read as all purchases because the
		// last file of that shape had none.
		const fileSays =
			first.mapping.positiveMeans !== "asWritten" ||
			first.records.some((record) => record.amount < 0);
		const chosenSign = sign ?? (fileSays ? null : recallSign(spaceId, shape));
		if (!corrected && !chosenSign) return first;

		return readFile(picked.bytes, {
			fileName: picked.name,
			today,
			...said,
			mapping: {
				...first.mapping,
				fields: corrected ?? first.mapping.fields,
				positiveMeans: chosenSign ?? first.mapping.positiveMeans,
			},
		});
	}, [picked, fields, sign, today, spaceId, documentKind, convention]);

	const usable = (accounts.data ?? []).filter((account) => account.archivedAt === null);

	// What each card still owes, so a card put away with a debt is still offered an invoice.
	const standing = useQuery({
		queryKey: ["invoices", "standing", spaceId, today],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.invoices.standing(spaceId, today) ?? [],
	});
	const owingPutAway = useMemo(
		() =>
			(standing.data ?? [])
				.filter(
					(card) =>
						card.account.archivedAt !== null &&
						(card.owing.length > 0 || card.open.left > 0 || card.later > 0),
				)
				.map((card) => card.account),
		[standing.data],
	);

	/** Whether the file is a card invoice, whatever its format. */
	const isInvoice = read?.kind === "invoice";

	/**
	 * Where the file can go. An invoice goes on a card: each plastic by its credit side, a credit
	 * account with no plastic, and one put away that still owes, the cards of one account
	 * together. It was every account, and with no guess it opened on the first of them, so an
	 * invoice landed on a current account nobody chose.
	 */
	const ways = useMemo<Way[]>(() => {
		if (!isInvoice) {
			return accountOptions(usable, t).map((option) => ({
				...option,
				value: `:${option.value}`,
				cardId: null,
				accountId: option.value,
			}));
		}
		const credit = new Set(
			usable.filter((account) => account.kind === "credit").map((account) => account.id),
		);
		const open = waysToPay(cards.data ?? [], usable, t).filter((way) => credit.has(way.accountId));
		const putAway = owingPutAway.map((account) => ({
			value: `:${account.id}`,
			label: t("ways.archived", { name: account.name }),
			group: t("ways.cards"),
			cardId: null,
			accountId: account.id,
		}));
		const order = new Map(
			[...usable, ...owingPutAway].map((account, index) => [account.id, index] as const),
		);
		return [...open, ...putAway].sort(
			(left, right) => (order.get(left.accountId) ?? 0) - (order.get(right.accountId) ?? 0),
		);
	}, [isInvoice, usable, cards.data, owingPutAway, t]);

	const reachable: Account[] = useMemo(() => [...usable, ...owingPutAway], [usable, owingPutAway]);

	/** What a document is remembered by: its bank, its kind and the digits of its cards. */
	const memoryKey = useMemo(() => {
		if (!read) return "";
		if (read.mapping) return shapeOf(read.header);
		return documentKey(
			read.document?.institution ?? null,
			read.document?.kind ?? null,
			read.document?.cards ?? [],
		);
	}, [read]);

	/**
	 * What the file says about where it belongs, before anybody is asked.
	 *
	 * The digits of a card first: they name one plastic. What was remembered after them, because
	 * the memory of the bank sent the invoice of a second card of that bank to the first one.
	 */
	const guessed = useMemo<AccountGuess | null>(() => {
		if (!read || reachable.length === 0) return null;

		const worked = guessAccount(
			{
				institution: read.document?.institution ?? null,
				accountHint: read.accountHint,
				kind: isInvoice ? "invoice" : (read.document?.kind ?? null),
			},
			(isInvoice ? reachable.filter((account) => account.kind === "credit") : usable).map(
				(account) => ({
					id: account.id,
					name: account.name,
					kind: account.kind,
					institution: account.institution,
				}),
			),
			(cards.data ?? []).map((card) => ({
				id: card.id,
				name: card.name,
				lastFour: card.lastFour,
				creditAccountId: card.creditAccountId,
				debitAccountId: card.debitAccountId,
			})),
		);
		if (worked && (worked.why === "cardDigits" || worked.why === "digits")) return worked;

		const remembered = recallWay(spaceId, memoryKey);
		if (remembered && ways.some((way) => way.accountId === remembered.accountId)) {
			return {
				id: remembered.accountId,
				why: "remembered" as const,
				...(remembered.cardId ? { cardId: remembered.cardId } : {}),
			};
		}
		return worked;
	}, [read, reachable, usable, spaceId, cards.data, memoryKey, ways, isInvoice]);

	/** The way of an account, the plastic named when there is one. */
	const wayOf = (accountId: string | undefined, cardId?: string | null): Way | null => {
		if (!accountId) return null;
		return (
			ways.find((way) => way.accountId === accountId && cardId && way.cardId === cardId) ??
			ways.find((way) => way.accountId === accountId) ??
			null
		);
	};

	/**
	 * The way the file goes, which may be none yet: an invoice with two cards or more to choose
	 * from and nothing in the file to choose by waits for the person.
	 */
	const chosenWay: Way | null =
		wayChosen !== null
			? (ways.find((way) => way.value === wayChosen) ?? null)
			: (wayOf(asked.cartao) ??
				wayOf(guessed?.id, guessed?.cardId) ??
				(isInvoice ? (ways.length === 1 ? (ways[0] ?? null) : null) : (ways[0] ?? null)));
	const chosen = reachable.find((account) => account.id === chosenWay?.accountId);

	/** Digits the file names that belong to a card put away with nothing owed. */
	const putAwayCard = useMemo(() => {
		const named = read?.document?.cards ?? [];
		return (
			(cards.data ?? []).find(
				(card) =>
					card.archivedAt !== null &&
					card.lastFour !== null &&
					named.includes(card.lastFour) &&
					!ways.some((way) => way.accountId === card.creditAccountId),
			) ?? null
		);
	}, [read, cards.data, ways]);

	const cycle: CardCycle | null =
		chosen?.kind === "credit" && chosen.closingDay !== null && chosen.dueDay !== null
			? { closingDay: chosen.closingDay, dueDay: chosen.dueDay }
			: null;

	/**
	 * Which invoice the file is: the one whose due date is nearest the one printed, or the one
	 * the newest line falls on. The person can take the one before or after.
	 */
	const documentMonth = useMemo(() => {
		if (!read || !isInvoice) return null;
		if (asked.mes) return asked.mes;
		const due = read.document?.dueOn ?? null;
		if (due) return invoiceMonthForDue(due, cycle);
		const newest = read.records
			.map((record) => record.happenedOn)
			.sort()
			.at(-1);
		if (!newest) return null;
		return cycle ? invoiceMonthOf(newest, cycle) : monthOf(newest);
	}, [read, isInvoice, asked.mes, cycle]);
	const invoiceMonth = monthChosen ?? documentMonth;
	const monthName = (month: string) =>
		new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			month: "long",
			year: "numeric",
			timeZone: "UTC",
		}).format(new Date(`${month}-01T00:00:00Z`));
	const monthOptions = documentMonth
		? [...new Set([-1, 0, 1].map((offset) => addMonthsToMonth(documentMonth, offset)))]
				.concat(invoiceMonth && !documentMonth ? [invoiceMonth] : [])
				.map((month) => ({ value: month, label: monthName(month) }))
		: [];

	// The invoices of the card, to say when the month is one the card was written down owing.
	const cardInvoices = useQuery({
		queryKey: ["invoices", "list", chosen?.id, today],
		enabled: Boolean(session && isInvoice && chosen?.kind === "credit" && cycle !== null),
		queryFn: () => (chosen ? (session?.invoices.list(chosen.id, today) ?? []) : []),
	});
	/** The last invoice the debt the card was written down with sits on. */
	const openingMonth =
		(cardInvoices.data ?? []).filter((state) => state.opening > 0).at(-1)?.month ?? null;
	const inTheOpening =
		invoiceMonth !== null && openingMonth !== null && invoiceMonth <= openingMonth;

	// The record a card was written down with for the invoice it had open, or closed, on that
	// day: the invoice in the file details it, and both would count it twice.
	const onThatInvoice = useQuery({
		queryKey: ["transactions", spaceId, "importReplaces", chosen?.id, invoiceMonth],
		enabled: Boolean(session && isInvoice && chosen && invoiceMonth),
		queryFn: () =>
			chosen && invoiceMonth
				? (session?.transactions.list({ spaceId, accountId: chosen.id, invoiceMonth }) ?? [])
				: [],
	});
	const writtenDown = useMemo(() => {
		const names = new Set(
			["pt", "en"].flatMap((language) => {
				const said = i18n.getFixedT(language);
				return [said("accounts.invoiceSoFarRecord"), said("accounts.closedSoFarRecord")];
			}),
		);
		return (onThatInvoice.data ?? []).filter((record) => names.has(record.description));
	}, [onThatInvoice.data, i18n]);
	/** Whether the person kept the offer to take that record out, which starts taken. */
	const [keepWrittenDown, setKeepWrittenDown] = useState(false);

	/**
	 * The plastic of a line: the card whose digits head the part of the invoice it is under,
	 * when that card is on the account the file goes to.
	 */
	const cardOfLine = (record: DraftRecord): string | null => {
		if (!record.cardDigits || !chosen) return null;
		return (
			(cards.data ?? []).find(
				(card) =>
					card.lastFour === record.cardDigits &&
					(card.creditAccountId === chosen.id || card.debitAccountId === chosen.id),
			)?.id ?? null
		);
	};

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

	/**
	 * The lines as the person left them: every sign turned round, a line turned round on its
	 * own, and what a line is when the person said otherwise. A PDF had no way to say any of it.
	 */
	const lines: DraftRecord[] = useMemo(
		() =>
			(read?.records ?? []).map((record, index) => {
				const written = Math.sign(record.amount) as 1 | -1;
				const direction = turned.get(index) ?? (flipped ? (-written as 1 | -1) : written);
				return {
					...record,
					amount: direction * Math.abs(record.amount),
					nature: natures.get(index) ?? record.nature,
				};
			}),
		[read, turned, flipped, natures],
	);

	const marked: MarkedRecord[] = useMemo(
		() => markDuplicates(lines, existing.data ?? []),
		[lines, existing.data],
	);

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

	/** The lines that will be written, with their place in the file. */
	const kept = marked
		.map((record, index) => ({ record, index }))
		.filter(
			({ record, index }) => !left.has(index) && !(record.certain && record.duplicateOf !== null),
		);
	const keeping = kept.map(({ record }) => record);

	/** Whether the invoice lists more than one card, so each line says which. */
	const severalCards = (read?.document?.cards.length ?? 0) > 1;
	/** The cards a line of this account can be on. */
	const cardsHere = (cards.data ?? []).filter(
		(card) => chosen && (card.creditAccountId === chosen.id || card.debitAccountId === chosen.id),
	);

	/** Turns every sign round: the convention of an invoice in a PDF, or the lines of any other. */
	function invertAll() {
		if (read?.document?.kind === "invoice") {
			setConvention(
				(read.document.convention ?? "chargesPositive") === "chargesPositive"
					? "chargesNegative"
					: "chargesPositive",
			);
		} else {
			setFlipped((current) => !current);
		}
		setTurned(new Map());
	}

	/** The months of a plan a line starts, from its invoice, for the line to say. */
	const planSaid = (record: DraftRecord): string | null => {
		const mark = record.installment;
		if (!mark) return null;
		const start = invoiceMonth ?? monthOf(record.happenedOn);
		const name = (month: string) =>
			new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
				month: "long",
				timeZone: "UTC",
			}).format(new Date(`${month}-01T00:00:00Z`));
		return t("importing.newPlan", {
			from: mark.number,
			to: mark.count,
			first: name(start),
			last: name(addMonthsToMonth(start, mark.count - mark.number)),
		});
	};

	async function pick(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		setProblem(null);
		setWritten(null);
		setLeft(new Set());
		setFields(null);
		setDocumentKind(null);
		setWayChosen(null);
		setMonthChosen(null);
		setConvention(null);
		setFlipped(false);
		setTurned(new Map());
		setNatures(new Map());
		setLineCards(new Map());
		setAsParts(new Set());
		setKeepWrittenDown(false);

		try {
			setPicked({ name: file.name, bytes: await readPickedFile(file) });
		} catch (error) {
			setPicked(null);
			// Through the one translator, like every other failure on this screen. A file
			// the browser cannot read rejects with its own sentence, written by the
			// browser, in English, and it went straight onto a Portuguese screen.
			setProblem(sayWhy(error, t));
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
			const records: ImportedRecord[] = kept.map(({ record, index }) => {
				const card = lineCards.get(index) ?? cardOfLine(record);
				return {
					happenedOn: record.happenedOn,
					amount: record.amount,
					description: record.description,
					notes: record.notes,
					externalId: record.externalId,
					nature: record.nature,
					...(card ? { cardId: card } : {}),
				};
			});
			// The plastic of the way chosen, or the one the file itself named while the account
			// it named is still the one being written into.
			const cardId =
				chosenWay?.cardId ??
				(guessed?.cardId !== undefined && guessed.id === chosen.id ? guessed.cardId : null);
			return session.imports.create({
				spaceId,
				accountId: chosen.id,
				cardId,
				records,
				...(isInvoice && invoiceMonth ? { invoiceMonth } : {}),
				...(isInvoice && !keepWrittenDown && writtenDown.length > 0
					? { removes: writtenDown.map((record) => record.id) }
					: {}),
			});
		},
		onSuccess: (result) => {
			// What this import took to get right is what the next one starts from.
			if (read && chosen) {
				const shape = shapeOf(read.header);
				rememberWay(spaceId, memoryKey, {
					accountId: chosen.id,
					cardId: chosenWay?.cardId ?? null,
				});
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
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	const duplicates = marked.filter((record) => record.duplicateOf !== null).length;
	const unsure = marked.filter((record) => record.confidence < SURE_ENOUGH).length;

	if (!mayWrite) {
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

				{/* Not while the member list is still being read: a sentence saying the screen
				    is closed, shown for a moment and then taken back, is worse than waiting. */}
				{ready && role !== null ? (
					<Callout tone="attention" title={t("roles.youAre", { role: t(`role.${role}`) })}>
						{t("importing.cannotWriteBody")}
					</Callout>
				) : (
					<Skeleton lines={3} />
				)}
			</div>
		);
	}

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

			<p className="max-w-[60ch] text-sm text-quiet">{t("importing.explain")}</p>

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

			<div className="space-y-3 border-y border-line py-4">
				<label htmlFor="statementFile" className="block text-sm font-medium text-ink">
					{t("importing.pick")}
				</label>
				<input
					id="statementFile"
					type="file"
					accept=".csv,.txt,.ofx,.qfx,.qif,.xlsx,.json,.pdf"
					onChange={(event) => void pick(event)}
					className="block w-full max-w-md text-sm text-ink file:mr-3 file:rounded-sm file:border file:border-lineStrong file:bg-sunken file:px-3 file:py-2 file:text-sm file:text-ink"
				/>
				<p className="text-xs text-quiet">{t("importing.pickHint")}</p>
				{/* Beside the field the file was chosen with. A file too large or one the
				    browser cannot read clears what was read, and the only callout on this
				    screen sat inside the block that only exists once a file has been read, so
				    the refusal was drawn nowhere at all. */}
				{read === null && problem ? <Callout tone="problem">{problem}</Callout> : null}
			</div>

			{usable.length === 0 && accounts.isFetched ? (
				<Callout tone="attention" title={t("importing.noAccountTitle")}>
					{t("importing.noAccountBody")}
				</Callout>
			) : null}

			{read === null ? null : (
				<div className="space-y-5">
					{read.document ? <WhatItIs document={read.document} /> : null}
					{/* The file names a card that was put away with nothing owed: nothing is offered
					    for it, and the way back is where the cards are. */}
					{putAwayCard ? (
						<Callout
							tone="attention"
							title={t("importing.putAwayTitle", { digits: putAwayCard.lastFour ?? "" })}
							action={
								<Button
									size="small"
									variant="secondary"
									onClick={() => void navigate({ to: ROUTES.accounts })}
								>
									{t("importing.toAccounts")}
								</Button>
							}
						>
							{t("importing.putAwayBody", { name: putAwayCard.name })}
						</Callout>
					) : null}
					{/* The reader decides from the words at the top of the page, and the person
					    can say otherwise: a statement and an invoice are read differently. */}
					{read.document && read.document.kind !== "receipt" ? (
						<div className="max-w-md">
							<Segmented
								label={t("importing.documentIs")}
								value={read.document.kind === "invoice" ? "invoice" : "statement"}
								onChange={(value) => setDocumentKind(value)}
								options={[
									{ value: "statement", label: t("importing.isStatement") },
									{ value: "invoice", label: t("importing.isInvoice") },
								]}
							/>
						</div>
					) : null}

					<div className="flex flex-wrap items-end gap-4">
						<div className="min-w-[14rem] grow sm:grow-0">
							<Select
								label={isInvoice ? t("importing.card") : t("importing.account")}
								value={chosenWay?.value ?? ""}
								onChange={(event) => setWayChosen(event.target.value)}
								options={[
									...(chosenWay === null
										? [
												{
													value: "",
													label: isInvoice ? t("importing.pickCard") : t("importing.pickAccount"),
												},
											]
										: []),
									...ways.map(({ value, label, group }) => ({ value, label, group })),
								]}
								hint={
									chosenWay === null
										? t("importing.waitsForCard")
										: guessed && chosen?.id === guessed.id && wayChosen === null
											? t(`importing.chose.${guessed.why}`)
											: t("importing.accountHint")
								}
							/>
						</div>
						{/* Which invoice of the card this is. The one whose due date is nearest the
						    one printed, and the ones on either side, for a bank that says otherwise. */}
						{isInvoice && invoiceMonth ? (
							<div className="min-w-[12rem] grow sm:grow-0">
								<Select
									label={t("importing.invoiceOf")}
									value={invoiceMonth}
									onChange={(event) => setMonthChosen(event.target.value)}
									options={monthOptions}
									hint={t("importing.invoiceOfHint")}
								/>
							</div>
						) : null}
						<p className="text-sm text-quiet">
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
							<p className="max-w-[60ch] text-sm text-quiet">{t("importing.columnsHint")}</p>
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
											{ value: "chargesPositive", label: t("importing.signChargesPositive") },
											{ value: "asWritten", label: t("importing.signAsWritten") },
										]}
									/>
									<p className="pt-1 text-xs text-quiet">
										{read.mapping.positiveMeans === "expense"
											? t("importing.signGuessedExpense")
											: read.mapping.positiveMeans === "chargesPositive"
												? t("importing.signGuessedChargesPositive")
												: t("importing.signHint")}
									</p>
								</div>
							) : null}
						</section>
					) : null}

					{/* A month the card was written down owing: its purchases are in that debt. */}
					{isInvoice && inTheOpening && openingMonth ? (
						<Callout tone="attention" title={t("importing.inTheOpeningTitle")}>
							{t("importing.inTheOpeningBody", { month: monthName(openingMonth) })}
						</Callout>
					) : null}
					{/* The one record the card was written down with for this invoice, which the file
					    details line by line. */}
					{isInvoice && writtenDown.length > 0 ? (
						<label className="flex max-w-[60ch] items-start gap-2 text-sm text-ink">
							<input
								type="checkbox"
								checked={!keepWrittenDown}
								onChange={() => setKeepWrittenDown((current) => !current)}
								className="mt-1 size-4 accent-[var(--ink)]"
							/>
							<span>
								{t("importing.replacesWrittenDown", {
									description: writtenDown[0]?.description ?? "",
									amount: new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
										style: "currency",
										currency: chosen?.currency ?? "BRL",
									}).format(
										Math.abs(writtenDown.reduce((sum, record) => sum + record.amount, 0)) / 100,
									),
								})}
							</span>
						</label>
					) : null}

					{read.records.length > 0 ? (
						<div>
							<Button size="small" variant="secondary" onClick={invertAll}>
								{t("importing.invertAll")}
							</Button>
						</div>
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
									<TableHeader>{t("importing.howToWrite")}</TableHeader>
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
													className="size-4 accent-[var(--ink)]"
												/>
											</TableCell>
											<TableCell className="whitespace-nowrap font-mono text-xs">
												{record.happenedOn}
											</TableCell>
											<TableCell>
												{record.description}
												{sortedInto[index] ? (
													<span className="block text-xs text-quiet sm:hidden">
														{sortedInto[index]}
													</span>
												) : null}
												{record.duplicateOf === null ? null : (
													<span className="block text-xs text-quiet sm:hidden">
														{certain ? t("importing.sameEntry") : t("importing.looksTheSame")}
													</span>
												)}
												{/* What the reader was not sure about, beside the line it read,
												    which is the only way somebody can check it. */}
												{record.confidence < SURE_ENOUGH ? (
													<span className="block text-xs text-ochre">
														{t("importing.checkThisOne")}
														{record.source ? (
															<span className="block font-mono text-quiet">{record.source}</span>
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
											<TableCell>
												<span className="flex flex-wrap gap-2">
													{/* Money out or money in, line by line: a bank that writes a refund
												    the way it writes a purchase is corrected here. */}
													<select
														aria-label={t("importing.directionOf", {
															description: record.description,
														})}
														value={record.amount < 0 ? "out" : "in"}
														onChange={(event) =>
															setTurned((current) =>
																new Map(current).set(index, event.target.value === "out" ? -1 : 1),
															)
														}
														className="rounded-sm border border-line bg-sunken px-1 py-0.5 text-xs text-ink"
													>
														<option value="out">{t("transactionKind.expense")}</option>
														<option value="in">{t("transactionKind.income")}</option>
													</select>
													<select
														aria-label={t("importing.natureOf", {
															description: record.description,
														})}
														value={record.nature}
														onChange={(event) =>
															setNatures((current) =>
																new Map(current).set(index, event.target.value as Nature),
															)
														}
														className="rounded-sm border border-line bg-sunken px-1 py-0.5 text-xs text-ink"
													>
														{NATURES.map((nature) => (
															<option key={nature} value={nature}>
																{t(`importing.nature.${nature}`)}
															</option>
														))}
													</select>
													{severalCards && cardsHere.length > 1 ? (
														<select
															aria-label={t("importing.cardOf", {
																description: record.description,
															})}
															value={lineCards.get(index) ?? cardOfLine(record) ?? ""}
															onChange={(event) =>
																setLineCards((current) =>
																	new Map(current).set(index, event.target.value),
																)
															}
															className="rounded-sm border border-line bg-sunken px-1 py-0.5 text-xs text-ink"
														>
															<option value="">{t("importing.cardOfFile")}</option>
															{cardsHere.map((card) => (
																<option key={card.id} value={card.id}>
																	{card.lastFour ? `${card.name} ${card.lastFour}` : card.name}
																</option>
															))}
														</select>
													) : null}
												</span>
												{/* A part of a plan says what will be written. A loose "2/10" may be
												    the day printed again, so it is offered and not taken. */}
												{record.installment?.sure ? (
													<span className="block text-xs text-quiet">{planSaid(record)}</span>
												) : record.installment ? (
													<label className="flex items-center gap-2 text-xs text-quiet">
														<input
															type="checkbox"
															checked={asParts.has(index)}
															onChange={() =>
																setAsParts((current) => {
																	const next = new Set(current);
																	if (next.has(index)) next.delete(index);
																	else next.add(index);
																	return next;
																})
															}
															className="size-4 accent-[var(--ink)]"
														/>
														{t("importing.offerPart", {
															number: record.installment.number,
															count: record.installment.count,
														})}
													</label>
												) : null}
											</TableCell>
											<TableCell className="hidden text-xs text-quiet sm:table-cell">
												{sortedInto[index] ?? ""}
											</TableCell>
											<TableCell className="hidden whitespace-nowrap text-xs text-quiet sm:table-cell">
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
						<details className="text-sm text-quiet">
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
