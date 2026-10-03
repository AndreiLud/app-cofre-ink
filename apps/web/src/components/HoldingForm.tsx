// Writing down a holding, in two steps: what it is, and then only what that asks for.
//
// The form asked every holding for a quantity, a price today and a cost, which a caixinha has
// none of: somebody with R$ 10.000,00 in one typed a quantity of one and a price of ten
// thousand, and it never grew. Now the first step is the product, as the statement calls it,
// and the second is the fields of that product in packages/core, so a caixinha asks how much
// of the CDI it earns and a share asks for its code on the B3.
//
// The institution is an investment account of the space, which can be written down here: a
// holding lives in one, and the account is worth what its holdings are worth. Correcting a
// holding from before 2.0.0 starts at the first step too, which is how one gets a product.

import {
	type CalendarDate,
	type CurrencyCode,
	productOf as catalogProduct,
	PRODUCTS,
	type Product,
	type ProductField,
	type ProductId,
} from "@cofre/core";
import type { Account, AccountBalance, HoldingValue } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Select } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fillAmount, readAmount, readPercent } from "../lib/amounts.ts";
import { afterHoldingsChange, readUnits } from "../lib/holdings.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions } from "../lib/wayLabel.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";
import { movesOutOf } from "./MoveDialog.tsx";

/** Scaled by ten to the eighth, like every quantity. */
const SCALE = 100_000_000;

/** The value of "a new investment account" in the list of institutions. */
const NEW_ACCOUNT = "new";

/**
 * The groups of the first step, in their order: three with a heading of their own, and the
 * four that are a group alone together under one.
 */
const STEP_GROUPS: { key: "daily" | "fixedIncome" | "exchange" | "more"; ids: ProductId[] }[] = [
	{ key: "daily", ids: PRODUCTS.filter((one) => one.group === "daily").map((one) => one.id) },
	{
		key: "fixedIncome",
		ids: PRODUCTS.filter((one) => one.group === "fixedIncome").map((one) => one.id),
	},
	{ key: "exchange", ids: PRODUCTS.filter((one) => one.group === "exchange").map((one) => one.id) },
	{
		key: "more",
		ids: PRODUCTS.filter((one) => ["fund", "crypto", "pension", "other"].includes(one.group)).map(
			(one) => one.id,
		),
	},
];

/** The fields that say what was put in, which only a new holding asks for. */
const OPENING: readonly ProductField[] = ["amount", "since", "unitPrice"];

/** The code of the B3 in capitals, without the F of the fractional market. */
export function tickerOf(text: string, product: Product): string {
	const code = text.trim().toUpperCase();
	if (product.group !== "exchange") return code;
	return /^[A-Z]{4}\d{1,2}F$/.test(code) ? code.slice(0, -1) : code;
}

export type HoldingFormProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	spaceId: string;
	/** The holding being corrected, or nothing for a new one. */
	editing: HoldingValue | null;
	accounts: readonly Account[];
	holdings: readonly HoldingValue[];
	balances: readonly AccountBalance[];
	today: string;
	/** The account a new holding starts in, when it was opened from one. */
	accountId?: string;
};

export function HoldingForm({
	open,
	onOpenChange,
	spaceId,
	editing,
	accounts,
	holdings,
	balances,
	today,
	accountId: startAccount,
}: HoldingFormProps) {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();
	const formId = useId();
	const currency = (currentSpace?.baseCurrency ?? "BRL") as CurrencyCode;
	const mine = useWhatIMayDo(spaceId);
	const mayOpenAccount = mine.mayCall("accounts.create");
	const mayMoveMoney = mine.mayCall("transactions.create");

	const [step, setStep] = useState<"what" | "fields">("what");
	const [productId, setProductId] = useState<ProductId | "">("");
	const [name, setName] = useState("");
	const [issuer, setIssuer] = useState("");
	const [indexer, setIndexer] = useState("");
	const [rate, setRate] = useState("");
	const [maturesOn, setMaturesOn] = useState("");
	const [liquidity, setLiquidity] = useState("");
	const [ticker, setTicker] = useState("");
	const [quantity, setQuantity] = useState("");
	const [unitPrice, setUnitPrice] = useState("");
	const [amount, setAmount] = useState("");
	const [since, setSince] = useState("");
	const [anniversaryDay, setAnniversaryDay] = useState("");
	const [cost, setCost] = useState("");
	const [accountId, setAccountId] = useState("");
	const [newAccount, setNewAccount] = useState("");
	const [fromId, setFromId] = useState("");
	const [keepCash, setKeepCash] = useState(true);
	const [problem, setProblem] = useState<string | null>(null);

	const product = productId === "" ? null : catalogProduct(productId);
	const investmentAccounts = accounts.filter(
		(account) => account.kind === "investment" && account.archivedAt === null,
	);
	const origins = accounts.filter(movesOutOf);

	// Opening resets it, once, from the holding being corrected or to nothing.
	const opened = useRef(false);
	useEffect(() => {
		const opening = open && !opened.current;
		opened.current = open;
		if (!opening) return;
		setProblem(null);
		setNewAccount("");
		setFromId("");
		setKeepCash(true);
		setQuantity("");
		setUnitPrice("");
		setAmount("");
		setSince("");
		if (editing) {
			const known = editing.product ? catalogProduct(editing.product) : null;
			// A holding from before 2.0.0 is asked what it is first.
			setStep(known ? "fields" : "what");
			setProductId(known?.id ?? "");
			setName(editing.name);
			setIssuer(editing.issuer ?? "");
			setIndexer(editing.indexer ?? known?.indexers[0] ?? "");
			const point = i18n.resolvedLanguage === "en" ? "." : ",";
			setRate(editing.rate === null ? "" : String(editing.rate / 100).replace(".", point));
			setMaturesOn(editing.maturesOn ?? "");
			setLiquidity(editing.liquidity ?? "");
			setTicker(editing.ticker ?? "");
			setQuantity(String(editing.quantity / SCALE).replace(".", point));
			setAnniversaryDay(editing.anniversaryDay === null ? "" : String(editing.anniversaryDay));
			setCost(fillAmount(editing.cost, i18n.resolvedLanguage, currency));
			const inside = accounts.find(
				(account) => account.id === editing.accountId && account.kind === "investment",
			);
			setAccountId(inside?.id ?? "");
			return;
		}
		setStep("what");
		setProductId("");
		setName("");
		setIssuer("");
		setIndexer("");
		setRate("");
		setMaturesOn("");
		setLiquidity("");
		setTicker("");
		setAnniversaryDay("");
		setCost("");
		const usable = accounts.filter(
			(account) => account.kind === "investment" && account.archivedAt === null,
		);
		setAccountId(
			usable.find((account) => account.id === startAccount)?.id ??
				usable[0]?.id ??
				(mayOpenAccount ? NEW_ACCOUNT : ""),
		);
	}, [open, editing, accounts, startAccount, mayOpenAccount, i18n.resolvedLanguage, currency]);

	function choose(id: ProductId) {
		const chosen = catalogProduct(id);
		if (!chosen) return;
		setProductId(id);
		setIndexer(chosen.indexers[0] ?? "");
		// What most caixinhas pay, which the person changes when theirs pays more.
		if (id === "box" && rate === "") setRate("100");
		if (chosen.fields.includes("liquidity") && liquidity === "") setLiquidity("daily");
		setStep("fields");
		setProblem(null);
	}

	/** The balance of an investment account with no holding yet, which is asked about. */
	const chosenAccount = investmentAccounts.find((account) => account.id === accountId);
	const cashThere =
		!editing && chosenAccount && !holdings.some((one) => one.accountId === chosenAccount.id)
			? (balances.find((one) => one.accountId === chosenAccount.id)?.settled ??
				chosenAccount.initialBalance)
			: 0;

	const money = (cents: number) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency,
		}).format(cents / 100);

	/** The name of a holding whose product asks for none: the product and what tells it apart. */
	function nameOf(chosen: Product): string {
		if (chosen.fields.includes("name") && name.trim() !== "") return name.trim();
		const code = chosen.fields.includes("ticker") ? tickerOf(ticker, chosen) : "";
		if (code !== "") return code;
		// A holding being corrected keeps the name it was given.
		if (editing) return editing.name;
		const label = t(`investments.products.${chosen.id}`);
		if (chosen.fields.includes("issuer") && issuer.trim() !== "") {
			return `${label} ${issuer.trim()}`;
		}
		if (maturesOn !== "") return `${label} ${maturesOn.slice(0, 4)}`;
		return label;
	}

	const save = useMutation({
		mutationFn: async () => {
			if (!session || !product) throw new Error("no session");
			let account = accountId;
			if (account === NEW_ACCOUNT) {
				const made = await session.accounts.create({
					spaceId,
					kind: "investment",
					name: newAccount.trim(),
					currency,
					initialBalance: 0,
				});
				account = made.id;
			}
			const asks = (field: ProductField) => product.fields.includes(field);
			const fields = {
				product: product.id,
				issuer: asks("issuer") ? issuer.trim() || null : null,
				indexer: indexer === "" ? null : indexer,
				// Hundredths of a point, which is what reading a percentage gives: 100% is 10000.
				rate: asks("rate") && rate.trim() !== "" ? readPercent(rate) : null,
				maturesOn: asks("maturesOn") && maturesOn !== "" ? (maturesOn as CalendarDate) : null,
				liquidity: asks("liquidity") && liquidity !== "" ? liquidity : null,
				anniversaryDay:
					asks("anniversaryDay") && anniversaryDay !== "" ? Number(anniversaryDay) : null,
			};

			if (editing) {
				return session.investments.update(editing.id, {
					...fields,
					name: nameOf(product),
					ticker: asks("ticker") ? tickerOf(ticker, product) : null,
					...(asks("quantity") ? { quantity: readUnits(quantity, product.quantityPlaces) } : {}),
					cost: cost.trim() === "" ? 0 : readAmount(cost, currency),
					accountId: account,
				});
			}

			// Counted by value: one unit whose price is the whole of it.
			const byValue = asks("amount");
			return session.investments.create({
				spaceId,
				accountId: account,
				...fields,
				name: nameOf(product),
				ticker: asks("ticker") ? tickerOf(ticker, product) : null,
				quantity: byValue ? SCALE : readUnits(quantity, product.quantityPlaces),
				unitPrice: byValue ? readAmount(amount, currency) : readAmount(unitPrice, currency),
				boughtOn: since === "" ? null : (since as CalendarDate),
				fromAccountId: fromId === "" ? null : fromId,
				keepBalanceAsCash: cashThere > 0 && keepCash,
			});
		},
		onSuccess: () => {
			onOpenChange(false);
			afterHoldingsChange(queries);
			void queries.invalidateQueries({ queryKey: ["accounts"] });
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	/** One field of the product, as its own control. */
	function control(field: ProductField, chosen: Product) {
		const required = chosen.required.includes(field);
		switch (field) {
			case "name":
				return (
					<Field
						key={field}
						label={t("investments.fields.name")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t(`investments.namePlaceholders.${chosen.group}`)}
						required={required}
					/>
				);
			case "issuer":
				return (
					<Field
						key={field}
						label={t("investments.fields.issuer")}
						value={issuer}
						onChange={(event) => setIssuer(event.target.value)}
						hint={t("investments.issuerHint")}
						required={required}
					/>
				);
			case "indexer":
				return chosen.indexers.length > 1 ? (
					<Select
						key={field}
						label={t("investments.fields.indexer")}
						value={indexer}
						onChange={(event) => setIndexer(event.target.value)}
						options={chosen.indexers.map((one) => ({
							value: one,
							label: t(`investments.indexers.${one}`),
						}))}
					/>
				) : null;
			case "rate":
				return (
					<Field
						key={field}
						label={
							indexer === "cdi" || indexer === "prefixed" || indexer === "ipca"
								? t(`investments.rates.${indexer}`)
								: t("investments.fields.rate")
						}
						value={rate}
						onChange={(event) => setRate(event.target.value)}
						hint={indexer === "ipca" ? t("investments.ipcaTyped") : undefined}
						numeric={true}
						required={required}
					/>
				);
			case "maturesOn":
				return (
					<Field
						key={field}
						label={t("investments.fields.maturesOn")}
						type="date"
						value={maturesOn}
						onChange={(event) => setMaturesOn(event.target.value)}
						required={required}
					/>
				);
			case "liquidity":
				return (
					<Select
						key={field}
						label={t("investments.fields.liquidity")}
						value={liquidity}
						onChange={(event) => setLiquidity(event.target.value)}
						options={["daily", "atMaturity"].map((one) => ({
							value: one,
							label: t(`investments.liquidities.${one}`),
						}))}
					/>
				);
			case "ticker":
				return (
					<Field
						key={field}
						label={t("investments.fields.ticker")}
						value={ticker}
						onChange={(event) => setTicker(event.target.value.toUpperCase())}
						hint={chosen.group === "exchange" ? t("investments.tickerHint") : undefined}
						autoCapitalize="characters"
						required={required}
					/>
				);
			case "quantity":
				return (
					<Field
						key={field}
						label={t("investments.fields.quantity")}
						value={quantity}
						onChange={(event) => setQuantity(event.target.value)}
						hint={
							chosen.quantityPlaces === 0
								? t("investments.wholeUnits")
								: t("investments.quantityHint")
						}
						numeric={true}
						required={required}
					/>
				);
			case "unitPrice":
				return (
					<Field
						key={field}
						label={
							chosen.group === "exchange" || chosen.group === "crypto"
								? t("investments.averagePrice")
								: t("investments.fields.unitPrice")
						}
						value={unitPrice}
						onChange={(event) => setUnitPrice(event.target.value)}
						hint={t("fields.amountHint")}
						numeric={true}
						required={required}
					/>
				);
			case "amount": {
				const typed = chosen.valuation(null) === "typed";
				return (
					<Field
						key={field}
						label={typed ? t("investments.amountToday") : t("investments.fields.amount")}
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						hint={typed ? t("fields.amountHint") : t("investments.amountHint")}
						numeric={true}
						required={required}
					/>
				);
			}
			case "since":
				return (
					<Field
						key={field}
						label={t("investments.fields.since")}
						type="date"
						value={since}
						onChange={(event) => setSince(event.target.value)}
						hint={required ? undefined : t("investments.sinceHint")}
						max={today}
						required={required}
					/>
				);
			case "anniversaryDay":
				return (
					<Select
						key={field}
						label={t("investments.fields.anniversaryDay")}
						value={anniversaryDay}
						onChange={(event) => setAnniversaryDay(event.target.value)}
						hint={t("investments.anniversaryHint")}
						options={[
							{ value: "", label: t("investments.chooseDay") },
							...Array.from({ length: 28 }, (_unused, index) => ({
								value: String(index + 1),
								label: String(index + 1),
							})),
						]}
						required={required}
					/>
				);
		}
	}

	const shownFields = product
		? product.fields.filter((field) => !editing || !OPENING.includes(field))
		: [];

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={editing ? t("investments.editTitle", { name: editing.name }) : t("investments.add")}
			description={
				step === "what"
					? editing
						? t("investments.giveAProduct")
						: t("investments.addDescription")
					: t("investments.fieldsDescription")
			}
			closeLabel={t("actions.close")}
			size="large"
			footer={
				step === "what" ? (
					<Button variant="quiet" onClick={() => onOpenChange(false)}>
						{t("actions.cancel")}
					</Button>
				) : (
					<>
						<Button variant="quiet" onClick={() => onOpenChange(false)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="primary" type="submit" form={formId} disabled={save.isPending}>
							{t("actions.save")}
						</Button>
					</>
				)
			}
		>
			{step === "what" || !product ? (
				<div className="space-y-5">
					<p className="font-medium text-sm">{t("investments.whatIsIt")}</p>
					{STEP_GROUPS.map((group) => (
						<fieldset key={group.key} className="space-y-2">
							<legend className="text-quiet text-xs uppercase tracking-wide">
								{t(`investments.groups.${group.key}`)}
							</legend>
							<div className="flex flex-wrap gap-2">
								{group.ids.map((id) => (
									<Button
										key={id}
										size="small"
										variant={productId === id ? "primary" : "secondary"}
										aria-pressed={productId === id}
										onClick={() => choose(id)}
									>
										{t(`investments.products.${id}`)}
									</Button>
								))}
							</div>
						</fieldset>
					))}
				</div>
			) : (
				<form id={formId} className="space-y-4" onSubmit={submit}>
					<div className="flex items-center justify-between gap-3 border-line border-b pb-3">
						<p className="font-medium text-sm">{t(`investments.products.${product.id}`)}</p>
						{!editing || editing.product === null ? (
							<Button size="small" variant="quiet" onClick={() => setStep("what")}>
								{t("investments.otherProduct")}
							</Button>
						) : null}
					</div>

					<Select
						label={t("investments.institution")}
						value={accountId}
						onChange={(event) => setAccountId(event.target.value)}
						hint={t("investments.institutionHint")}
						options={[
							...(accountId === ""
								? [{ value: "", label: t("investments.chooseInstitution") }]
								: []),
							...accountOptions(investmentAccounts, t),
							...(mayOpenAccount && !editing
								? [{ value: NEW_ACCOUNT, label: t("investments.newInstitution") }]
								: []),
						]}
						required={true}
					/>
					{accountId === NEW_ACCOUNT ? (
						<Field
							label={t("investments.newInstitutionName")}
							value={newAccount}
							onChange={(event) => setNewAccount(event.target.value)}
							placeholder={t("investments.newInstitutionPlaceholder")}
							required={true}
						/>
					) : null}

					<div className="grid gap-4 sm:grid-cols-2">
						{shownFields.map((field) => control(field, product))}
						{editing ? (
							<Field
								label={t("investments.openingCost")}
								value={cost}
								onChange={(event) => setCost(event.target.value)}
								hint={t("investments.openingCostHint")}
								numeric={true}
							/>
						) : null}
					</div>

					{!editing && mayMoveMoney ? (
						<Select
							label={t("investments.fromAccount")}
							value={fromId}
							onChange={(event) => setFromId(event.target.value)}
							hint={t("investments.fromAccountHint")}
							options={[
								{ value: "", label: t("investments.alreadyInvested") },
								...accountOptions(origins, t),
							]}
						/>
					) : null}

					{cashThere > 0 ? (
						<label className="flex items-start gap-2 text-sm">
							<input
								type="checkbox"
								checked={keepCash}
								onChange={(event) => setKeepCash(event.target.checked)}
								className="mt-0.5 size-4 accent-[var(--ink)]"
							/>
							<span>
								{t("investments.keepCash", { amount: money(cashThere) })}
								<span className="block text-quiet text-xs">{t("investments.keepCashHint")}</span>
							</span>
						</label>
					) : null}

					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			)}
		</Dialog>
	);
}
