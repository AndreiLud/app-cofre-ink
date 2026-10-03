// The things that happen again: rent, the subscription, the salary.
//
// Each one is written on its own day as an ordinary record, a fact held back until the day
// arrives, which counts in the balance from then on by itself. A change applies from the next
// time on and leaves what happened as it was; stopping or deleting one takes back only what
// was still ahead and nobody touched.

import {
	type CalendarDate,
	nextOccurrence,
	occurrencesBetween,
	type RecurrenceSpec,
	seriesInAMonth,
} from "@cofre/core";
import type { Recurrence, TransactionKind } from "@cofre/storage";
import { RuleError } from "@cofre/storage";
import {
	Button,
	Callout,
	Dialog,
	Field,
	Icon,
	InsightTitle,
	Menu,
	MenuItem,
	MenuSeparator,
	Segmented,
	Select,
	Skeleton,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Language, LOCALE_OF } from "../i18n/index.ts";
import { afterRecordsChange } from "../lib/afterRecords.ts";
import { fillAmount, readAmount } from "../lib/amounts.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions, paidWithLabel, waysToPay } from "../lib/wayLabel.ts";
import { ROUTES } from "../routes.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";
import { Value } from "./Value.tsx";

export type RecurrencesSectionProps = {
	spaceId: string;
	today: string;
};

/** The rule of a series, as the schedule reads it. */
function specOf(one: Recurrence): RecurrenceSpec {
	return {
		frequency: one.frequency,
		intervalCount: one.intervalCount,
		startsOn: one.startsOn,
		endsOn: one.endsOn,
		dayOfMonth: one.dayOfMonth,
		monthOfYear: one.monthOfYear,
	};
}

/** A day as the lists write it, day and month. */
const dayAndMonth = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;

export function RecurrencesSection({ spaceId, today }: RecurrencesSectionProps) {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();
	const navigate = useNavigate();
	const locale = LOCALE_OF[(i18n.resolvedLanguage ?? "pt") as Language];
	// The currency of the space, which is the one a series is always written in.
	const currency = currentSpace?.baseCurrency;
	const queries = useQueryClient();

	const [isOpen, setOpen] = useState(false);
	const [editing, setEditing] = useState<Recurrence | null>(null);
	const [kind, setKind] = useState<TransactionKind>("expense");
	const [description, setDescription] = useState("");
	const [amount, setAmount] = useState("");
	const [way, setWay] = useState("");
	const [accountId, setAccountId] = useState("");
	const [counterAccountId, setCounterAccountId] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
	const [startsOn, setStartsOn] = useState(today);
	const [endsOn, setEndsOn] = useState("");
	const [leavePastOut, setLeavePastOut] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const [dropping, setDropping] = useState<Recurrence | null>(null);

	const accounts = useQuery({
		// The archived ones too, so a series on an account put away still says where it was.
		queryKey: ["accounts", spaceId, "includingArchived"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.accounts.list(spaceId, { includeArchived: true }) ?? [],
	});

	const cards = useQuery({
		queryKey: ["cards", spaceId, "includingArchived"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.cards.list(spaceId, { includeArchived: true }) ?? [],
	});

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	const series = useQuery({
		queryKey: ["recurrences", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.recurrences.list(spaceId) ?? [],
	});

	// What deleting the one being asked about takes back, read when the question opens.
	const going = useQuery({
		queryKey: ["recurrences", spaceId, "removal", dropping?.id],
		enabled: Boolean(session && dropping),
		queryFn: () => (dropping ? (session?.recurrences.removalPreview(dropping.id) ?? []) : []),
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["recurrences"] });
		afterRecordsChange(queries);
	};

	const complain = (error: unknown) => setProblem(sayWhy(error, t));

	// Each control by the call it makes. A role that may not write a series sees them all, with
	// no menu and no button: a viewer, and a logger, who also does not get the sentence about
	// the household's month.
	const { mayCall, seesOwnRowsOnly } = useWhatIMayDo(spaceId);
	const mayCreate = mayCall("recurrences.create");
	const mayEdit = mayCall("recurrences.update");
	const mayRemove = mayCall("recurrences.remove");

	const usable = (accounts.data ?? []).filter((account) => account.archivedAt === null);
	const ways = useMemo(
		() =>
			waysToPay(
				cards.data ?? [],
				(accounts.data ?? []).filter((account) => account.archivedAt === null),
				t,
				editing ? { cardId: editing.cardId, accountId: editing.accountId } : undefined,
			),
		[cards.data, accounts.data, t, editing],
	);
	const chosenWay = ways.find((entry) => entry.value === way) ?? null;
	const sorted = (categories.data ?? []).filter((category) =>
		kind === "income" ? category.kind === "income" : category.kind === "expense",
	);

	/**
	 * The days already gone a new series would write, said before it is saved. A rent written
	 * down on the twenty eighth starting on the fifth of August writes August, September and
	 * October as well, and they count in the balance.
	 */
	const pastDays = useMemo(() => {
		if (editing || kind === "transfer" || startsOn === "" || startsOn >= today) return [];
		try {
			const yesterday = new Date(`${today}T12:00:00Z`);
			yesterday.setUTCDate(yesterday.getUTCDate() - 1);
			return occurrencesBetween(
				{ frequency, startsOn: startsOn as CalendarDate, endsOn: endsOn === "" ? null : endsOn },
				startsOn as CalendarDate,
				yesterday.toISOString().slice(0, 10) as CalendarDate,
			);
		} catch {
			return [];
		}
	}, [editing, kind, startsOn, today, frequency, endsOn]);

	/** The amount as typed so far, or nothing while it is not an amount yet. */
	const typedAmount = (() => {
		try {
			return readAmount(amount, currency);
		} catch {
			return 0;
		}
	})();

	const save = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			// In the currency of the space, which the model forces every series into.
			const parsed = readAmount(amount, currency);
			if (parsed <= 0)
				throw new RuleError("amountIsPositiveInteger", "an amount has to be more than nothing");
			const charged =
				kind === "expense" && chosenWay
					? { accountId: chosenWay.accountId, cardId: chosenWay.cardId }
					: { accountId, cardId: null };

			if (editing) {
				return session.recurrences.update(editing.id, {
					description,
					amount: parsed,
					...charged,
					...(editing.kind === "transfer" ? { counterAccountId } : {}),
					categoryId: categoryId === "" ? null : categoryId,
					frequency,
					startsOn,
					endsOn: endsOn === "" ? null : endsOn,
				});
			}
			return session.recurrences.create({
				spaceId,
				description,
				kind,
				amount: parsed,
				...charged,
				categoryId: categoryId === "" ? null : categoryId,
				frequency,
				startsOn,
				endsOn: endsOn === "" ? null : endsOn,
				leavePastOut: pastDays.length > 0 && leavePastOut,
			});
		},
		onSuccess: async () => {
			setOpen(false);
			setProblem(null);
			// The line first, so the series is there the moment the dialog closes, and then what
			// it owes, on the screens straight away.
			void queries.invalidateQueries({ queryKey: ["recurrences"] });
			await session?.recurrences.materialize({ spaceId });
			invalidate();
		},
		onError: complain,
	});

	const pause = useMutation({
		mutationFn: async (one: Recurrence) =>
			session?.recurrences.update(one.id, { paused: one.pausedAt === null }),
		onSuccess: async () => {
			await session?.recurrences.materialize({ spaceId });
			invalidate();
		},
		onError: complain,
	});

	const remove = useMutation({
		mutationFn: async (id: string) => session?.recurrences.remove(id),
		onSuccess: () => {
			setDropping(null);
			invalidate();
		},
		onError: complain,
	});

	function open(one: Recurrence | null) {
		setEditing(one);
		setKind(one?.kind ?? "expense");
		setDescription(one?.description ?? "");
		setAmount(one ? fillAmount(one.amount, i18n.resolvedLanguage, currency) : "");
		// A rent, a gym or a salary is paid from the current account far more often than on a
		// card, so a new series starts there, and on a card only when there is nothing else.
		const kindOf = (accountId: string) =>
			accounts.data?.find((account) => account.id === accountId)?.kind;
		const first =
			ways.find((entry) => entry.cardId === null && kindOf(entry.accountId) === "checking") ??
			ways.find((entry) => kindOf(entry.accountId) !== "credit") ??
			ways[0];
		setWay(
			one
				? (ways.find((entry) => entry.accountId === one.accountId && entry.cardId === one.cardId)
						?.value ?? "")
				: (first?.value ?? ""),
		);
		setAccountId(one?.accountId ?? usable[0]?.id ?? "");
		setCounterAccountId(one?.counterAccountId ?? "");
		setCategoryId(one?.categoryId ?? "");
		setFrequency(one?.frequency ?? "monthly");
		setStartsOn(one?.startsOn ?? today);
		setEndsOn(one?.endsOn ?? "");
		setLeavePastOut(false);
		setProblem(null);
		setOpen(true);
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	const rows = series.data ?? [];
	const nameOfAccount = (id: string | null) =>
		accounts.data?.find((account) => account.id === id)?.name ?? "";
	const cardOf = (id: string | null) =>
		id === null ? null : (cards.data?.find((card) => card.id === id) ?? null);

	const money = (value: number) =>
		new Intl.NumberFormat(locale, { style: "currency", currency: currency ?? "BRL" }).format(
			value / 100,
		);
	const listOfDays = (days: readonly string[]) =>
		new Intl.ListFormat(locale, { type: "conjunction" }).format(days.map(dayAndMonth));

	/** Running: not on hold, not stopped, not ended. These are what the sentence adds up. */
	const running = rows.filter(
		(one) =>
			one.pausedAt === null &&
			one.stoppedBy === null &&
			nextOccurrence(specOf(one), today) !== null,
	);
	const month = seriesInAMonth(running);

	return (
		<div className="space-y-4">
			{!seesOwnRowsOnly && running.length > 0 ? (
				<InsightTitle detail={t("recurrences.explain")}>
					{t("recurrences.monthSentence", { out: money(month.out), in: money(month.in) })}
				</InsightTitle>
			) : (
				<p className="max-w-[60ch] text-sm text-quiet">{t("recurrences.explain")}</p>
			)}

			{mayCreate ? (
				<div>
					<Button
						size="small"
						variant="primary"
						icon={<Icon name="plus" />}
						onClick={() => open(null)}
					>
						{t("recurrences.create")}
					</Button>
				</div>
			) : null}

			{/* Only where the dialog is not covering it. */}
			{problem && !isOpen && dropping === null ? <Callout tone="problem">{problem}</Callout> : null}

			{series.isPending ? <Skeleton lines={2} /> : null}

			{!series.isPending && rows.length === 0 ? (
				<p className="text-sm text-quiet">{t("recurrences.empty")}</p>
			) : null}

			<ul className="divide-y divide-line">
				{rows.map((one) => {
					const next = one.pausedAt === null ? nextOccurrence(specOf(one), today) : null;
					const where =
						one.kind === "transfer"
							? `${nameOfAccount(one.accountId)} → ${nameOfAccount(one.counterAccountId)}`
							: paidWithLabel(nameOfAccount(one.accountId), cardOf(one.cardId));
					const state =
						one.stoppedBy !== null
							? t(
									one.stoppedBy === "card"
										? "recurrences.stoppedCard"
										: "recurrences.stoppedAccount",
								)
							: one.pausedAt !== null
								? t("recurrences.paused")
								: next
									? t("recurrences.next", { day: dayAndMonth(next) })
									: t("recurrences.ended");
					const quiet = one.pausedAt !== null || one.stoppedBy !== null || next === null;

					return (
						<li key={one.id} className="flex items-baseline justify-between gap-4 py-2">
							<span className="flex min-w-0 flex-col">
								<span className={quiet ? "text-sm text-quiet" : "text-sm text-ink"}>
									{one.description}
								</span>
								<span className="text-xs text-quiet">
									{t(`recurrences.every.${one.frequency}`)}, {where}, {state}
								</span>
							</span>
							<span className="flex shrink-0 items-center gap-3">
								<Value
									amount={one.kind === "expense" ? -one.amount : one.amount}
									currency={one.currency}
									tone={one.kind === "transfer" ? "neutral" : "auto"}
								/>
								{mayEdit || mayRemove ? (
									<Menu
										align="end"
										trigger={
											<Button
												size="small"
												variant="quiet"
												aria-label={t("recurrences.actionsOf", { description: one.description })}
											>
												<Icon name="settings" />
											</Button>
										}
									>
										{mayEdit ? (
											<>
												<MenuItem onSelect={() => open(one)}>{t("recurrences.edit")}</MenuItem>
												<MenuItem onSelect={() => pause.mutate(one)}>
													{one.pausedAt === null ? t("recurrences.pause") : t("recurrences.resume")}
												</MenuItem>
											</>
										) : null}
										<MenuItem
											onSelect={() =>
												void navigate({
													to: ROUTES.transactions,
													search: { serie: one.id, mes: "tudo" },
												})
											}
										>
											{t("recurrences.seeRecords")}
										</MenuItem>
										{mayRemove ? (
											<>
												<MenuSeparator />
												<MenuItem
													onSelect={() => {
														setProblem(null);
														setDropping(one);
													}}
												>
													{t("actions.delete")}
												</MenuItem>
											</>
										) : null}
									</Menu>
								) : null}
							</span>
						</li>
					);
				})}
			</ul>

			{/* Deleting asks first, and says what goes: only what was still ahead and nobody
			    touched. It asked nothing, and took everything still to come. */}
			<Dialog
				open={dropping !== null}
				onOpenChange={(next) => !next && setDropping(null)}
				title={t("recurrences.deleteTitle", { description: dropping?.description ?? "" })}
				description={t("recurrences.deleteKeeps")}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setDropping(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="destructive"
							onClick={() => dropping && remove.mutate(dropping.id)}
							disabled={remove.isPending || going.isPending}
						>
							{t("actions.delete")}
						</Button>
					</>
				}
			>
				{going.isPending ? (
					<Skeleton lines={1} />
				) : (
					<p className="text-sm">
						{(going.data ?? []).length === 0
							? t("recurrences.deleteNothing")
							: t("recurrences.deleteGoing", {
									count: (going.data ?? []).length,
									days: listOfDays((going.data ?? []).map((one) => one.day)),
								})}
					</p>
				)}
				{problem && dropping !== null ? <Callout tone="problem">{problem}</Callout> : null}
			</Dialog>

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={editing ? t("recurrences.edit") : t("recurrences.create")}
				description={editing ? t("recurrences.editNote") : t("recurrences.createDescription")}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setOpen(false)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form onSubmit={submit} className="space-y-4">
					{/* Money out or money in. A move between two accounts is set up from Mover entre
					    contas, which is where a move is written. */}
					{editing ? null : (
						<Segmented
							label={t("transactions.kind")}
							value={kind}
							onChange={(next) => {
								setKind(next);
								setCategoryId("");
							}}
							options={[
								{ value: "expense", label: t("transactionKind.expense") },
								{ value: "income", label: t("transactionKind.income") },
							]}
						/>
					)}

					<Field
						label={t("transactions.description")}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder={t("recurrences.descriptionPlaceholder")}
						required={true}
					/>

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
						<Select
							label={t("recurrences.frequency")}
							value={frequency}
							onChange={(event) =>
								setFrequency(event.target.value as "weekly" | "monthly" | "yearly")
							}
							options={[
								{ value: "weekly", label: t("recurrences.every.weekly") },
								{ value: "monthly", label: t("recurrences.every.monthly") },
								{ value: "yearly", label: t("recurrences.every.yearly") },
							]}
						/>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<Field
							label={t("recurrences.startsOn")}
							hint={t("recurrences.startsOnHint")}
							type="date"
							value={startsOn}
							onChange={(event) => setStartsOn(event.target.value)}
							required={true}
						/>
						<Field
							label={t("recurrences.endsOn")}
							hint={t("recurrences.endsOnHint")}
							type="date"
							value={endsOn}
							onChange={(event) => setEndsOn(event.target.value)}
						/>
					</div>

					{kind === "expense" ? (
						<Select
							label={t("transactions.paidWith")}
							value={way}
							onChange={(event) => setWay(event.target.value)}
							options={ways.map(({ value, label, group }) => ({ value, label, group }))}
						/>
					) : (
						<div className="grid gap-4 md:grid-cols-2">
							<Select
								label={kind === "transfer" ? t("transactions.from") : t("transactions.landsIn")}
								value={accountId}
								onChange={(event) => setAccountId(event.target.value)}
								// Money comes in to money: never to a card or a benefit card.
								options={accountOptions(
									kind === "transfer"
										? usable
										: usable.filter(
												(account) => account.kind !== "voucher" && account.kind !== "credit",
											),
									t,
								)}
							/>
							{kind === "transfer" ? (
								<Select
									label={t("transactions.to")}
									value={counterAccountId}
									onChange={(event) => setCounterAccountId(event.target.value)}
									options={accountOptions(
										usable.filter((account) => account.id !== accountId),
										t,
									)}
								/>
							) : null}
						</div>
					)}

					{kind === "transfer" ? null : (
						<Select
							label={t("transactions.category")}
							value={categoryId}
							onChange={(event) => setCategoryId(event.target.value)}
							options={[
								{ value: "", label: t("transactions.noCategory") },
								...sorted.map((category) => ({ value: category.id, label: category.name })),
							]}
						/>
					)}

					{pastDays.length > 0 ? (
						<Callout tone="neutral">
							<span className="block">
								{t("recurrences.pastOnes", {
									count: pastDays.length,
									days: listOfDays(pastDays),
									amount: money(pastDays.length * typedAmount),
								})}
							</span>
							<label className="mt-2 flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={leavePastOut}
									onChange={(event) => setLeavePastOut(event.target.checked)}
									className="size-4 accent-[var(--ink)]"
								/>
								{t("recurrences.leavePastOut")}
							</label>
						</Callout>
					) : null}

					{problem && isOpen ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
