// Writing down what happened.
//
// The two kinds are on screen at once rather than behind a menu, because choosing between
// them is the decision, not a detail of it: money out says what it was paid with and may
// be split, money in says where it landed. Moving money between two accounts of the same
// person was a third kind here, and it is an action on the accounts now (decision 1 of
// 2.0.0), so the form only edits a move that already exists, with both of its ends.

import {
	type CalendarDate,
	type CurrencyCode,
	compareCalendarDates,
	countsAsMoney,
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
import { afterRecordsChange } from "../lib/afterRecords.ts";
import { fillAmount, readAmount } from "../lib/amounts.ts";
import { lastWayUsed, rememberLandingUsed, rememberWayUsed } from "../lib/lastWay.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions, waysToPay } from "../lib/wayLabel.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";
import { MoveDialog, type MoveStart, movesInto, movesOutOf } from "./MoveDialog.tsx";

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
	const mayReachOnwards = useWhatIMayDo(spaceId).mayCall("transactions.updateFrom");
	const [problem, setProblem] = useState<string | null>(null);
	/** The move between accounts this spend turned out to be, with what was typed. */
	const [moving, setMoving] = useState<MoveStart | null>(null);

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	// The ones put away too, for the record of a card since archived: without it the way of
	// that record was missing from the list, and saving took the card off it.
	const cards = useQuery({
		queryKey: ["cards", spaceId, "includingArchived"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.cards.list(spaceId, { includeArchived: true }) ?? [],
	});

	const usable = useMemo(
		() => accounts.filter((account) => account.archivedAt === null),
		[accounts],
	);
	const chosen = usable.find((account) => account.id === accountId);
	// Any money out, which is decision 6 of 1.1.0: a carnê on the current account is a plan
	// as much as a purchase on the card. Not on a benefit card, which is spent as it goes.
	const canSplit = kind === "expense" && chosen !== undefined && chosen.kind !== "voucher";
	/**
	 * Money out written as money in, or the other way round, corrected in place. Only on a
	 * record that stands alone: a part of a plan and an occurrence of a series share their
	 * kind with the rest, a move is changed by its own path, and a record ticked off against
	 * the bank does not change at all.
	 */
	const kindCanChange =
		editing != null &&
		editing.kind !== "transfer" &&
		editing.installmentGroup === null &&
		editing.recurrenceId === null &&
		editing.reconciledAt === null;

	/**
	 * Every way to pay, as one list.
	 *
	 * The card and the account were two fields that already behaved as one: picking the
	 * card set the account, and picking another account silently dropped the card. Two
	 * controls for one decision, and the decision at the till is not "which account" but
	 * "what did I pay with".
	 *
	 * One entry per way to pay rather than one per card: a cartao multiplo appears twice, as
	 * credit and as debit, and a current account with a debit card on it appears again on its
	 * own, because a Pix leaves it with no card involved. Cards and accounts sit under two
	 * headings, because the card and the current account of one bank carry the same name.
	 * The value of an option carries the card and the account with a colon between them, and
	 * the card half is nothing rather than an empty string when there is no plastic.
	 */
	const ways = useMemo(
		() =>
			waysToPay(
				cards.data ?? [],
				accounts,
				t,
				editing ? { cardId: editing.cardId, accountId: editing.accountId } : undefined,
			),
		[cards.data, accounts, t, editing],
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

	/**
	 * Changing the kind changes where the money is.
	 *
	 * The way to pay stayed behind when somebody moved from a spend to money coming in, so a
	 * form that opened on the card wrote the salary on the card, under a field that offered
	 * the card. Money comes in to an account that holds money, the current account first, and
	 * a spend goes back to the way that was chosen for it.
	 */
	function changeKind(next: TransactionKind) {
		setKind(next);
		// A category belongs to one side.
		const category = (categories.data ?? []).find((one) => one.id === categoryId);
		if (category && category.kind !== next) setCategoryId("");
		if (next === "expense") {
			if (chosenWay) setAccountId(chosenWay.accountId);
			return;
		}
		if (chosen && countsAsMoney(chosen.kind)) return;
		const landing =
			usable.find((account) => account.kind === "checking") ??
			usable.find((account) => countsAsMoney(account.kind));
		setAccountId(landing?.id ?? "");
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
				// Only a spend is paid with a card. A transfer between your own accounts is not
				// a card purchase, whatever piece of plastic happened to be in the hand, and
				// money coming in was sent with the card of the last spend.
				cardId: kind === "expense" ? (chosenWay?.cardId ?? null) : null,
			};

			if (editing) {
				// The status is not sent. A record that is waiting to be confirmed is waiting
				// because somebody has not said it happened, and correcting the description of
				// it is not saying so. The two buttons on the overview are what say so.
				// The card only when somebody changed how it was paid. Sent on every save, a
				// purchase of a card since put away lost its card the first time anything else
				// about it was corrected.
				const opened = `${editing.cardId ?? ""}:${editing.accountId}`;
				const { cardId, ...sortedOnly } = sorting;
				const change = {
					// Only when it changed, which only a record that stands alone offers.
					...(kind !== editing.kind && kind !== "transfer" ? { kind } : {}),
					amount: parsed.amount,
					description,
					accountId,
					counterAccountId: kind === "transfer" ? counterAccountId : null,
					notes: notes.trim() === "" ? null : notes.trim(),
					...sortedOnly,
					...(way !== opened || kind !== editing.kind ? { cardId } : {}),
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
				// Written as having happened, whatever the day. A day that has not arrived holds
				// it back from the balance until it arrives, and then it counts by itself: this
				// wrote a promise for a day ahead, nothing ever kept it, and on its day the record
				// stayed out of the balance and the next morning came back as late.
				status: "settled",
				notes: notes.trim() === "" ? null : notes.trim(),
				installments: canSplit ? Number(installments) : 1,
				...sorting,
			});
		},
		onSuccess: () => {
			if (kind === "expense") rememberWayUsed(spaceId, way);
			// Where money came in, which is where the next line that names nothing lands.
			if (kind === "income") rememberLandingUsed(spaceId, accountId);
			onOpenChange(false);
			afterRecordsChange(queries);
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	/**
	 * Where money comes in, or where a move starts: an account that holds money. Never a
	 * benefit card, which takes no income and lets nothing out, and never a credit card,
	 * whose balance is a debt: a salary landed there whenever the form opened on the card.
	 * The record's own account stays, so an income written on a card before 2.0.0 still
	 * opens to be corrected.
	 */
	const sourceOptions = accountOptions(
		usable.filter((account) => countsAsMoney(account.kind) || account.id === editing?.accountId),
		t,
	);

	/**
	 * The two ends of a move that already exists: the lists of Move between accounts, and the
	 * accounts the row already has, so an old move from a card or into an investment opens to
	 * be corrected rather than to be changed behind somebody's back.
	 */
	const movesFrom = accountOptions(
		accounts.filter((account) => movesOutOf(account) || account.id === editing?.accountId),
		t,
	);
	const movesTo = accountOptions(
		accounts.filter(
			(account) =>
				account.id !== accountId &&
				(movesInto(account) || account.id === editing?.counterAccountId),
		),
		t,
	);

	/**
	 * What was typed, handed to Move between accounts: a spend into the savings account or
	 * onto the meal card is not spending, and writing it as one made the month look worse by
	 * exactly what was put aside.
	 */
	function moveInstead() {
		const from = usable.find((account) => account.id === accountId);
		setMoving({
			amount,
			happenedOn,
			description: description.trim() === "" ? undefined : description,
			fromId: from && movesOutOf(from) ? from.id : undefined,
		});
		onOpenChange(false);
	}

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
		<>
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
					{editing && !kindCanChange ? null : (
						<div className="space-y-2">
							<Segmented
								label={t("transactions.kind")}
								value={kind}
								onChange={changeKind}
								options={[
									{ value: "expense", label: t("transactionKind.expense") },
									{ value: "income", label: t("transactionKind.income") },
								]}
							/>
							{kind === "expense" && !editing ? (
								<p className="text-quiet text-sm">
									{t("transactions.wasAMove")}{" "}
									<button
										type="button"
										className="text-ink underline underline-offset-2"
										onClick={moveInstead}
									>
										{t("transactions.useMove")}
									</button>
								</p>
							) : null}
						</div>
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
								options={ways.map(({ value, label, group }) => ({ value, label, group }))}
							/>
							{canSplit && !editing ? (
								<Select
									label={t("transactions.installments")}
									value={installments}
									onChange={(event) => setInstallments(event.target.value)}
									// The invoice is only something to speak of on a card.
									hint={
										chosen?.kind === "credit"
											? t("transactions.installmentsHint")
											: t("transactions.installmentsHintMonth")
									}
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
								options={kind === "transfer" ? movesFrom : sourceOptions}
							/>
							{kind === "transfer" ? (
								<Select
									label={t("transactions.to")}
									value={counterAccountId}
									onChange={(event) => setCounterAccountId(event.target.value)}
									options={[{ value: "", label: t("transactions.pickAccount") }, ...movesTo]}
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
							{editing.installmentNumber < editing.installmentCount && mayReachOnwards ? (
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
					{/* Said when editing too, since a record dated ahead is kept as a fact that waits
				    for its day, and the promise below is only what release 1.0 wrote. */}
					{editing?.status !== "planned" &&
					compareCalendarDates(happenedOn as CalendarDate, today) > 0 ? (
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

			<MoveDialog
				open={moving !== null}
				onOpenChange={(next) => !next && setMoving(null)}
				spaceId={spaceId}
				accounts={accounts}
				today={today}
				start={moving ?? undefined}
			/>
		</>
	);
}
