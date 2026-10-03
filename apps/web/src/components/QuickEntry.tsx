// One line instead of a form.
//
// Most records are written in a hurry, standing at a counter, and the form asks for
// five things. This asks for one, reads it, and shows what it understood before
// writing anything. Nothing is guessed silently: what it could not find is said out
// loud, and what it did find can be undone in one click.

import { type QuickEntryReading, readQuickEntry } from "@cofre/core";
import { type Account, hasHappened, type Transaction } from "@cofre/storage";
import { Button, Callout, Field } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { afterRecordsChange } from "../lib/afterRecords.ts";
import { lastLandingUsed, lastWayUsed, rememberLandingUsed } from "../lib/lastWay.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { Value } from "./Value.tsx";

export type QuickEntryProps = {
	spaceId: string;
	accounts: Account[];
	/** Today where the space lives, which is not always today where the device is. */
	today: string;
};

function dayAndMonth(date: string): string {
	return `${date.slice(8)}/${date.slice(5, 7)}`;
}

export function QuickEntry({ spaceId, accounts, today }: QuickEntryProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

	const [text, setText] = useState("");
	/** What was written last, kept so it can be taken back without hunting for it. */
	const [written, setWritten] = useState<{ description: string; ids: string[] } | null>(null);
	const [problem, setProblem] = useState<string | null>(null);

	const usable = useMemo(
		() => accounts.filter((account) => account.archivedAt === null),
		[accounts],
	);

	const cards = useQuery({
		queryKey: ["cards", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.cards.list(spaceId) ?? [],
	});

	/**
	 * Every name a line can say, the accounts and the cards.
	 *
	 * The reader knew only account names, so "mercado 80 no nubank" read nothing: it went
	 * to whichever account came first alphabetically, and a purchase on a card landed on a
	 * current account. A card names the account it reaches, which is what makes the name
	 * on the line enough.
	 */
	const named = useMemo(() => {
		// Both sides of a card that does both, because one name reaches two accounts and the
		// line may say which: it took the credit side whatever was written.
		const byCard = (cards.data ?? []).flatMap((card) =>
			[
				{ side: "credit" as const, reaches: card.creditAccountId },
				{ side: "debit" as const, reaches: card.debitAccountId },
			]
				.filter(
					(one): one is { side: "credit" | "debit"; reaches: string } =>
						one.reaches !== null && usable.some((account) => account.id === one.reaches),
				)
				.map((one) => ({
					id: one.reaches,
					name: card.name,
					cardId: card.id,
					side: one.side,
					takesIncome: false,
				})),
		);
		return [
			...usable.map((account) => ({
				id: account.id,
				name: account.name,
				takesIncome: account.kind !== "credit" && account.kind !== "voucher",
			})),
			...byCard,
		];
	}, [usable, cards.data]);

	const reading: QuickEntryReading = useMemo(
		() => readQuickEntry(text, { today, accounts: named }),
		[text, today, named],
	);

	/**
	 * Where a line that names nothing goes, which is not the same for money out and money in.
	 *
	 * A spend goes to the last way somebody paid on this device, the card with it: the account
	 * alone was carried, so "mercado 80" landed on the card's account with no card. Money in
	 * goes to the last account money came into, or the first that holds money, the current
	 * account first, and never a card or a benefit card: "salario 6120" became income on the
	 * credit card whenever the last spend was on it.
	 */
	const remembered = (lastWayUsed(spaceId) ?? "").split(":");
	const holdsMoney = (option: Account) =>
		option.kind === "checking" || option.kind === "savings" || option.kind === "cash";
	const spendFallback = usable.find((option) => option.id === remembered[1]) ?? usable[0] ?? null;
	const landing = lastLandingUsed(spaceId);
	const incomeFallback =
		usable.find((option) => option.id === landing && holdsMoney(option)) ??
		usable.find((option) => option.kind === "checking") ??
		usable.find(holdsMoney) ??
		null;
	const fallback = reading.kind === "income" ? incomeFallback : spendFallback;
	const namedAccount = usable.find((option) => option.id === reading.accountId);
	const account = namedAccount ?? fallback;
	/** The plastic: the one the line named, or the one of the last spend when it named nothing. */
	const cardId =
		reading.cardId ??
		(namedAccount === undefined &&
		reading.kind === "expense" &&
		remembered[0] !== "" &&
		remembered[1] === account?.id
			? (remembered[0] ?? null)
			: null);
	const ready = reading.problems.length === 0 && account !== null;

	const invalidate = () => {
		afterRecordsChange(queries);
	};

	const write = useMutation({
		mutationFn: async () => {
			if (!session || !account || reading.amount === null) return [];
			return session.transactions.create({
				spaceId,
				kind: reading.kind,
				amount: reading.amount,
				happenedOn: reading.happenedOn,
				description: reading.description,
				accountId: account.id,
				// The plastic, when the line named one or the last spend used one. The account is
				// still the truth, and the model refuses a card that does not reach it.
				cardId,
				status: reading.status,
				installments: reading.installments,
			});
		},
		onSuccess: (rows: Transaction[]) => {
			if (reading.kind === "income" && account) rememberLandingUsed(spaceId, account.id);
			setProblem(null);
			setWritten(
				rows.length > 0
					? { description: reading.description, ids: rows.map((row) => row.id) }
					: null,
			);
			setText("");
			invalidate();
		},
		// It had none. A line that was refused cleared nothing and said nothing, so a
		// record that was never written looked exactly like one that was.
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	const undo = useMutation({
		mutationFn: async () => {
			if (!session || !written) return 0;
			return session.transactions.removeMany(written.ids);
		},
		onSuccess: () => {
			setProblem(null);
			setWritten(null);
			invalidate();
		},
		// And an undo that failed looked exactly like one that worked.
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		if (ready) write.mutate();
	}

	return (
		<form onSubmit={submit} className="space-y-2">
			<Field
				label={t("quick.label")}
				hint={t("quick.hint")}
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder={t("quick.placeholder")}
				autoComplete="off"
				action={
					<Button type="submit" variant="primary" disabled={!ready || write.isPending}>
						{t("quick.add")}
					</Button>
				}
			/>

			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			{text.trim() !== "" ? (
				<p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-quiet">
					{reading.problems.includes("amountMissing") ? (
						<span className="text-ochre">{t("quick.amountMissing")}</span>
					) : null}
					{reading.problems.includes("descriptionMissing") ? (
						<span className="text-ochre">{t("quick.descriptionMissing")}</span>
					) : null}

					{reading.amount !== null ? (
						<>
							<span>{t(`transactionKind.${reading.kind}`)}</span>
							<Value
								amount={reading.kind === "expense" ? -reading.amount : reading.amount}
								currency={account?.currency ?? "BRL"}
								tone="auto"
							/>
						</>
					) : null}
					{reading.description === "" ? null : (
						<span className="text-ink">{reading.description}</span>
					)}
					<span>{dayAndMonth(reading.happenedOn)}</span>
					{account ? <span>{account.name}</span> : null}
					{reading.installments > 1 ? (
						<span>{t("transactions.timesOf", { count: reading.installments })}</span>
					) : null}
					{/* A day ahead waits for its day, and the line says so before it is written. */}
					{hasHappened(reading, today) ? null : (
						<span className="text-ochre">{t("transactionStatus.planned")}</span>
					)}
				</p>
			) : null}

			{written && text.trim() === "" ? (
				<p className="flex items-baseline gap-3 text-sm">
					<span className="text-quiet">
						{written.ids.length > 1
							? t("quick.writtenInParts", {
									description: written.description,
									count: written.ids.length,
								})
							: t("quick.written", { description: written.description })}
					</span>
					<Button size="small" variant="quiet" onClick={() => undo.mutate()}>
						{t("quick.undo")}
					</Button>
				</p>
			) : null}
		</form>
	);
}
