// The smaller things done to one holding: a value from the statement, its history, deleting it.
//
// A value typed wins over the estimate, which starts again from it, and a day older than the
// newest one goes into the line without replacing it. Deleting a movement, or the holding,
// takes the records that moved its money with it, so the dialog says first how much goes back
// to each account.

import type { CurrencyCode } from "@cofre/core";
import type { Account, GoingBack, HoldingValue } from "@cofre/storage";
import {
	Button,
	Callout,
	Dialog,
	Field,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { readAmount } from "../lib/amounts.ts";
import { afterHoldingsChange, HOLDINGS, inUnits, shortDay } from "../lib/holdings.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

function useMoney(currency: string) {
	const { i18n } = useTranslation();
	return (cents: number) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency: currency as CurrencyCode,
		}).format(cents / 100);
}

/** What going back means for each account, in sentences, leaving out the holding's own. */
function GoingBackSentences({
	back,
	holding,
	accounts,
}: {
	back: GoingBack | undefined;
	holding: HoldingValue;
	accounts: readonly Account[];
}) {
	const { t } = useTranslation();
	const money = useMoney(holding.currency);
	if (back === undefined) return <Skeleton lines={1} />;
	const elsewhere = back.filter((one) => one.accountId !== holding.accountId && one.amount !== 0);
	if (elsewhere.length === 0) return <p className="text-sm">{t("investments.nothingGoesBack")}</p>;
	const nameOf = (id: string) => accounts.find((account) => account.id === id)?.name ?? "";
	return (
		<ul className="space-y-1 text-sm">
			{elsewhere.map((one) => (
				<li key={one.accountId}>
					{one.amount > 0
						? t("investments.goesBack", {
								amount: money(one.amount),
								account: nameOf(one.accountId),
							})
						: t("investments.leaves", {
								amount: money(-one.amount),
								account: nameOf(one.accountId),
							})}
				</li>
			))}
		</ul>
	);
}

export function HoldingPriceDialog({
	holding,
	onClose,
	today,
}: {
	holding: HoldingValue | null;
	onClose: () => void;
	today: string;
}) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();
	const [onDay, setOnDay] = useState(today);
	const [value, setValue] = useState("");
	const [problem, setProblem] = useState<string | null>(null);

	const opened = useRef<string | null>(null);
	useEffect(() => {
		const id = holding?.id ?? null;
		if (id === opened.current) return;
		opened.current = id;
		setOnDay(today);
		setValue("");
		setProblem(null);
	}, [holding, today]);

	const units = holding ? inUnits(holding) : false;
	// A holding counted by value has one unit, so its price is the whole of it; one counted
	// in units, the Tesouro Selic too, is the price of one.
	const ofOne = units || holding?.product === "treasurySelic";

	const save = useMutation({
		mutationFn: async () => {
			if (!session || !holding) throw new Error("no session");
			return session.investments.price({
				id: holding.id,
				unitPrice: readAmount(value, holding.currency as CurrencyCode),
				onDay,
			});
		},
		onSuccess: () => {
			onClose();
			afterHoldingsChange(queries);
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	return (
		<Dialog
			open={holding !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title={t("investments.priceTitle", { name: holding?.name ?? "" })}
			description={t("investments.priceDescription")}
			closeLabel={t("actions.close")}
			footer={
				<>
					<Button variant="quiet" onClick={onClose}>
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
					label={t("investments.priceDay")}
					type="date"
					value={onDay}
					max={today}
					onChange={(event) => setOnDay(event.target.value)}
					required={true}
				/>
				<Field
					label={ofOne ? t("investments.fields.unitPrice") : t("investments.statementValue")}
					value={value}
					onChange={(event) => setValue(event.target.value)}
					hint={ofOne ? t("fields.amountHint") : t("investments.statementValueHint")}
					numeric={true}
					required={true}
				/>
				{/* In here, where the person is, and not behind the dialog. */}
				{problem ? <Callout tone="problem">{problem}</Callout> : null}
			</form>
		</Dialog>
	);
}

export function HoldingHistoryDialog({
	holding,
	onClose,
	accounts,
	spaceId,
}: {
	holding: HoldingValue | null;
	onClose: () => void;
	accounts: readonly Account[];
	spaceId: string;
}) {
	const { t, i18n } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();
	const money = useMoney(holding?.currency ?? "BRL");
	const mine = useWhatIMayDo(spaceId);
	const mayRemove = mine.mayCall("investments.removeMove");
	const [dropping, setDropping] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);

	const moves = useQuery({
		queryKey: [HOLDINGS, spaceId, "moves", holding?.id],
		enabled: Boolean(session && holding),
		queryFn: () => (holding ? (session?.investments.moves(holding.id) ?? []) : []),
	});
	const prices = useQuery({
		queryKey: [HOLDINGS, spaceId, "prices", holding?.id],
		enabled: Boolean(session && holding),
		queryFn: () => (holding ? (session?.investments.prices(holding.id) ?? []) : []),
	});
	const back = useQuery({
		queryKey: [HOLDINGS, spaceId, "goingBack", dropping],
		enabled: Boolean(session && dropping),
		queryFn: () => session?.investments.goingBack({ moveId: dropping ?? "" }) ?? [],
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			if (!session) throw new Error("no session");
			return session.investments.removeMove(id);
		},
		onSuccess: () => {
			setDropping(null);
			setProblem(null);
			afterHoldingsChange(queries);
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	const rows = [
		...(moves.data ?? []).map((move) => ({
			key: move.id,
			day: move.onDay,
			what: t(`investments.moveKinds.${move.kind}`),
			amount: move.amount,
			move: move.id,
			linked: move.transactionId !== null,
		})),
		...(prices.data ?? []).map((price) => ({
			key: price.id,
			day: price.onDay,
			what: t("investments.moveKinds.price"),
			amount: price.unitPrice,
			move: null,
			linked: false,
		})),
	].sort((left, right) => (left.day < right.day ? 1 : left.day > right.day ? -1 : 0));

	return (
		<Dialog
			open={holding !== null}
			onOpenChange={(open) => {
				if (!open) {
					setDropping(null);
					onClose();
				}
			}}
			title={t("investments.historyTitle", { name: holding?.name ?? "" })}
			description={t("investments.historyDescription")}
			closeLabel={t("actions.close")}
			size="large"
		>
			{moves.isPending || prices.isPending ? <Skeleton lines={3} /> : null}
			{!moves.isPending && rows.length === 0 ? (
				<p className="text-sm">{t("investments.historyEmpty")}</p>
			) : null}
			{rows.length > 0 ? (
				<Table caption={t("investments.historyCaption")}>
					<TableHead>
						<TableRow>
							<TableHeader>{t("investments.moveDay")}</TableHeader>
							<TableHeader>{t("investments.historyWhat")}</TableHeader>
							<TableHeader numeric={true}>{t("fields.amount")}</TableHeader>
							<TableHeader>
								<span className="sr-only">{t("investments.actions")}</span>
							</TableHeader>
						</TableRow>
					</TableHead>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.key}>
								<TableCell>{shortDay(row.day, i18n.resolvedLanguage)}</TableCell>
								<TableCell>
									{row.what}
									{row.linked ? (
										<span className="block text-quiet text-xs">{t("investments.withRecord")}</span>
									) : null}
								</TableCell>
								<TableCell numeric={true}>{money(row.amount)}</TableCell>
								<TableCell>
									{row.move && mayRemove ? (
										<Button
											size="small"
											variant="quiet"
											onClick={() => {
												setProblem(null);
												setDropping(row.move);
											}}
										>
											{t("actions.delete")}
										</Button>
									) : null}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : null}

			{dropping && holding ? (
				<Callout tone="attention" title={t("investments.dropMoveTitle")}>
					<GoingBackSentences back={back.data} holding={holding} accounts={accounts} />
					<div className="mt-3 flex gap-2">
						<Button
							variant="destructive"
							size="small"
							disabled={remove.isPending || back.isPending}
							onClick={() => remove.mutate(dropping)}
						>
							{t("investments.dropMove")}
						</Button>
						<Button variant="quiet" size="small" onClick={() => setDropping(null)}>
							{t("actions.cancel")}
						</Button>
					</div>
				</Callout>
			) : null}
			{problem ? <Callout tone="problem">{problem}</Callout> : null}
		</Dialog>
	);
}

export function HoldingRemoveDialog({
	holding,
	onClose,
	accounts,
	spaceId,
}: {
	holding: HoldingValue | null;
	onClose: () => void;
	accounts: readonly Account[];
	spaceId: string;
}) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();
	const [problem, setProblem] = useState<string | null>(null);

	const back = useQuery({
		queryKey: [HOLDINGS, spaceId, "goingBack", "holding", holding?.id],
		enabled: Boolean(session && holding),
		queryFn: () => session?.investments.goingBack({ holdingId: holding?.id ?? "" }) ?? [],
	});

	const remove = useMutation({
		mutationFn: async () => {
			if (!session || !holding) throw new Error("no session");
			return session.investments.remove(holding.id);
		},
		onSuccess: () => {
			setProblem(null);
			onClose();
			afterHoldingsChange(queries);
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	return (
		<Dialog
			open={holding !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title={t("investments.removeTitle", { name: holding?.name ?? "" })}
			description={t("investments.removeDescription")}
			closeLabel={t("actions.close")}
			footer={
				<>
					<Button variant="quiet" onClick={onClose}>
						{t("actions.cancel")}
					</Button>
					<Button
						variant="destructive"
						onClick={() => remove.mutate()}
						disabled={remove.isPending || back.isPending}
					>
						{t("investments.removeConfirm")}
					</Button>
				</>
			}
		>
			{holding ? (
				<GoingBackSentences back={back.data} holding={holding} accounts={accounts} />
			) : null}
			{problem ? <Callout tone="problem">{problem}</Callout> : null}
		</Dialog>
	);
}
