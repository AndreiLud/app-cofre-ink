// A record that was really money moved between two accounts of the same person.
//
// A statement says what left the current account and not where it went, so a Pix into
// savings arrives as money out, and the importer of 1.x wrote the payment of an invoice as
// money out of the bank and again as money in on the card. This asks for the other end and,
// for a card, which invoice was paid, and then offers to take away the same move written on
// the other account, so the money is not counted twice.

import { addDays, type CalendarDate } from "@cofre/core";
import type { Account, Transaction } from "@cofre/storage";
import { isMirrorOf } from "@cofre/storage";
import { Button, Callout, Dialog, Select } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { afterRecordsChange } from "../lib/afterRecords.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions } from "../lib/wayLabel.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { movesInto, movesOutOf } from "./MoveDialog.tsx";

export type ToTransferDialogProps = {
	/** The record being turned into a move, or nothing while the dialog is closed. */
	record: Transaction | null;
	onClose: () => void;
	/** Every account of the space, archived ones too, so an old record still finds its own. */
	accounts: Account[];
	today: CalendarDate;
};

/** Which side of a move a record is, or nothing when it cannot be one. */
export function sideOfMove(
	record: Transaction,
	accounts: readonly Account[],
): "out" | "in" | "card" | null {
	if (record.kind === "transfer" || record.reconciledAt !== null) return null;
	if (record.installmentGroup !== null || record.recurrenceId !== null) return null;
	const own = accounts.find((account) => account.id === record.accountId);
	if (!own) return null;
	const holdsMoney = own.kind === "checking" || own.kind === "savings" || own.kind === "cash";
	if (record.kind === "expense" && holdsMoney) return "out";
	if (record.kind === "income" && holdsMoney) return "in";
	if (record.kind === "income" && own.kind === "credit") return "card";
	return null;
}

export function ToTransferDialog({ record, onClose, accounts, today }: ToTransferDialogProps) {
	const { t, i18n } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

	const [otherId, setOtherId] = useState("");
	const [month, setMonth] = useState("");
	const [join, setJoin] = useState(true);
	const [problem, setProblem] = useState<string | null>(null);

	const side = record ? sideOfMove(record, accounts) : null;
	const others = record
		? accounts.filter((account) => {
				if (account.id === record.accountId) return false;
				if (side === "out")
					return movesInto(account) || (account.kind === "credit" && account.archivedAt === null);
				return movesOutOf(account);
			})
		: [];
	const other = others.find((account) => account.id === otherId);
	/** The card whose invoice the money paid, when one end is a card. */
	const cardId = side === "card" ? record?.accountId : other?.kind === "credit" ? other.id : null;

	// Opening on another record is what resets it, once, on the first account it can be.
	const shownFor = useRef<string | null>(null);
	const first = others[0]?.id ?? "";
	useEffect(() => {
		const id = record?.id ?? null;
		if (id === shownFor.current) return;
		shownFor.current = id;
		setOtherId(first);
		setMonth("");
		setJoin(true);
		setProblem(null);
	}, [record, first]);

	const invoices = useQuery({
		queryKey: ["invoices", "list", cardId, today],
		enabled: Boolean(session && cardId),
		queryFn: () => (cardId && session ? session.invoices.list(cardId, today) : []),
	});

	// The invoice the payment most likely paid: one already closed on the day it was made,
	// whose due day is the nearest to it.
	useEffect(() => {
		if (!record || !invoices.data || invoices.data.length === 0) return;
		const closed = invoices.data.filter((one) => one.closesOn <= record.happenedOn);
		const pool = closed.length > 0 ? closed : invoices.data;
		const distance = (day: string) =>
			Math.abs(Date.parse(`${day}T00:00:00Z`) - Date.parse(`${record.happenedOn}T00:00:00Z`));
		const best = [...pool].sort((left, right) => distance(left.dueOn) - distance(right.dueOn))[0];
		setMonth(best?.month ?? "");
	}, [record, invoices.data]);

	// The same move written on the other account, a few days either side.
	const mirror = useQuery({
		queryKey: ["transactions", "mirror", record?.id, otherId],
		enabled: Boolean(session && record && otherId !== ""),
		queryFn: async () => {
			if (!session || !record) return null;
			const near = await session.transactions.list({
				spaceId: record.spaceId,
				accountId: otherId,
				from: addDays(record.happenedOn as CalendarDate, -3),
				to: addDays(record.happenedOn as CalendarDate, 3),
			});
			return near.find((candidate) => isMirrorOf(record, candidate, otherId)) ?? null;
		},
	});

	const save = useMutation({
		mutationFn: async () => {
			if (!session || !record) return;
			await session.transactions.toTransfer(record.id, {
				otherAccountId: otherId,
				invoiceMonth: cardId ? month || null : null,
				mergeWith: join && mirror.data ? mirror.data.id : null,
			});
		},
		onSuccess: () => {
			onClose();
			afterRecordsChange(queries);
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	const monthName = (value: string) =>
		new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			month: "long",
			year: "numeric",
			timeZone: "UTC",
		}).format(new Date(`${value}-01T00:00:00Z`));

	return (
		<Dialog
			open={record !== null}
			onOpenChange={(next) => !next && onClose()}
			title={t("toMove.title")}
			description={t("toMove.explain")}
			closeLabel={t("actions.close")}
			footer={
				<>
					<Button variant="quiet" onClick={onClose}>
						{t("actions.cancel")}
					</Button>
					<Button
						variant="primary"
						onClick={() => save.mutate()}
						disabled={save.isPending || otherId === "" || (cardId !== null && month === "")}
					>
						{t("actions.save")}
					</Button>
				</>
			}
		>
			<div className="space-y-4">
				<Select
					label={side === "out" ? t("toMove.wentTo") : t("toMove.cameFrom")}
					value={otherId}
					onChange={(event) => setOtherId(event.target.value)}
					options={accountOptions(others, t)}
				/>
				{cardId ? (
					<Select
						label={t("toMove.invoicePaid")}
						value={month}
						onChange={(event) => setMonth(event.target.value)}
						options={[...(invoices.data ?? [])].reverse().map((one) => ({
							value: one.month,
							label: t("toMove.invoiceOption", {
								month: monthName(one.month),
								day: `${one.dueOn.slice(8)}/${one.dueOn.slice(5, 7)}`,
							}),
						}))}
					/>
				) : null}
				<p className="text-quiet text-sm">{t("toMove.keeps")}</p>
				{mirror.data ? (
					<label className="flex items-start gap-3 text-sm">
						<input
							type="checkbox"
							checked={join}
							onChange={(event) => setJoin(event.target.checked)}
							className="mt-1 size-4 accent-[var(--ink)]"
						/>
						<span className="text-ink">
							{t("toMove.join", {
								description: mirror.data.description,
								day: `${mirror.data.happenedOn.slice(8)}/${mirror.data.happenedOn.slice(5, 7)}`,
							})}
						</span>
					</label>
				) : null}
				{problem ? <Callout tone="problem">{problem}</Callout> : null}
			</div>
		</Dialog>
	);
}
