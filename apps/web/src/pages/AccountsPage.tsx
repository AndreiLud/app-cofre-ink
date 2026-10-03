// Accounts of the current space: what exists, how to add one, and how to correct one.

import {
	carriesByDefault,
	closedAndNotDue,
	closedChargeOf,
	openingChargeOf,
	parseMoney,
	todayIn,
} from "@cofre/core";
import type { Account, AccountKind, BenefitKind, Card, CardKind } from "@cofre/storage";
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
import { CardDialog } from "../components/CardDialog.tsx";
import { CardsSection } from "../components/CardsSection.tsx";
import { MoveDialog, type MoveStart, movesInto, movesOutOf } from "../components/MoveDialog.tsx";
import { Value } from "../components/Value.tsx";
import { VoucherAmount } from "../components/VoucherAmount.tsx";
import { fillAmount, readAmount } from "../lib/amounts.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions } from "../lib/wayLabel.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

const KINDS: AccountKind[] = ["checking", "savings", "cash", "credit", "voucher", "investment"];
const BENEFITS: BenefitKind[] = ["meal", "transport", "culture", "mobility"];

export function AccountsPage() {
	const { t, i18n } = useTranslation();
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
	// What lands on a benefit card each month, and the day it lands. Nothing is written
	// when the money arrives, so this is the only place the figure can come from.
	const [quota, setQuota] = useState("");
	const [quotaDay, setQuotaDay] = useState("");
	/** How much is on a voucher that carries, today, when somebody knows. Empty is allowed. */
	const [known, setKnown] = useState("");
	/** The days an allowance can land on, with nothing chosen first rather than an example. */
	const quotaDays = [
		{ value: "", label: t("accounts.quotaDayPick") },
		...Array.from({ length: 31 }, (_unused, index) => ({
			value: String(index + 1),
			label: String(index + 1),
		})),
	];
	/** What is already charged to the invoice that is open today, on a card that is not new. */
	const [invoiceSoFar, setInvoiceSoFar] = useState("");
	/** What the invoice that closed and is not due yet holds, asked only in that window. */
	const [closedSoFar, setClosedSoFar] = useState("");
	// The card that comes with the account, for the two kinds that are a card.
	const [lastFour, setLastFour] = useState("");
	const [works, setWorks] = useState<CardKind>("credit");
	const [debitAccountId, setDebitAccountId] = useState("");
	const [cardTarget, setCardTarget] = useState<Card | null>(null);
	/** The invoice a second piece of plastic is being added to. */
	const [addingCardTo, setAddingCardTo] = useState<Account | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	/** A move between two accounts being written, with what the door it came through knew. */
	const [moving, setMoving] = useState<MoveStart | null>(null);

	const spaceId = currentSpace?.id ?? "";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");

	/** The cycle being typed for a new card, once both of its days are chosen. */
	const typedCycle =
		closingDay !== "" && dueDay !== ""
			? { closingDay: Number(closingDay), dueDay: Number(dueDay) }
			: null;
	/** The invoice of that cycle that closed and waits to be paid today, if there is one. */
	const closedNow = typedCycle ? closedAndNotDue(today, typedCycle) : null;
	const dayAndMonth = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;
	const monthWord = (month: string) =>
		new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			month: "long",
			timeZone: "UTC",
		}).format(new Date(`${month}-01T00:00:00Z`));

	const accounts = useQuery({
		// The archived ones are part of what this screen asks for, so they are part of
		// the key too. Two screens asking the same question in different words would
		// otherwise share one answer, and whichever asked last would win.
		queryKey: ["accounts", spaceId, "includingArchived"],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(spaceId, { includeArchived: true }) ?? [],
	});

	/** What is in each account now, for the column that used to show the opening balance. */
	const standing = useQuery({
		queryKey: ["balances", spaceId, today],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.transactions.balances(spaceId, today) ?? [],
	});

	// What an investment account is worth, which is the prices somebody typed and not the
	// money that was moved into it. The overview reads the same figure, because a broker
	// showing nothing on one screen and thousands on the next is two answers to one
	// question, which is the thing this release exists to stop.
	const holdings = useQuery({
		queryKey: ["investments", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.investments.list(spaceId) ?? [],
	});

	/** What each card still owes, which archiving one asks about first. */
	const invoicesStanding = useQuery({
		queryKey: ["invoices", "standing", spaceId, today],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.invoices.standing(spaceId, today) ?? [],
	});
	/** Everything a card still has to pay: the open invoice, the ones behind it and the parts ahead. */
	const owedOn = (accountId: string): number => {
		const card = invoicesStanding.data?.find((one) => one.account.id === accountId);
		if (!card) return 0;
		return (
			[card.open, ...card.owing].reduce((total, state) => total + Math.max(0, state.left), 0) +
			card.later
		);
	};
	const owedText = (accountId: string) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency: currentSpace?.baseCurrency ?? "BRL",
		}).format(owedOn(accountId) / 100);

	// Read here rather than inside the list below, because the menu of each account row
	// needs to offer the cards that reach it, and that is where a card is looked after.
	const cards = useQuery({
		queryKey: ["cards", spaceId, "includingArchived"],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.cards.list(spaceId, { includeArchived: true }) ?? [],
	});

	/** The account being corrected, and the fields of it that can be corrected. */
	const [editing, setEditing] = useState<Account | null>(null);
	const [editName, setEditName] = useState("");
	const [editInstitution, setEditInstitution] = useState("");
	const [editBalance, setEditBalance] = useState("");
	const [editQuota, setEditQuota] = useState("");
	const [editQuotaDay, setEditQuotaDay] = useState("");
	const [editCarries, setEditCarries] = useState(true);
	const [editKnown, setEditKnown] = useState("");
	/** What the field said when the edit opened, so only a change of it is sent. */
	const [editKnownWas, setEditKnownWas] = useState("");
	const [editClosingDay, setEditClosingDay] = useState("");
	const [editDueDay, setEditDueDay] = useState("");
	const [editLimit, setEditLimit] = useState("");
	/** The debt a card from before 1.1.0 was written down with, positive, or empty. */
	const [editOpeningDebt, setEditOpeningDebt] = useState("");

	/** The account about to be deleted, and how many records go nowhere with it. */
	const [erasing, setErasing] = useState<Account | null>(null);
	/** A card that still owes, about to be archived, which is asked about first. */
	const [archivingCard, setArchivingCard] = useState<Account | null>(null);
	const inside = useQuery({
		queryKey: ["accountRecords", erasing?.id],
		enabled: Boolean(session && erasing),
		queryFn: () => session?.accounts.recordCount(erasing?.id ?? "") ?? 0,
	});

	/**
	 * What one account is worth right now.
	 *
	 * For an investment that is the prices somebody typed, because a holding is priced by
	 * hand and a price is not a movement, so the balance of a broker is what was paid into
	 * it and not what it is worth. Everything else is what the records add up to.
	 */
	function worthOf(account: Account): number {
		if (account.kind === "investment") {
			const priced = (holdings.data ?? []).filter((one) => one.accountId === account.id);
			if (priced.length > 0) return priced.reduce((total, one) => total + one.value, 0);
		}
		return (
			standing.data?.find((one) => one.accountId === account.id)?.settled ?? account.initialBalance
		);
	}

	/**
	 * The days of a month to choose from, with an empty first choice while none is chosen.
	 *
	 * Without it, a card from before 2.0.0 with no cycle opened its edit showing the first day
	 * in both fields, a day it did not have, and saving sent none.
	 */
	const daysOfTheMonth = (value: string) => [
		...(value === "" ? [{ value: "", label: t("accounts.quotaDayPick") }] : []),
		...Array.from({ length: 31 }, (_unused, index) => ({
			value: String(index + 1),
			label: String(index + 1),
		})),
	];

	/**
	 * A card a release before 1.1.0 wrote down owing something, as its balance.
	 *
	 * That number is the first invoice of the card, and the notes of 1.1.0 said it could still
	 * be corrected, which the model allows and no screen asked for. A card written down since
	 * starts empty and has no such number to correct.
	 */
	const oldCardDebt = (account: Account) =>
		account.kind === "credit" && account.initialBalance < 0 && account.balanceKnownOn === null;

	function openEdit(account: Account) {
		setProblem(null);
		setEditing(account);
		setEditName(account.name);
		setEditInstitution(account.institution ?? "");
		setEditBalance(fillAmount(account.initialBalance, i18n.resolvedLanguage, account.currency));
		setEditQuota(
			account.quotaAmount === null
				? ""
				: fillAmount(account.quotaAmount, i18n.resolvedLanguage, account.currency),
		);
		setEditQuotaDay(account.quotaDay === null ? "" : String(account.quotaDay));
		setEditCarries(account.quotaCarries ?? carriesByDefault(account.benefit ?? "meal"));
		const knownBefore =
			account.kind === "voucher" &&
			(account.balanceKnownOn !== null || account.initialBalance !== 0)
				? fillAmount(account.initialBalance, i18n.resolvedLanguage, account.currency)
				: "";
		setEditKnown(knownBefore);
		setEditKnownWas(knownBefore);
		setEditClosingDay(account.closingDay === null ? "" : String(account.closingDay));
		setEditDueDay(account.dueDay === null ? "" : String(account.dueDay));
		setEditLimit(
			account.creditLimit === null
				? ""
				: fillAmount(account.creditLimit, i18n.resolvedLanguage, account.currency),
		);
		setEditOpeningDebt(
			oldCardDebt(account)
				? fillAmount(-account.initialBalance, i18n.resolvedLanguage, account.currency)
				: "",
		);
	}

	const save = useMutation({
		mutationFn: async () => {
			if (!session || !editing) throw new Error("no session");
			const quota = editQuota.trim() === "" ? null : readAmount(editQuota, editing.currency);
			return session.accounts.update(editing.id, {
				name: editName,
				institution: editInstitution.trim() === "" ? null : editInstitution.trim(),
				// The opening balance is only asked for where it means anything: on a card it
				// is the invoice, and on a voucher it is what the allowance replaced.
				...(editing.kind === "credit" || editing.kind === "voucher"
					? {}
					: { initialBalance: readAmount(editBalance, editing.currency) }),
				...(editing.kind === "voucher"
					? {
							quotaAmount: quota,
							quotaDay: editQuotaDay.trim() === "" ? null : Number(editQuotaDay),
							quotaCarries: quota === null ? null : editCarries,
							...(editCarries && editKnown.trim() !== editKnownWas.trim()
								? {
										knownAmount:
											editKnown.trim() === "" ? null : readAmount(editKnown, editing.currency),
									}
								: {}),
						}
					: {}),
				// The cycle of a card, because a bank changes it and because the day somebody
				// typed when they added the card is the thing most likely to be a guess. It
				// decides the invoice of what is written from now on. A purchase already written
				// keeps the invoice on its record, so correcting the days moves nothing; an
				// invoice that closed on another day is moved from the invoice screen.
				...(editing.kind === "credit"
					? {
							closingDay: editClosingDay.trim() === "" ? null : Number(editClosingDay),
							dueDay: editDueDay.trim() === "" ? null : Number(editDueDay),
							// Empty means the bank never said, and the invoice screen then says
							// nothing about a limit rather than guessing at one.
							creditLimit: editLimit.trim() === "" ? null : readAmount(editLimit, editing.currency),
							// The debt an old card came with, as the balance it is kept as. Empty
							// says it owed nothing then.
							...(oldCardDebt(editing)
								? {
										initialBalance:
											editOpeningDebt.trim() === ""
												? 0
												: -readAmount(editOpeningDebt, editing.currency),
									}
								: {}),
						}
					: {}),
			});
		},
		onSuccess: () => {
			setEditing(null);
			invalidate();
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["accounts"] });
		void queries.invalidateQueries({ queryKey: ["accountsEverywhere"] });
		void queries.invalidateQueries({ queryKey: ["cards"] });
		// An opening balance is part of what an account is worth, so the balances the
		// overview is showing are no longer true.
		void queries.invalidateQueries({ queryKey: ["balances"] });
		void queries.invalidateQueries({ queryKey: ["advice"] });
		// What is left on a benefit card is worked out from the allowance on the account,
		// so writing the allowance changes an answer that is cached under another name.
		void queries.invalidateQueries({ queryKey: ["benefit"] });
		// And a closing day or a limit changes where every invoice of that card stands.
		void queries.invalidateQueries({ queryKey: ["invoices"] });
		// A card that arrived with its open invoice already on it wrote a record to say so.
		void queries.invalidateQueries({ queryKey: ["transactions"] });
	};

	const complain = (error: unknown) => setProblem(sayWhy(error, t));

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
				// A card that spends a voucher is a benefit card, whatever the form calls
				// the function: the kind of a card that only spends follows the money it
				// spends, and calling it debit would say less than the truth.
				const spends = balances.find((one) => one.id === debitAccountId);
				await session.cards.create({
					spaceId,
					kind: spends?.kind === "voucher" ? "benefit" : "debit",
					name,
					lastFour: digits,
					debitAccountId,
				});
				return null;
			}

			// Nothing for a card or a benefit card, whatever is in the field, because the
			// field is not on their form: what is on a card is its invoice, and what is on a
			// benefit card is worked out from the allowance.
			const amount =
				balance.trim() === "" || kind === "credit" || kind === "voucher"
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
				// And what lands on it each month, which is the whole of what a benefit card
				// is: nothing is written when the money arrives, so this is where it comes
				// from. Left empty it answers nothing rather than guessing.
				...(kind === "voucher" && quota.trim() !== ""
					? {
							quotaAmount: parseMoney(quota, { currency: currentSpace?.baseCurrency }).amount,
							// No day of its own when none was chosen. The first of the month used to be
							// written here, under an example that showed the fifth.
							quotaDay: quotaDay === "" ? null : Number(quotaDay),
							quotaCarries: carriesByDefault(benefit),
							...(carriesByDefault(benefit) && known.trim() !== ""
								? {
										knownAmount: parseMoney(known, { currency: currentSpace?.baseCurrency }).amount,
									}
								: {}),
						}
					: {}),
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

			// What was already on the open invoice, as one purchase dated today.
			//
			// A record and not a column, so it reaches the invoice, the projection and the
			// balance by the paths they already have, and so somebody who typed the wrong
			// number can open it and correct it like anything else.
			if (kind === "credit" && makesAnAccount) {
				const charge = openingChargeOf({
					charged:
						invoiceSoFar.trim() === ""
							? null
							: parseMoney(invoiceSoFar, { currency: currentSpace?.baseCurrency }).amount,
					today,
				});
				if (charge) {
					await session.transactions.create({
						...charge,
						spaceId,
						description: t("accounts.invoiceSoFarRecord"),
						accountId: account.id,
					});
				}
				// And the one that closed and is not due yet, on its own invoice.
				const closed = typedCycle
					? closedChargeOf({
							charged:
								closedSoFar.trim() === ""
									? null
									: parseMoney(closedSoFar, { currency: currentSpace?.baseCurrency }).amount,
							today,
							cycle: typedCycle,
						})
					: null;
				if (closed) {
					await session.transactions.create({
						...closed,
						spaceId,
						description: t("accounts.closedSoFarRecord"),
						accountId: account.id,
					});
				}
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
			setInvoiceSoFar("");
			setClosedSoFar("");
			// The allowance of the card just written, so the next one does not inherit it.
			setQuota("");
			setQuotaDay("");
			setKnown("");
			setProblem(null);
			invalidate();
		},
		onError: complain,
	});

	/**
	 * Four questions, not one. Deleting an account is the decision of whoever runs the
	 * space, and everything else on this screen is open to an Editor too, so a single
	 * "may write here" would have been wrong in both directions.
	 */
	const { mayCall, ready, seesOwnRowsOnly } = useWhatIMayDo(spaceId);
	const mayCreate = mayCall("accounts.create");
	const mayUpdate = mayCall("accounts.update");
	const mayArchive = mayCall("accounts.archive");
	const mayDelete = mayCall("accounts.remove");
	const mayWrite = mayCall("transactions.create");
	const mayAddCard = mayCall("cards.create");

	// None of these three said anything when they failed: the menu closed, the row stayed,
	// and a refusal looked exactly like a click that had not landed.
	const archive = useMutation({
		mutationFn: async (id: string) => session?.accounts.archive(id),
		onSuccess: invalidate,
		onError: complain,
	});

	const unarchive = useMutation({
		mutationFn: async (id: string) => session?.accounts.unarchive(id),
		onSuccess: invalidate,
		onError: complain,
	});

	const remove = useMutation({
		mutationFn: async (id: string) => session?.accounts.remove(id),
		onSuccess: invalidate,
		onError: complain,
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

	/** What kind of account it is, or which benefit for a benefit card. */
	const kindOf = (account: Account) =>
		account.benefit ? t(`benefitKind.${account.benefit}`) : t(`accountKind.${account.kind}`);

	/** The cards that reach one account, which is what its menu looks after. */
	const cardsOf = (accountId: string) =>
		plastic.filter(
			(card) => card.creditAccountId === accountId || card.debitAccountId === accountId,
		);

	/**
	 * Whether there is anywhere to move money between: one account it can leave and another
	 * it can reach. A button that opens a dialog with one account in both lists is a
	 * refusal waiting to happen.
	 */
	const mayMove =
		mayWrite &&
		rows.some((from) => movesOutOf(from) && rows.some((to) => to.id !== from.id && movesInto(to)));

	return (
		<div className="space-y-6">
			<SectionTitle
				level="h1"
				action={
					mayCreate || mayMove ? (
						<div className="flex flex-wrap justify-end gap-2">
							{mayMove ? (
								<Button
									size="small"
									variant="secondary"
									icon={<Icon name="transfer" />}
									onClick={() => setMoving({})}
								>
									{t("move.title")}
								</Button>
							) : null}
							{mayCreate ? (
								<Button
									size="small"
									variant="primary"
									icon={<Icon name="plus" />}
									onClick={() => {
										// Nothing that failed before this form was opened belongs in it.
										setProblem(null);
										setOpen(true);
									}}
								>
									{t("accounts.create")}
								</Button>
							) : null}
						</div>
					) : null
				}
			>
				{t("accounts.title")}
			</SectionTitle>

			{/* Here as well as inside the form. Archiving, unarchiving and deleting are all
			    done from a row menu on this screen, and their failure was written into a
			    callout that only the Nova conta dialog drew, so it was invisible where it
			    happened and then turned up, stale, in a form nobody had submitted. */}
			{problem && !isOpen ? <Callout tone="problem">{problem}</Callout> : null}

			{accounts.isPending ? <Skeleton lines={4} /> : null}

			{/* And only once the member list has arrived, because the sentence it picks
			    depends on it and until then every answer is no: an Owner was told for a
			    moment that making an account belongs to whoever runs the space. */}
			{!accounts.isPending && rows.length === 0 && ready ? (
				<EmptyState
					icon="wallet"
					title={t("accounts.emptyTitle")}
					// The sentence tells somebody to make the first account, so it is only for
					// somebody who may make one. The overview has said the right thing to both
					// all along, out of the same two keys.
					description={mayCreate ? t("accounts.emptyBody") : t("accounts.emptyForYou")}
					action={
						mayCreate ? (
							<Button
								variant="primary"
								onClick={() => {
									// Nothing that failed before this form was opened belongs in it.
									setProblem(null);
									setOpen(true);
								}}
							>
								{t("accounts.create")}
							</Button>
						) : null
					}
				/>
			) : null}

			{rows.length > 0 ? (
				<Panel flush>
					<Table caption={t("accounts.caption", { space: currentSpace.name })}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("accounts.name")}</TableHeader>
								{/* On a telephone the kind and the institution go under the name, so
								    the balance and the menu keep their room: five columns at 375
								    pixels cut the balance to "R$ 1.101,0" and pushed the menu off. */}
								<TableHeader className="hidden sm:table-cell">{t("accounts.kind")}</TableHeader>
								<TableHeader className="hidden sm:table-cell">
									{t("accounts.institution")}
								</TableHeader>
								<TableHeader numeric={true}>{t("accounts.balanceNow")}</TableHeader>
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
										{/* The kind never leaves: it is what tells the current account
										    "Nubank" from the card "Nubank". */}
										<span className="block text-quiet text-xs sm:hidden">
											{kindOf(account)}
											{account.institution ? `, ${account.institution}` : ""}
										</span>
									</TableCell>
									<TableCell className="hidden text-quiet sm:table-cell">
										{kindOf(account)}
									</TableCell>
									<TableCell className="hidden text-quiet sm:table-cell">
										{account.institution ?? ""}
									</TableCell>
									{/* What is in the account now, and not what was in it the day somebody
									    wrote it down. The column was headed with the words for the opening
									    balance and was read as the balance, which is the number anybody
									    comes to this table for. */}
									<TableCell numeric={true}>
										{account.kind === "voucher" ? (
											<VoucherAmount
												accountId={account.id}
												currency={account.currency}
												today={today}
												known={!seesOwnRowsOnly}
											/>
										) : (
											<Value amount={worthOf(account)} currency={account.currency} tone="auto" />
										)}
									</TableCell>
									<TableCell numeric={true}>
										{/* Nothing to offer is no button, rather than a button that opens
										    an empty popup. */}
										{mayUpdate || mayArchive || mayDelete || mayMove || mayAddCard ? (
											<Menu
												align="end"
												trigger={
													<Button size="small" variant="quiet" aria-label={t("accounts.actions")}>
														<Icon name="settings" />
													</Button>
												}
											>
												{mayMove && movesOutOf(account) ? (
													<>
														<MenuItem onSelect={() => setMoving({ fromId: account.id })}>
															{t("move.fromHere")}
														</MenuItem>
														<MenuSeparator />
													</>
												) : null}
												{/* A top up by Pix, which a card like Caju or Flash takes. */}
												{mayMove && account.kind === "voucher" && movesInto(account) ? (
													<>
														<MenuItem
															onSelect={() =>
																setMoving({
																	toId: account.id,
																	title: t("move.topUpTitle", { name: account.name }),
																	description: t("move.topUpDescription"),
																})
															}
														>
															{t("move.topUp")}
														</MenuItem>
														<MenuSeparator />
													</>
												) : null}
												{/* The cards that already reach this account, and on a credit account
												    a way to add another piece of plastic to the same invoice, the
												    extra card somebody else in the house carries. A card with an
												    account of its own is still added in "Nova conta". */}
												{mayUpdate
													? cardsOf(account.id).map((card) => (
															<MenuItem key={card.id} onSelect={() => setCardTarget(card)}>
																{t("cards.editNamed", { name: card.name })}
															</MenuItem>
														))
													: null}
												{mayAddCard && account.kind === "credit" && account.archivedAt === null ? (
													<MenuItem onSelect={() => setAddingCardTo(account)}>
														{t("cards.addToThisInvoice")}
													</MenuItem>
												) : null}
												{(mayUpdate && cardsOf(account.id).length > 0) ||
												(mayAddCard && account.kind === "credit" && account.archivedAt === null) ? (
													<MenuSeparator />
												) : null}
												{mayArchive ? (
													account.archivedAt ? (
														<MenuItem onSelect={() => unarchive.mutate(account.id)}>
															{t("accounts.unarchive")}
														</MenuItem>
													) : (
														<MenuItem
															onSelect={() =>
																owedOn(account.id) > 0
																	? setArchivingCard(account)
																	: archive.mutate(account.id)
															}
														>
															{t("accounts.archive")}
														</MenuItem>
													)
												) : null}
												{mayUpdate ? (
													<MenuItem onSelect={() => openEdit(account)}>
														{t("accounts.edit")}
													</MenuItem>
												) : null}
												{mayDelete ? (
													<MenuItem onSelect={() => setErasing(account)}>
														{t("actions.delete")}
													</MenuItem>
												) : null}
											</Menu>
										) : null}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Panel>
			) : null}

			<CardsSection accounts={rows} cards={plastic} loading={cards.isPending} />

			<MoveDialog
				open={moving !== null}
				onOpenChange={(next) => !next && setMoving(null)}
				spaceId={spaceId}
				accounts={rows}
				today={today}
				start={moving ?? undefined}
			/>

			{/* Correcting an account, which had no screen at all: the only way to fix a name
			    or an opening balance was to delete the account and write everything again. */}
			<Dialog
				open={editing !== null}
				onOpenChange={(next) => !next && setEditing(null)}
				title={t("accounts.editTitle")}
				description={t("accounts.editDescription")}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setEditing(null)}>
							{t("actions.cancel")}
						</Button>
						<Button onClick={() => save.mutate()} disabled={save.isPending}>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<Field
						label={t("accounts.name")}
						value={editName}
						onChange={(event) => setEditName(event.target.value)}
					/>
					<Field
						label={t("accounts.institution")}
						value={editInstitution}
						onChange={(event) => setEditInstitution(event.target.value)}
					/>
					{editing && editing.kind !== "credit" && editing.kind !== "voucher" ? (
						<Field
							label={t("accounts.balance")}
							hint={t("accounts.balanceEditHint")}
							value={editBalance}
							onChange={(event) => setEditBalance(event.target.value)}
							numeric={true}
							inputMode="decimal"
						/>
					) : null}
					{/* The cycle of a card, correctable here because a bank changes it and
					    because the day somebody typed when they added the card is the thing
					    most likely to have been a guess. The new days apply to what is written
					    from now on: a purchase already on an invoice stays on it, because its
					    invoice is written on the record, and an invoice that closed on another
					    day is moved whole from its own screen. A card from before 2.0.0 with no
					    days opens with both fields empty rather than showing a day it does not
					    have. */}
					{editing?.kind === "credit" ? (
						<div className="space-y-2">
							<div className="grid gap-4 sm:grid-cols-2">
								<Select
									label={t("accounts.closingDay")}
									hint={t("accounts.closingDayHint")}
									value={editClosingDay}
									onChange={(event) => setEditClosingDay(event.target.value)}
									options={daysOfTheMonth(editClosingDay)}
								/>
								<Select
									label={t("accounts.dueDay")}
									hint={t("accounts.dueDayHint")}
									value={editDueDay}
									onChange={(event) => setEditDueDay(event.target.value)}
									options={daysOfTheMonth(editDueDay)}
								/>
							</div>
							<p className="text-quiet text-sm">{t("accounts.cycleChangeHint")}</p>
						</div>
					) : null}
					{editing && oldCardDebt(editing) ? (
						<Field
							label={t("accounts.openingDebt")}
							hint={t("accounts.openingDebtHint")}
							value={editOpeningDebt}
							onChange={(event) => setEditOpeningDebt(event.target.value)}
							numeric={true}
							inputMode="decimal"
							placeholder={t("fields.amountPlaceholder")}
						/>
					) : null}
					{/* What the bank allows on the card, which the invoice screen takes the
					    headroom from. Empty means the bank never said, and then that screen
					    says nothing about a limit rather than guessing at one. */}
					{editing?.kind === "credit" ? (
						<Field
							label={t("accounts.creditLimit")}
							hint={t("accounts.creditLimitHint")}
							value={editLimit}
							onChange={(event) => setEditLimit(event.target.value)}
							numeric={true}
							inputMode="decimal"
							placeholder={t("fields.amountPlaceholder")}
						/>
					) : null}
					{editing?.kind === "voucher" ? (
						<>
							<Field
								label={t("accounts.quota")}
								hint={t("accounts.quotaHint")}
								value={editQuota}
								onChange={(event) => setEditQuota(event.target.value)}
								numeric={true}
								inputMode="decimal"
							/>
							<Select
								label={t("accounts.quotaDay")}
								value={editQuotaDay}
								onChange={(event) => setEditQuotaDay(event.target.value)}
								options={quotaDays}
							/>
							<Segmented
								label={t("accounts.quotaLeftover")}
								value={editCarries ? "carries" : "resets"}
								onChange={(next) => setEditCarries(next === "carries")}
								options={[
									{ value: "carries", label: t("accounts.quotaCarries") },
									{ value: "resets", label: t("accounts.quotaResets") },
								]}
							/>
							{editCarries ? (
								<Field
									label={t("accounts.knownToday")}
									hint={t("accounts.knownTodayHint")}
									value={editKnown}
									onChange={(event) => setEditKnown(event.target.value)}
									numeric={true}
									inputMode="decimal"
								/>
							) : null}
						</>
					) : null}
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</div>
			</Dialog>

			{/* Deleting an account fired straight from the menu, with nothing said about what
			    goes with it. Its records stay where they are, pointing at something that no
			    longer resolves, so their money stops being counted anywhere. */}
			<Dialog
				open={erasing !== null}
				onOpenChange={(next) => !next && setErasing(null)}
				title={t("accounts.deleteTitle", { name: erasing?.name ?? "" })}
				description={t("accounts.deleteDescription")}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setErasing(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="destructive"
							disabled={remove.isPending}
							onClick={() => {
								if (erasing) remove.mutate(erasing.id);
								setErasing(null);
							}}
						>
							{t("actions.delete")}
						</Button>
					</>
				}
			>
				<p className="text-sm">
					{inside.isPending
						? t("accounts.deleteCounting")
						: t("accounts.deleteHolds", { count: inside.data ?? 0 })}
				</p>
				<p className="mt-2 text-quiet text-sm">{t("accounts.deleteInstead")}</p>
			</Dialog>

			{/* Archiving a card that still owes is allowed, because the plastic may be gone while
			    the bill is not, and it says so first: the card leaves the ways to pay, and its
			    invoices stay where somebody pays them until they are paid. */}
			<Dialog
				open={archivingCard !== null}
				onOpenChange={(next) => !next && setArchivingCard(null)}
				title={t("accounts.archiveOwingTitle", { name: archivingCard?.name ?? "" })}
				description={t("accounts.archiveOwingBody", {
					amount: archivingCard ? owedText(archivingCard.id) : "",
				})}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setArchivingCard(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							disabled={archive.isPending}
							onClick={() => {
								if (archivingCard) archive.mutate(archivingCard.id);
								setArchivingCard(null);
							}}
						>
							{t("accounts.archiveAnyway")}
						</Button>
					</>
				}
			>
				<p className="text-quiet text-sm">{t("accounts.archiveOwingStays")}</p>
			</Dialog>

			<CardDialog
				card={cardTarget}
				addingTo={addingCardTo}
				accounts={rows}
				onClose={() => {
					setCardTarget(null);
					setAddingCardTo(null);
				}}
			/>

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={t("accounts.create")}
				description={t("accounts.createDescription", { space: currentSpace.name })}
				closeLabel={t("actions.close")}
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
							options={accountOptions(balances, t)}
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

					{/* What is already on the invoice that is open right now.
					    Optional, and the answer to the only real question somebody has when
					    they put an existing card into this: the cycle started before they got
					    here, and typing three weeks of purchases back in is not something
					    anybody does. What goes in is one expense on the card, dated today,
					    which joins the open invoice like any other purchase and shows up on
					    the invoice screen under a name that says what it is. */}
					{kind === "credit" && makesAnAccount ? (
						<Field
							label={t("accounts.invoiceSoFar")}
							hint={t("accounts.invoiceSoFarHint")}
							value={invoiceSoFar}
							onChange={(event) => setInvoiceSoFar(event.target.value)}
							numeric={true}
							inputMode="decimal"
							placeholder={t("fields.amountPlaceholder")}
						/>
					) : null}

					{/* Between the closing day and the due day the bank shows the invoice that
					    closed first, and that was the number typed above, which then landed on
					    the invoice a month later. In that window it has a field of its own. */}
					{kind === "credit" && makesAnAccount && closedNow ? (
						<Field
							label={t("accounts.closedSoFar", { day: dayAndMonth(closedNow.dueOn) })}
							hint={t("accounts.closedSoFarHint", { month: monthWord(closedNow.month) })}
							value={closedSoFar}
							onChange={(event) => setClosedSoFar(event.target.value)}
							numeric={true}
							inputMode="decimal"
							placeholder={t("fields.amountPlaceholder")}
						/>
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

					{/* A benefit card is an allowance with a day on it, and nothing is written
					    when the money lands, so what is on the card can only be worked out
					    from these two. Left empty, the card says so rather than guessing. */}
					{kind === "voucher" ? (
						<div className="grid gap-4 sm:grid-cols-2">
							<Field
								label={t("accounts.quota")}
								hint={t("accounts.quotaHint")}
								value={quota}
								onChange={(event) => setQuota(event.target.value)}
								numeric={true}
								inputMode="decimal"
								placeholder={t("fields.amountPlaceholder")}
							/>
							<Select
								label={t("accounts.quotaDay")}
								value={quotaDay}
								onChange={(event) => setQuotaDay(event.target.value)}
								options={quotaDays}
							/>
							{/* Decision 3 of 2.0.0: on a card that carries, what is on it today,
							    when somebody knows. Left empty, the allowance of this period is
							    what it holds, with what was spent in the period. */}
							{carriesByDefault(benefit) ? (
								<Field
									label={t("accounts.knownToday")}
									hint={t("accounts.knownTodayHint")}
									value={known}
									onChange={(event) => setKnown(event.target.value)}
									numeric={true}
									inputMode="decimal"
								/>
							) : null}
						</div>
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
					{/* How much is in this account today, which a card and a benefit card do
					    not have. A card holds a debt and what is on it is the invoice, asked
					    for above in its own words; a benefit card holds an allowance and what
					    is on it is worked out from the quota. The field was on both forms with
					    the sentence "how much is in this account today" over it, which is the
					    wrong question for either, and the model took whatever it was given. */}
					{makesAnAccount && kind !== "credit" && kind !== "voucher" ? (
						<Field
							label={t("accounts.balance")}
							hint={t("accounts.balanceHint")}
							value={balance}
							onChange={(event) => setBalance(event.target.value)}
							numeric={true}
							inputMode="decimal"
							placeholder={t("fields.amountPlaceholder")}
						/>
					) : null}
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
