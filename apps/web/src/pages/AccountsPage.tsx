// Accounts of the current space: what exists, and how to add one.

import { parseMoney } from "@cofre/core";
import type { AccountKind, BenefitKind, CardKind } from "@cofre/storage";
import {
	Button,
	Callout,
	Dialog,
	EmptyState,
	Field,
	Icon,
	Menu,
	MenuItem,
	MenuSeparator,
	Panel,
	SectionTitle,
	Segmented,
	Select,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardDialog, type CardTarget } from "../components/CardDialog.tsx";
import { CardsSection } from "../components/CardsSection.tsx";
import { Value } from "../components/Value.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

const KINDS: AccountKind[] = ["checking", "savings", "cash", "credit", "voucher", "investment"];
const BENEFITS: BenefitKind[] = ["meal", "transport", "culture", "mobility"];

export function AccountsPage() {
	const { t } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const [isOpen, setOpen] = useState(false);
	const [kind, setKind] = useState<AccountKind>("checking");
	const [name, setName] = useState("");
	const [balance, setBalance] = useState("");
	const [institution, setInstitution] = useState("");
	const [closingDay, setClosingDay] = useState("3");
	const [dueDay, setDueDay] = useState("10");
	const [benefit, setBenefit] = useState<BenefitKind>("meal");
	// The card that comes with the account, for the two kinds that are a card.
	const [lastFour, setLastFour] = useState("");
	const [works, setWorks] = useState<CardKind>("credit");
	const [debitAccountId, setDebitAccountId] = useState("");
	const [cardTarget, setCardTarget] = useState<CardTarget>(null);
	const [problem, setProblem] = useState<string | null>(null);

	const spaceId = currentSpace?.id ?? "";

	const accounts = useQuery({
		// The archived ones are part of what this screen asks for, so they are part of
		// the key too. Two screens asking the same question in different words would
		// otherwise share one answer, and whichever asked last would win.
		queryKey: ["accounts", spaceId, "includingArchived"],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(spaceId, { includeArchived: true }) ?? [],
	});

	// Read here rather than inside the list below, because the menu of each account row
	// needs to offer the cards that reach it, and that is where a card is looked after.
	const cards = useQuery({
		queryKey: ["cards", spaceId, "includingArchived"],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.cards.list(spaceId, { includeArchived: true }) ?? [],
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["accounts"] });
		void queries.invalidateQueries({ queryKey: ["accountsEverywhere"] });
		void queries.invalidateQueries({ queryKey: ["cards"] });
		// An opening balance is part of what an account is worth, so the balances the
		// overview is showing are no longer true.
		void queries.invalidateQueries({ queryKey: ["balances"] });
		void queries.invalidateQueries({ queryKey: ["advice"] });
	};

	const create = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			const digits = lastFour.trim() === "" ? null : lastFour.trim();

			/**
			 * A debit card is the one case here that is not an account at all. It spends
			 * the balance of an account that already exists, so what gets made is a card
			 * and nothing else. Saying that out loud on the form beats a screen where
			 * somebody adds a card and no row appears in the table.
			 */
			if (kind === "credit" && works === "debit") {
				await session.cards.create({
					spaceId,
					kind: "debit",
					name,
					lastFour: digits,
					debitAccountId,
				});
				return null;
			}

			const amount =
				balance.trim() === ""
					? 0
					: parseMoney(balance, { currency: currentSpace?.baseCurrency }).amount;
			const account = await session.accounts.create({
				spaceId,
				kind,
				name,
				institution: institution.trim() === "" ? null : institution.trim(),
				initialBalance: amount,
				// Only a card carries a cycle, and without it a purchase has no invoice.
				closingDay: kind === "credit" ? Number(closingDay) : null,
				dueDay: kind === "credit" ? Number(dueDay) : null,
				// VR, VA and VT are three different pots, and a shop that takes one may
				// refuse the other, so the account says which it is.
				benefit: kind === "voucher" ? benefit : null,
			});

			// Two kinds of account are a card, and asking somebody to say so twice was
			// the whole complaint. A credit account and a voucher come with their plastic
			// already made, named after the account, ready to be picked on a record. Every
			// other kind may or may not have one, which is what the menu of the row is for.
			if (kind === "credit" || kind === "voucher") {
				await session.cards.create({
					spaceId,
					kind: kind === "voucher" ? "benefit" : works,
					name: account.name,
					lastFour: digits,
					creditAccountId: kind === "credit" ? account.id : null,
					debitAccountId:
						kind === "voucher"
							? account.id
							: works === "multiple" && debitAccountId
								? debitAccountId
								: null,
				});
			}
			return account;
		},
		onSuccess: () => {
			setOpen(false);
			setName("");
			setBalance("");
			setInstitution("");
			setLastFour("");
			setWorks("credit");
			setProblem(null);
			invalidate();
		},
		onError: (error: unknown) => {
			const rule =
				error !== null && typeof error === "object" && "rule" in error
					? String((error as { rule: unknown }).rule)
					: null;
			setProblem(
				rule === null
					? error instanceof Error
						? error.message
						: String(error)
					: t(`rules.${rule}`, { defaultValue: t("rules.unknown") }),
			);
		},
	});

	const archive = useMutation({
		mutationFn: async (id: string) => session?.accounts.archive(id),
		onSuccess: invalidate,
	});

	const unarchive = useMutation({
		mutationFn: async (id: string) => session?.accounts.unarchive(id),
		onSuccess: invalidate,
	});

	const remove = useMutation({
		mutationFn: async (id: string) => session?.accounts.remove(id),
		onSuccess: invalidate,
	});

	if (!currentSpace) return null;

	function submit(event: FormEvent) {
		event.preventDefault();
		create.mutate();
	}

	const rows = accounts.data ?? [];
	const plastic = cards.data ?? [];

	// A card that also works as debit spends a balance, and the likely one is a current
	// account rather than whatever comes first alphabetically.
	const balances = rows.filter(
		(account) => account.kind !== "credit" && account.archivedAt === null,
	);

	/**
	 * A debit card spends a balance that already exists, so it is the one thing this
	 * form can make that is not an account. Everything about an account is hidden then,
	 * because there is no account to describe.
	 */
	const makesAnAccount = !(kind === "credit" && works === "debit");

	/** The cards that reach one account, which is what its menu looks after. */
	const cardsOf = (accountId: string) =>
		plastic.filter(
			(card) => card.creditAccountId === accountId || card.debitAccountId === accountId,
		);

	return (
		<div className="space-y-6">
			<SectionTitle
				level="h1"
				action={
					<Button
						size="small"
						variant="primary"
						icon={<Icon name="plus" />}
						onClick={() => setOpen(true)}
					>
						{t("accounts.create")}
					</Button>
				}
			>
				{t("accounts.title")}
			</SectionTitle>

			{accounts.isPending ? <Skeleton lines={4} /> : null}

			{!accounts.isPending && rows.length === 0 ? (
				<EmptyState
					icon="wallet"
					title={t("accounts.emptyTitle")}
					description={t("accounts.emptyBody")}
					action={
						<Button variant="primary" onClick={() => setOpen(true)}>
							{t("accounts.create")}
						</Button>
					}
				/>
			) : null}

			{rows.length > 0 ? (
				<Panel flush>
					<Table caption={t("accounts.caption", { space: currentSpace.name })}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("accounts.name")}</TableHeader>
								<TableHeader>{t("accounts.kind")}</TableHeader>
								<TableHeader>{t("accounts.institution")}</TableHeader>
								<TableHeader numeric={true}>{t("accounts.balance")}</TableHeader>
								<TableHeader numeric={true}>
									<span className="sr-only">{t("accounts.actions")}</span>
								</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((account) => (
								<TableRow key={account.id}>
									<TableCell>
										<span className={account.archivedAt ? "text-quiet line-through" : ""}>
											{account.name}
										</span>
									</TableCell>
									<TableCell className="text-quiet">
										{account.benefit
											? t(`benefitKind.${account.benefit}`)
											: t(`accountKind.${account.kind}`)}
									</TableCell>
									<TableCell className="text-quiet">{account.institution ?? ""}</TableCell>
									<TableCell numeric={true}>
										<Value
											amount={account.initialBalance}
											currency={account.currency}
											tone="auto"
										/>
									</TableCell>
									<TableCell numeric={true}>
										<Menu
											align="end"
											trigger={
												<Button size="small" variant="quiet" aria-label={t("accounts.actions")}>
													<Icon name="settings" />
												</Button>
											}
										>
											{/* The one place a card is added and looked after, because a
											    card is a way to reach this account and nothing else. */}
											{account.archivedAt ? null : (
												<MenuItem onSelect={() => setCardTarget({ mode: "add", account })}>
													{t("cards.addAction")}
												</MenuItem>
											)}
											{cardsOf(account.id).map((card) => (
												<MenuItem
													key={card.id}
													onSelect={() => setCardTarget({ mode: "edit", card })}
												>
													{t("cards.editNamed", { name: card.name })}
												</MenuItem>
											))}
											<MenuSeparator />
											{account.archivedAt ? (
												<MenuItem onSelect={() => unarchive.mutate(account.id)}>
													{t("accounts.unarchive")}
												</MenuItem>
											) : (
												<MenuItem onSelect={() => archive.mutate(account.id)}>
													{t("accounts.archive")}
												</MenuItem>
											)}
											<MenuItem onSelect={() => remove.mutate(account.id)}>
												{t("actions.delete")}
											</MenuItem>
										</Menu>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Panel>
			) : null}

			<CardsSection accounts={rows} cards={plastic} loading={cards.isPending} />

			<CardDialog
				target={cardTarget}
				spaceId={spaceId}
				accounts={rows}
				onClose={() => setCardTarget(null)}
			/>

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={t("accounts.create")}
				description={t("accounts.createDescription", { space: currentSpace.name })}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setOpen(false)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form onSubmit={submit} className="space-y-4">
					<Field
						label={t("accounts.name")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("accounts.namePlaceholder")}
						required={true}
					/>
					<Select
						label={t("accounts.kind")}
						value={kind}
						onChange={(event) => setKind(event.target.value as AccountKind)}
						options={KINDS.map((value) => ({ value, label: t(`accountKind.${value}`) }))}
					/>
					{/* What the card does comes before everything else about it, because it
					    is what decides whether there is an invoice to describe at all. */}
					{kind === "credit" ? (
						<Segmented
							label={t("accounts.cardWorks")}
							value={works}
							onChange={(next) => {
								setWorks(next);
								if (next !== "credit" && debitAccountId === "") {
									const likely = balances.find((one) => one.kind === "checking") ?? balances[0];
									setDebitAccountId(likely?.id ?? "");
								}
							}}
							options={[
								{ value: "credit", label: t("cardKind.credit") },
								{ value: "debit", label: t("cardKind.debit") },
								{ value: "multiple", label: t("cardKind.multiple") },
							]}
						/>
					) : null}
					{kind === "credit" && works === "debit" ? (
						balances.length > 0 ? (
							<Callout tone="neutral">{t("accounts.debitMakesNoAccount")}</Callout>
						) : (
							<Callout tone="attention">{t("cards.needsDebitAccount")}</Callout>
						)
					) : null}
					{kind === "credit" && works !== "credit" && balances.length > 0 ? (
						<Select
							label={t("cards.debitAccount")}
							hint={t("cards.debitAccountHint")}
							value={debitAccountId}
							onChange={(event) => setDebitAccountId(event.target.value)}
							options={balances.map((account) => ({ value: account.id, label: account.name }))}
						/>
					) : null}

					{makesAnAccount ? (
						<Field
							label={t("accounts.institution")}
							value={institution}
							onChange={(event) => setInstitution(event.target.value)}
							placeholder={t("accounts.institutionPlaceholder")}
						/>
					) : null}
					{kind === "credit" && makesAnAccount ? (
						<div className="grid gap-4 md:grid-cols-2">
							<Select
								label={t("accounts.closingDay")}
								hint={t("accounts.closingDayHint")}
								value={closingDay}
								onChange={(event) => setClosingDay(event.target.value)}
								options={Array.from({ length: 31 }, (_unused, index) => ({
									value: String(index + 1),
									label: String(index + 1),
								}))}
							/>
							<Select
								label={t("accounts.dueDay")}
								hint={t("accounts.dueDayHint")}
								value={dueDay}
								onChange={(event) => setDueDay(event.target.value)}
								options={Array.from({ length: 31 }, (_unused, index) => ({
									value: String(index + 1),
									label: String(index + 1),
								}))}
							/>
						</div>
					) : null}
					{kind === "voucher" ? (
						<Select
							label={t("accounts.benefit")}
							hint={t("accounts.benefitHint")}
							value={benefit}
							onChange={(event) => setBenefit(event.target.value as BenefitKind)}
							options={BENEFITS.map((value) => ({ value, label: t(`benefitKind.${value}`) }))}
						/>
					) : null}

					{/* These two kinds of account are a card, so the card is described here
					    and made with it. Asking for it again afterwards, on another panel,
					    was the same question twice. */}
					{kind === "credit" || kind === "voucher" ? (
						<Field
							label={t("cards.lastFour")}
							hint={makesAnAccount ? t("accounts.cardComesWithIt") : t("cards.lastFourHint")}
							value={lastFour}
							onChange={(event) =>
								setLastFour(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))
							}
							inputMode="numeric"
							placeholder="1234"
						/>
					) : null}
					{makesAnAccount ? (
						<Field
							label={t("accounts.balance")}
							hint={t("accounts.balanceHint")}
							value={balance}
							onChange={(event) => setBalance(event.target.value)}
							numeric={true}
							inputMode="decimal"
							placeholder="0,00"
						/>
					) : null}
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
