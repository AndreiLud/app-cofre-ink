// Moving money between two accounts of the same person.
//
// It used to be the third kind on the form for a record, beside money out and money in,
// and that put a question nobody asks at the till in front of every purchase. Moving money
// is something done to the accounts, so it lives with them, and the form keeps the two
// kinds a person actually writes down. Inside it is what it always was, one row of kind
// transfer that leaves one account and reaches the other (registry 0010).
//
// Never out of a credit card, whose balance is a debt and whose invoice is paid on the
// invoice screen, and never into an investment account, which is worth what the holdings
// inside it are worth: money moved there would leave "Você tem" and arrive nowhere.

import { type CurrencyCode, isBenefit, isSpendable } from "@cofre/core";
import type { Account } from "@cofre/storage";
import { RuleError } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Select } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { afterRecordsChange } from "../lib/afterRecords.ts";
import { readAmount } from "../lib/amounts.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

/** What is already known when the move is opened from somewhere, all of it optional. */
export type MoveStart = {
	fromId?: string;
	toId?: string;
	/** As it would be typed, because the form hands over what was typed. */
	amount?: string;
	happenedOn?: string;
	description?: string;
};

export type MoveDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	spaceId: string;
	accounts: Account[];
	/** Today where the space lives, which is the day a move opens on. */
	today: string;
	start?: MoveStart;
};

/** Where a move may start: an account that holds money somebody can spend. */
export function movesOutOf(account: Account): boolean {
	return account.archivedAt === null && isSpendable(account.kind);
}

/** Where a move may land: the same, and a benefit card, which takes a top up. */
export function movesInto(account: Account): boolean {
	return account.archivedAt === null && (isSpendable(account.kind) || isBenefit(account.kind));
}

export function MoveDialog({
	open,
	onOpenChange,
	spaceId,
	accounts,
	today,
	start,
}: MoveDialogProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();
	// A series writes into the space every month, which is a question of its own: somebody
	// who may write a record may not always set one going.
	const mayRepeat = useWhatIMayDo(spaceId).mayCall("recurrences.create");

	const [fromId, setFromId] = useState("");
	const [toId, setToId] = useState("");
	const [amount, setAmount] = useState("");
	const [happenedOn, setHappenedOn] = useState(today);
	const [description, setDescription] = useState("");
	const [repeats, setRepeats] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	const origins = accounts.filter(movesOutOf);
	const landings = accounts.filter((account) => movesInto(account) && account.id !== fromId);

	// Opening is what resets it, once, with whatever the door it was opened from already
	// knew, and not again while it is open: a list read again behind it would otherwise
	// wipe what somebody was typing. The current account first, because that is where
	// money usually leaves from.
	const opened = useRef(false);
	useEffect(() => {
		const opening = open && !opened.current;
		opened.current = open;
		if (!opening) return;
		setAmount(start?.amount ?? "");
		setHappenedOn(start?.happenedOn ?? today);
		setDescription(start?.description ?? t("move.description"));
		setRepeats(false);
		setProblem(null);
		setFromId("");
		setToId("");
	}, [open, start, today, t]);

	// The two ends, as soon as there are accounts to choose from: when the dialog opens, or
	// when the accounts arrive after it did.
	useEffect(() => {
		if (!open || fromId !== "") return;
		const out = accounts.filter(movesOutOf);
		const from =
			out.find((account) => account.id === start?.fromId) ??
			out.find((account) => account.kind === "checking") ??
			out[0];
		if (!from) return;
		const into = accounts.filter((account) => movesInto(account) && account.id !== from.id);
		const to = into.find((account) => account.id === start?.toId) ?? into[0];
		setFromId(from.id);
		setToId(to?.id ?? "");
	}, [open, fromId, accounts, start]);

	/** Choosing where it leaves from may take away where it was going, so pick again. */
	function pickFrom(id: string) {
		setFromId(id);
		if (id === toId) {
			const other = accounts.find((account) => movesInto(account) && account.id !== id);
			setToId(other?.id ?? "");
		}
	}

	const save = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			const from = accounts.find((account) => account.id === fromId);
			const cents = readAmount(amount, (from?.currency ?? "BRL") as CurrencyCode);
			if (cents <= 0) {
				throw new RuleError("amountIsPositiveInteger", "an amount has to be more than nothing");
			}
			if (repeats) {
				// The series writes this month's move itself, on its day, so nothing is written
				// beside it: writing both put the first month in twice.
				await session.recurrences.create({
					spaceId,
					description,
					kind: "transfer",
					amount: cents,
					accountId: fromId,
					counterAccountId: toId,
					frequency: "monthly",
					startsOn: happenedOn,
				});
				await session.recurrences.materialize({ spaceId });
				return;
			}
			await session.transactions.create({
				spaceId,
				kind: "transfer",
				amount: cents,
				happenedOn,
				description,
				accountId: fromId,
				counterAccountId: toId,
				status: "settled",
			});
		},
		onSuccess: () => {
			onOpenChange(false);
			void queries.invalidateQueries({ queryKey: ["recurrences"] });
			afterRecordsChange(queries);
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("move.title")}
			description={t("move.explain")}
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
				<div className="grid gap-4 md:grid-cols-2">
					<Select
						label={t("move.from")}
						value={fromId}
						onChange={(event) => pickFrom(event.target.value)}
						options={origins.map((account) => ({ value: account.id, label: account.name }))}
					/>
					<Select
						label={t("move.to")}
						value={toId}
						onChange={(event) => setToId(event.target.value)}
						options={landings.map((account) => ({ value: account.id, label: account.name }))}
					/>
				</div>
				<p className="text-quiet text-sm">{t("move.notHere")}</p>

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
					/>
				</div>

				<Field
					label={t("transactions.description")}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					required={true}
				/>

				{mayRepeat ? (
					<label className="flex items-start gap-3 text-sm">
						<input
							type="checkbox"
							checked={repeats}
							onChange={(event) => setRepeats(event.target.checked)}
							className="mt-1 size-4 accent-[var(--ink)]"
						/>
						<span className="text-ink">{t("move.repeats")}</span>
					</label>
				) : null}

				{problem ? <Callout tone="problem">{problem}</Callout> : null}
			</form>
		</Dialog>
	);
}
