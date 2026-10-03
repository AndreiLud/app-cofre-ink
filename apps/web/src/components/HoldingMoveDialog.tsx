// Money into a holding, out of it, or paid by it.
//
// Guardar and Resgatar for what is counted by value, a caixinha or a CDB; Comprar and Vender
// for what is counted in units, a share or a fund; Proventos for what a holding pays. When
// the money came from an account, or went to one, the record that moved it is written in the
// same write as the movement, and the two are changed and deleted together, here and nowhere
// else (part 2, H.3 of 2.0.0).
//
// Taking money out shows what reaches the account after the tax of today's table, and the
// person corrects it to what the bank deposited: the movement keeps what left the holding,
// the record what arrived, and the difference is the tax, which is not money spent.

import type { CurrencyCode } from "@cofre/core";
import type { Account, HoldingMoveKind, HoldingValue } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Select } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fillAmount, readAmount, readAmountOrZero } from "../lib/amounts.ts";
import { afterHoldingsChange, inUnits, productOf, readUnits } from "../lib/holdings.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions } from "../lib/wayLabel.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";
import { movesOutOf } from "./MoveDialog.tsx";

/** Scaled by ten to the eighth, like every quantity. */
const SCALE = 100_000_000;

export type HoldingMoveDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	spaceId: string;
	holding: HoldingValue | null;
	kind: HoldingMoveKind;
	accounts: readonly Account[];
	/** Today where the space lives, which a movement opens on. */
	today: string;
	/** What is already known when it is opened from a goal or the savings rule, as typed. */
	amount?: string;
	/** The account the money comes from, when the door it was opened from knows. */
	fromId?: string;
};

export function HoldingMoveDialog({
	open,
	onOpenChange,
	spaceId,
	holding,
	kind,
	accounts,
	today,
	amount: startAmount,
	fromId,
}: HoldingMoveDialogProps) {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();
	const currency = (holding?.currency ?? currentSpace?.baseCurrency ?? "BRL") as CurrencyCode;
	// The record of the money is a record, which is a question of its own.
	const mayTouchAccounts = useWhatIMayDo(spaceId).mayCall("transactions.create");

	const units = holding ? inUnits(holding) : false;
	const places = holding ? productOf(holding).quantityPlaces : 2;

	const [onDay, setOnDay] = useState(today);
	const [amount, setAmount] = useState("");
	const [quantity, setQuantity] = useState("");
	const [unitPrice, setUnitPrice] = useState("");
	const [accountId, setAccountId] = useState("");
	const [arrived, setArrived] = useState("");
	/** Whether the person typed what arrived, after which it is theirs and not worked out. */
	const arrivedTouched = useRef(false);
	const [problem, setProblem] = useState<string | null>(null);

	const reachable = accounts.filter(movesOutOf);

	// Opening resets it, once, with the current account first, because that is where money
	// usually leaves from and arrives to.
	const opened = useRef(false);
	useEffect(() => {
		const opening = open && !opened.current;
		opened.current = open;
		if (!opening) return;
		setOnDay(today);
		setAmount(startAmount ?? "");
		setQuantity("");
		setUnitPrice("");
		setArrived("");
		arrivedTouched.current = false;
		setProblem(null);
		const usable = accounts.filter(movesOutOf);
		const first =
			usable.find((account) => account.id === fromId) ??
			usable.find((account) => account.kind === "checking") ??
			usable[0];
		setAccountId(mayTouchAccounts && kind !== "income" ? (first?.id ?? "") : "");
	}, [open, today, startAmount, fromId, accounts, kind, mayTouchAccounts]);

	/** What left or went in, in minor units: typed, or the units times their price. */
	function total(): number {
		if (!units || kind === "income") return readAmount(amount, currency);
		const count = readUnits(quantity, places);
		const price = readAmount(unitPrice, currency);
		return Math.round((count * price) / SCALE);
	}
	const totalNow = (() => {
		try {
			return total();
		} catch {
			return 0;
		}
	})();

	/**
	 * What reaches the account of what leaves, after the tax of today's table: the share of the
	 * holding taken out, at what the whole of it would leave. A guess for the person to correct,
	 * because the bank takes the oldest deposits first and knows the days to the hour.
	 */
	const expected =
		kind === "out" && holding?.net && holding.value > 0 && totalNow > 0
			? Math.round((totalNow * holding.net.net) / holding.value)
			: null;
	useEffect(() => {
		if (arrivedTouched.current) return;
		setArrived(expected === null ? "" : fillAmount(expected, i18n.resolvedLanguage, currency));
	}, [expected, i18n.resolvedLanguage, currency]);
	const arrivedNow = arrived.trim() === "" ? totalNow : readAmountOrZero(arrived, currency);
	const tax = kind === "out" && accountId !== "" ? totalNow - arrivedNow : 0;

	const money = (cents: number) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency,
		}).format(cents / 100);

	const save = useMutation({
		mutationFn: async () => {
			if (!session || !holding) throw new Error("no session");
			const value = total();
			return session.investments.move({
				holdingId: holding.id,
				kind,
				onDay,
				amount: value,
				quantity: units && kind !== "income" ? readUnits(quantity, places) : null,
				unitPrice: units && kind !== "income" ? readAmount(unitPrice, currency) : null,
				accountId: accountId === "" ? null : accountId,
				arrived: kind === "out" && accountId !== "" && arrived.trim() !== "" ? arrivedNow : null,
			});
		},
		onSuccess: () => {
			onOpenChange(false);
			afterHoldingsChange(queries);
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	const name = holding?.name ?? "";
	const which = kind === "income" ? "income" : units ? (kind === "in" ? "buy" : "sell") : kind;
	const accountLabel =
		kind === "in"
			? t("investments.moveFrom")
			: kind === "out"
				? t("investments.moveTo")
				: t("investments.incomeTo");
	const noAccount =
		kind === "in"
			? t("investments.fromOutside")
			: kind === "out"
				? t("investments.toOutside")
				: t("investments.incomeOutside");

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={t(`investments.moveTitle.${which}`, { name })}
			description={t(`investments.moveBody.${kind}`)}
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
			<form className="space-y-4" onSubmit={submit}>
				<Field
					label={t("investments.moveDay")}
					type="date"
					value={onDay}
					onChange={(event) => setOnDay(event.target.value)}
					required={true}
				/>
				{units && kind !== "income" ? (
					<div className="grid gap-4 sm:grid-cols-2">
						<Field
							label={t("investments.fields.quantity")}
							value={quantity}
							onChange={(event) => setQuantity(event.target.value)}
							hint={places === 0 ? t("investments.wholeUnits") : t("investments.quantityHint")}
							numeric={true}
							required={true}
						/>
						<Field
							label={t("investments.fields.unitPrice")}
							value={unitPrice}
							onChange={(event) => setUnitPrice(event.target.value)}
							hint={t("fields.amountHint")}
							numeric={true}
							required={true}
						/>
					</div>
				) : (
					<Field
						label={kind === "out" ? t("investments.leftTheHolding") : t("investments.howMuch")}
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						hint={t("fields.amountHint")}
						numeric={true}
						required={true}
					/>
				)}
				{units && kind !== "income" && totalNow > 0 ? (
					<p className="text-sm text-quiet">
						{t("investments.totalIs", { amount: money(totalNow) })}
					</p>
				) : null}

				{mayTouchAccounts ? (
					<Select
						label={accountLabel}
						value={accountId}
						onChange={(event) => setAccountId(event.target.value)}
						options={[{ value: "", label: noAccount }, ...accountOptions(reachable, t)]}
						hint={kind === "income" ? t("investments.incomeHint") : undefined}
					/>
				) : null}

				{kind === "out" && accountId !== "" ? (
					<Field
						label={t("investments.arrived")}
						value={arrived}
						onChange={(event) => {
							arrivedTouched.current = true;
							setArrived(event.target.value);
						}}
						hint={
							holding?.net
								? t("investments.arrivedHint")
								: holding?.exempt
									? t("investments.arrivedExempt")
									: t("investments.arrivedPlain")
						}
						numeric={true}
					/>
				) : null}
				{tax > 0 ? (
					<p className="text-sm text-quiet">{t("investments.taxIs", { amount: money(tax) })}</p>
				) : null}

				{problem ? <Callout tone="problem">{problem}</Callout> : null}
			</form>
		</Dialog>
	);
}
