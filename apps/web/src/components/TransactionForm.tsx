// Writing down what happened.
//
// The three kinds are on screen at once rather than behind a menu, because choosing
// between them is the decision, not a detail of it. Everything else on the form
// changes with that choice: a transfer needs a destination, a card purchase can be
// split, and neither makes sense for the other.

import {
	type CalendarDate,
	type CurrencyCode,
	compareCalendarDates,
	invoiceDueDate,
	invoiceMonthOf,
} from "@cofre/core";
import type {
	Account,
	Category,
	SpendingPriority,
	Transaction,
	TransactionKind,
} from "@cofre/storage";
import { RuleError } from "@cofre/storage";
import { Button, Callout, Dialog, Disclosure, Field, Segmented, Select } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fillAmount, readAmount } from "../lib/amounts.ts";
import { lastWayUsed, rememberWayUsed } from "../lib/lastWay.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { useCofre } from "../storage/CofreProvider.tsx";

export type TransactionFormProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	accounts: Account[];
	spaceId: string;
	/** Given when an existing record is being changed instead of written. */
	editing?: Transaction | null;
	/** The day the form opens on, which is today where the space lives. */
	today: string;
};

export function TransactionForm({
	open,
	onOpenChange,
	accounts,
	spaceId,
	editing,
	today,
}: TransactionFormProps) {
	const { t, i18n } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

	const [kind, setKind] = useState<TransactionKind>("expense");
	const [amount, setAmount] = useState("");
	const [happenedOn, setHappenedOn] = useState(today);
	const [description, setDescription] = useState("");
	const [accountId, setAccountId] = useState("");
	const [counterAccountId, setCounterAccountId] = useState("");
	const [installments, setInstallments] = useState("1");
	const [notes, setNotes] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [priority, setPriority] = useState("");
	const [way, setWay] = useState("");
	/**
	 * How far a correction to one part of a purchase reaches.
	 *
	 * This part, or this part and the ones after it. Never the ones behind: what already
	 * happened happened under the name and at the price it happened at, and rewriting it
	 * would change a month somebody has already read.
	 */
	const [reach, setReach] = useState<"this" | "onwards">("this");
	const [problem, setProblem] = useState<string | null>(null);

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	const cards = useQuery({
		queryKey: ["cards", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.cards.list(spaceId) ?? [],
	});

	const usable = useMemo(
		() => accounts.filter((account) => account.archivedAt === null),
		[accounts],
	);
	const chosen = usable.find((account) => account.id === accountId);
	const canSplit = kind === "expense" && chosen?.kind === "credit";

	/**
	 * One entry per way to pay rather than one per card, because that is the choice
	 * somebody actually makes at the till. A cartao multiplo appears twice, as credit
	 * and as debit, and picking one of the two is what decides whether the purchase
	 * lands on the invoice or leaves the balance today.
	 */
	const byCard = useMemo(
		() =>
			(cards.data ?? []).flatMap((card) => {
				const both = card.creditAccountId !== null && card.debitAccountId !== null;
				const entries: {
					value: string;
					label: string;
					cardId: string | null;
					accountId: string;
				}[] = [];
				if (card.creditAccountId) {
					entries.push({
						value: `${card.id}:${card.creditAccountId}`,
						label: both ? `${card.name} (${t("cardKind.credit")})` : card.name,
						cardId: card.id,
						accountId: card.creditAccountId,
					});
				}
				if (card.debitAccountId) {
					entries.push({
						value: `${card.id}:${card.debitAccountId}`,
						label: both ? `${card.name} (${t("cardKind.debit")})` : card.name,
						cardId: card.id,
						accountId: card.debitAccountId,
					});
				}
				return entries.filter((entry) => usable.some((account) => account.id === entry.accountId));
			}),
		[cards.data, usable, t],
	);

	/**
	 * Every way to pay, as one list.
	 *
	 * The card and the account were two fields that already behaved as one: picking the
	 * card set the account, and picking another account silently dropped the card. Two
	 * controls for one decision, and the decision at the till is not "which account" but
	 * "what did I pay with".
	 *
	 * A cartao multiplo appears twice, as credit and as debit, because that is two
	 * different answers: one lands on the invoice and the other leaves the balance today.
	 * A current account with a debit card on it appears a third time, on its own, because
	 * a Pix and a bank slip come out of it without any card being involved. A credit
	 * account and a benefit card appear only through their plastic, because there is no
	 * other way to spend from either.
	 */
	const ways = useMemo(
		() => [
			...byCard,
			...usable
				.filter((account) => account.kind !== "credit" && account.kind !== "voucher")
				.map((account) => ({
					value: `:${account.id}`,
					label: account.name,
					// Nothing, and not an empty string. The value of the option carries the two
					// halves with a colon between them, and reading the first half back gave a
					// card called "", which the server refused as an identifier that is too
					// short: writing a record on an account with no card failed on a server and
					// worked in a browser, because the repository reads an empty string as no
					// card and the route reads it as a wrong one.
					cardId: null,
					accountId: account.id,
				})),
		],
		[byCard, usable],
	);

	const chosenWay = ways.find((entry) => entry.value === way) ?? null;

	/**
	 * Which invoice this purchase lands on, said before it is written.
	 *
	 * The closing day is the only thing about a card that surprises people, and the
	 * surprise used to arrive three weeks later on the invoice screen.
	 */
	const landsOn = (() => {
		if (kind !== "expense" || !chosen || chosen.kind !== "credit") return null;
		if (chosen.closingDay === null || chosen.dueDay === null) return null;
		const cycle = { closingDay: chosen.closingDay, dueDay: chosen.dueDay };
		const month = invoiceMonthOf(happenedOn as CalendarDate, cycle);
		const due = invoiceDueDate(month, cycle);
		return t("transactions.landsOnInvoice", {
			month: new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
				month: "long",
				timeZone: "UTC",
			}).format(new Date(`${month}-01T00:00:00Z`)),
			day: `${due.slice(8)}/${due.slice(5, 7)}`,
		});
	})();

	/** Open the details by themselves when either of them already holds something. */
	const hasDetails = priority !== "" || notes.trim() !== "";

	/** Picking the way picks the account and the card together, which is the whole point. */
	function pickWay(value: string) {
		setWay(value);
		const found = ways.find((entry) => entry.value === value);
		if (found) setAccountId(found.accountId);
	}

	// Opening the form is what resets it, so a half typed record is never inherited.
	useEffect(() => {
		if (!open) return;
		setProblem(null);
		// This part alone, until somebody says otherwise. A correction is a correction to
		// the thing in front of them, and the wider answer is the one that has to be asked
		// for.
		setReach("this");
		if (editing) {
			setKind(editing.kind);
			setAmount(
				fillAmount(
					Math.abs(editing.amount),
					i18n.resolvedLanguage,
					editing.currency as CurrencyCode,
				),
			);
			setHappenedOn(editing.happenedOn);
			setDescription(editing.description);
			setAccountId(editing.accountId);
			setCounterAccountId(editing.counterAccountId ?? "");
			setNotes(editing.notes ?? "");
			setInstallments("1");
			setCategoryId(editing.categoryId ?? "");
			setPriority(editing.priority ?? "");
			// The way to pay carries the card and the account together, so a record with no
			// card on it still has one: the account on its own.
			setWay(
				editing.cardId === null
					? `:${editing.accountId}`
					: `${editing.cardId}:${editing.accountId}`,
			);
			return;
		}
		setKind("expense");
		setAmount("");
		setHappenedOn(today);
		setDescription("");
		setCounterAccountId("");
		setInstallments("1");
		setNotes("");
		setCategoryId("");
		setPriority("");
		// The last way somebody paid, on this device and in this space. A list sorted by
		// name put whichever account was called something early in the alphabet first,
		// which for most households is a pocket rather than the bank.
		const remembered = lastWayUsed(spaceId);
		const known = remembered !== null && ways.some((entry) => entry.value === remembered);
		const first = known ? remembered : (ways[0]?.value ?? "");
		setWay(first);
		setAccountId(ways.find((entry) => entry.value === first)?.accountId ?? usable[0]?.id ?? "");
	}, [open, editing, today, spaceId, ways, usable, i18n.resolvedLanguage]);

	const save = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");

			const parsed = { amount: readAmount(amount, chosen?.currency ?? "BRL") };
			if (parsed.amount <= 0) {
				throw new RuleError("amountIsPositiveInteger", "an amount has to be more than nothing");
			}

			// A transfer moves money between two accounts of the same person, so it is
			// not spending and never carries a category.
			const sorting = {
				categoryId: kind === "transfer" || categoryId === "" ? null : categoryId,
				priority: priority === "" ? null : (priority as SpendingPriority),
				// A transfer between your own accounts is not a card purchase, whatever
				// piece of plastic happened to be in the hand.
				cardId: kind === "transfer" ? null : (chosenWay?.cardId ?? null),
			};

			if (editing) {
				// The status is not sent. A record that is waiting to be confirmed is waiting
				// because somebody has not said it happened, and correcting the description of
				// it is not saying so. The two buttons on the overview are what say so.
				const change = {
					amount: parsed.amount,
					description,
					accountId,
					counterAccountId: kind === "transfer" ? counterAccountId : null,
					notes: notes.trim() === "" ? null : notes.trim(),
					...sorting,
				};
				// The whole of the plan from here on, when that is what was asked for. The day
				// is left out of it on purpose: each part falls on its own.
				if (reach === "onwards") return session.transactions.updateFrom(editing.id, change);
				return session.transactions.update(editing.id, { ...change, happenedOn });
			}

			return session.transactions.create({
				spaceId,
				kind,
				amount: parsed.amount,
				happenedOn,
				description,
				accountId,
				counterAccountId: kind === "transfer" ? counterAccountId : null,
				// The day decides. A day that has not arrived has not happened, whatever
				// anybody ticks, and the one line reader has read it this way all along.
				status: compareCalendarDates(happenedOn as CalendarDate, today) > 0 ? "planned" : "settled",
				notes: notes.trim() === "" ? null : notes.trim(),
				installments: canSplit ? Number(installments) : 1,
				...sorting,
			});
		},
		onSuccess: () => {
			if (kind === "expense") rememberWayUsed(spaceId, way);
			onOpenChange(false);
			for (const key of ["transactions", "balances", "advice", "invoices"]) {
				void queries.invalidateQueries({ queryKey: [key] });
			}
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	const accountOptions = usable.map((account) => ({ value: account.id, label: account.name }));

	// The list reads as the tree it is: a category, then the ones under it, set in from
	// the margin by a couple of spaces rather than by a decoration.
	const side = kind === "income" ? "income" : "expense";
	const sorted = (categories.data ?? []).filter((category) => category.kind === side);
	const categoryOptions = sorted
		.filter((category) => category.parentId === null)
		.flatMap((parent: Category) => [
			{ value: parent.id, label: parent.name },
			...sorted
				.filter((child) => child.parentId === parent.id)
				.map((child) => ({ value: child.id, label: `  ${child.name}` })),
		]);

	const chosenCategory = sorted.find((category) => category.id === categoryId);

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={editing ? t("transactions.edit") : t("transactions.create")}
			description={t("transactions.createDescription")}
			closeLabel={t("actions.close")}
			footer={
				<>
					<Button variant="quiet" onClick={() => onOpenChange(false)}>
						{t("actions.cancel")}
					</Button>
					<Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
						{t("actions.save")}
					</Button>
				</>
			}
		>
			<form onSubmit={submit} className="space-y-4">
				{editing ? null : (
					<Segmented
						label={t("transactions.kind")}
						value={kind}
						onChange={setKind}
						options={[
							{ value: "expense", label: t("transactionKind.expense") },
							{ value: "income", label: t("transactionKind.income") },
							{ value: "transfer", label: t("transactionKind.transfer") },
						]}
					/>
				)}

				<div className="grid gap-4 md:grid-cols-2">
					<Field
						label={t("transactions.amount")}
						hint={t("fields.amountHint")}
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						numeric={true}
						inputMode="decimal"
						placeholder={t("fields.amountPlaceholder")}
						required={true}
					/>
					<Field
						label={t("transactions.day")}
						type="date"
						value={happenedOn}
						onChange={(event) => setHappenedOn(event.target.value)}
						required={true}
						// Off while the change reaches the parts ahead, because each of them
						// falls on its own day a month apart and one day written over all of
						// them would pile the whole purchase onto one afternoon.
						disabled={reach === "onwards"}
						hint={reach === "onwards" ? t("transactions.dayIsPerPart") : undefined}
					/>
				</div>

				<Field
					label={t("transactions.description")}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					placeholder={t("transactions.descriptionPlaceholder")}
					required={true}
				/>

				{/* One field, because it was one decision behind two controls. A spend says
				    what it was paid with; money coming in says where it landed; a transfer
				    says both ends and never a card, because moving money between two of your
				    own accounts is not a purchase whatever plastic was in the hand. */}
				{kind === "expense" ? (
					<div className="grid gap-4 md:grid-cols-2">
						<Select
							label={t("transactions.paidWith")}
							value={way}
							onChange={(event) => pickWay(event.target.value)}
							options={ways.map((entry) => ({ value: entry.value, label: entry.label }))}
						/>
						{canSplit && !editing ? (
							<Select
								label={t("transactions.installments")}
								value={installments}
								onChange={(event) => setInstallments(event.target.value)}
								hint={t("transactions.installmentsHint")}
								options={Array.from({ length: 24 }, (_unused, index) => ({
									value: String(index + 1),
									label:
										index === 0
											? t("transactions.inFull")
											: t("transactions.timesOf", { count: index + 1 }),
								}))}
							/>
						) : null}
					</div>
				) : (
					<div className="grid gap-4 md:grid-cols-2">
						<Select
							label={kind === "transfer" ? t("transactions.from") : t("transactions.landsIn")}
							value={accountId}
							onChange={(event) => setAccountId(event.target.value)}
							options={accountOptions}
						/>
						{kind === "transfer" ? (
							<Select
								label={t("transactions.to")}
								value={counterAccountId}
								onChange={(event) => setCounterAccountId(event.target.value)}
								options={[
									{ value: "", label: t("transactions.pickAccount") },
									...accountOptions.filter((option) => option.value !== accountId),
								]}
							/>
						) : null}
					</div>
				)}

				{/* Which invoice a card purchase lands on, said before it is written rather
				    than found out on the invoice screen three weeks later. */}
				{landsOn ? <p className="text-quiet text-sm">{landsOn}</p> : null}

				{/* Which part of a purchase in parts this is. The select that made them is
				    gone while editing, because it was drawn and then ignored. */}
				{editing?.installmentNumber && editing.installmentCount ? (
					<div className="space-y-3">
						<p className="text-quiet text-sm">
							{t("transactions.partOf", {
								number: editing.installmentNumber,
								count: editing.installmentCount,
							})}
						</p>

						{/* How far the correction reaches. Only where there is something ahead
						    of it to reach: the last part of a plan has no wider answer, and
						    offering one there is offering the same thing twice.

						    A subscription whose price went up, or a plan filed under the wrong
						    category, used to mean opening eleven more rows by hand, and
						    whoever opened one left ten disagreeing with it. */}
						{editing.installmentNumber < editing.installmentCount ? (
							<Segmented
								label={t("transactions.reach")}
								value={reach}
								onChange={(next) => setReach(next)}
								options={[
									{ value: "this", label: t("transactions.reachThis") },
									{
										value: "onwards",
										label: t("transactions.reachOnwards", {
											count: editing.installmentCount - editing.installmentNumber + 1,
										}),
									},
								]}
							/>
						) : null}
					</div>
				) : null}

				{kind === "transfer" ? null : (
					<Select
						label={t("transactions.category")}
						value={categoryId}
						onChange={(event) => setCategoryId(event.target.value)}
						options={[{ value: "", label: t("transactions.noCategory") }, ...categoryOptions]}
						hint={categoryOptions.length === 0 ? t("transactions.noCategoriesYet") : undefined}
					/>
				)}

				{/* There was a tickbox here asking whether this had happened yet, beside a
				    field that had already been given the day. Two answers to one question,
				    and the tickbox won. The day decides now, and this says what the day
				    chosen above means, which is the only part of it worth reading. */}
				{editing === null && compareCalendarDates(happenedOn as CalendarDate, today) > 0 ? (
					<p className="text-quiet text-sm">{t("transactions.aheadOfToday")}</p>
				) : null}
				{editing?.status === "planned" ? (
					<p className="text-quiet text-sm">{t("transactions.stillWaiting")}</p>
				) : null}

				{/* The two fields almost nobody fills, out of the way but not hidden: it opens
				    by itself when either of them already has something in it, so editing a
				    record never buries what somebody wrote. */}
				<Disclosure summary={t("transactions.moreDetails")} open={hasDetails}>
					<div className="space-y-4">
						{kind === "expense" ? (
							<Select
								label={t("transactions.priority")}
								value={priority}
								onChange={(event) => setPriority(event.target.value)}
								hint={
									chosenCategory
										? t("transactions.priorityFromCategory", {
												priority: t(`priority.${chosenCategory.priority}`),
											})
										: t("transactions.priorityHint")
								}
								options={[
									{ value: "", label: t("transactions.priorityInherited") },
									...(["essential", "important", "desirable", "superfluous"] as const).map(
										(level) => ({ value: level, label: t(`priority.${level}`) }),
									),
								]}
							/>
						) : null}
						<Field
							label={t("transactions.notes")}
							value={notes}
							onChange={(event) => setNotes(event.target.value)}
							placeholder={t("transactions.notesPlaceholder")}
						/>
					</div>
				</Disclosure>

				{problem ? <Callout tone="problem">{problem}</Callout> : null}
			</form>
		</Dialog>
	);
}
