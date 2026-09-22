// One line instead of a form.
//
// Most records are written in a hurry, standing at a counter, and the form asks for
// five things. This asks for one, reads it, and shows what it understood before
// writing anything. Nothing is guessed silently: what it could not find is said out
// loud, and what it did find can be undone in one click.

import { type QuickEntryReading, readQuickEntry } from "@cofre/core";
import type { Account, Transaction } from "@cofre/storage";
import { Button, Field } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

	const usable = useMemo(
		() => accounts.filter((account) => account.archivedAt === null),
		[accounts],
	);

	const reading: QuickEntryReading = useMemo(
		() => readQuickEntry(text, { today, accounts: usable }),
		[text, today, usable],
	);

	// A line that names no account goes to the first one, which is the one the person
	// uses most in a list sorted by name. The sentence below says which, so it is a
	// statement and not a surprise.
	const account = usable.find((option) => option.id === reading.accountId) ?? usable[0] ?? null;
	const ready = reading.problems.length === 0 && account !== null;

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["transactions"] });
		void queries.invalidateQueries({ queryKey: ["balances"] });
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
				status: reading.status,
				installments: reading.installments,
			});
		},
		onSuccess: (rows: Transaction[]) => {
			setWritten(
				rows.length > 0
					? { description: reading.description, ids: rows.map((row) => row.id) }
					: null,
			);
			setText("");
			invalidate();
		},
	});

	const undo = useMutation({
		mutationFn: async () => {
			if (!session || !written) return 0;
			return session.transactions.removeMany(written.ids);
		},
		onSuccess: () => {
			setWritten(null);
			invalidate();
		},
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		if (ready) write.mutate();
	}

	return (
		<form onSubmit={submit} className="space-y-2">
			<div className="flex items-end gap-3">
				<div className="grow">
					<Field
						label={t("quick.label")}
						hint={t("quick.hint")}
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder={t("quick.placeholder")}
						autoComplete="off"
					/>
				</div>
				<Button type="submit" variant="primary" disabled={!ready || write.isPending}>
					{t("quick.add")}
				</Button>
			</div>

			{text.trim() !== "" ? (
				<p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-graphite">
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
					{reading.status === "planned" ? (
						<span className="text-ochre">{t("transactionStatus.planned")}</span>
					) : null}
				</p>
			) : null}

			{written && text.trim() === "" ? (
				<p className="flex items-baseline gap-3 text-sm">
					<span className="text-graphite">
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
