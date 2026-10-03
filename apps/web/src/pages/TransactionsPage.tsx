// Everything that happened, newest first, with the filters that answer the questions
// people actually ask: what did I spend at that place, what is still to come, what
// went through this card.

import { addMonthsToMonth, addUpInBase, type CalendarDate, monthOf, todayIn } from "@cofre/core";
import {
	hasHappened,
	type Transaction,
	type TransactionKind,
	type TransactionStatus,
} from "@cofre/storage";
import {
	Button,
	buttonClasses,
	Callout,
	Dialog,
	EmptyState,
	Field,
	Icon,
	Menu,
	MenuItem,
	MenuLabel,
	MenuSeparator,
	Panel,
	SectionTitle,
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
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { QuickEntry } from "../components/QuickEntry.tsx";
import { type FilterQuery, SavedFilters } from "../components/SavedFilters.tsx";
import { SplitDialog } from "../components/SplitDialog.tsx";
import { sideOfMove, ToTransferDialog } from "../components/ToTransferDialog.tsx";
import { TransactionForm } from "../components/TransactionForm.tsx";
import { Value } from "../components/Value.tsx";
import { afterRecordsChange } from "../lib/afterRecords.ts";
import { fillAmount, readAmount } from "../lib/amounts.ts";
import {
	addressFromFilters,
	type Filters,
	filtersFromAddress,
	filtersFromSaved,
	narrowedIn,
} from "../lib/recordFilters.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions, cardOptions, paidWithLabel } from "../lib/wayLabel.ts";
import { ROUTES } from "../routes.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

export function TransactionsPage() {
	const { t, i18n } = useTranslation();
	/** An invoice by its month, with the year only when it is not this one. */
	const invoiceMonthName = (month: string) =>
		new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			month: "long",
			year: month.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
			timeZone: "UTC",
		}).format(new Date(`${month}-01T00:00:00Z`));
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();
	const navigate = useNavigate();

	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	/** A month in words, with the year only when it is not this one. */
	const monthLong = (month: string) =>
		new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			month: "long",
			year: month.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
			timeZone: "UTC",
		}).format(new Date(`${month}-01T00:00:00Z`));
	const thisMonth = monthOf(today);

	/**
	 * What the list shows comes from the address and from nowhere else.
	 *
	 * Holding it in state as well, and keeping the two in step, is how a click, a reload, a
	 * link and the back button come to disagree. So there is one source of truth, and
	 * narrowing the list is a change of address.
	 */
	const asked = useSearch({ from: ROUTES.transactions });
	const filters = useMemo(() => filtersFromAddress(asked, thisMonth), [asked, thisMonth]);

	/** Replacing rather than pushing, so the back button leaves instead of walking keystrokes. */
	const show = (next: Filters) =>
		void navigate({
			to: ROUTES.transactions,
			search: addressFromFilters(next, thisMonth),
			replace: true,
		});
	const change = (patch: Partial<Filters>) => show({ ...filters, ...patch });

	const [isOpen, setOpen] = useState(false);
	const [editing, setEditing] = useState<Transaction | null>(null);
	const [picked, setPicked] = useState<string[]>([]);

	/**
	 * What is about to be deleted, and which of the three deletions it is.
	 *
	 * All three fired straight from a click, with no undo and no toast, and one of them
	 * was two clicks from the header tickbox: select every record on the screen, press
	 * the red button, and a month was gone.
	 */
	const [dropping, setDropping] = useState<
		| { kind: "one"; row: Transaction }
		| { kind: "group"; row: Transaction; group: string }
		| { kind: "many" }
		| null
	>(null);
	const [moveTo, setMoveTo] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [taught, setTaught] = useState<string | null>(null);
	const [dividing, setDividing] = useState<Transaction | null>(null);
	/**
	 * Open when the address arrives already narrowed, so a link that carries a kind opens
	 * with the control that set it in view rather than hiding why the list is short.
	 */
	const [showFilters, setShowFilters] = useState(() => narrowedIn(filters) > 0);

	const spaceId = currentSpace?.id ?? "";

	const accounts = useQuery({
		// Archived accounts are here so that an old record still says where it happened.
		queryKey: ["accounts", spaceId, "includingArchived"],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(spaceId, { includeArchived: true }) ?? [],
	});

	/**
	 * Which of the actions on this screen this person may actually use.
	 *
	 * Every one of them names the permission the repository behind it asks for, so the
	 * button and the refusal cannot disagree. This screen used to hold its own list of
	 * roles, which is how "Apagar o parcelamento inteiro" ended up offered to a Viewer
	 * and doing nothing at all when it was pressed.
	 */
	const { mayCall, seesOwnRowsOnly } = useWhatIMayDo(spaceId);
	const mayWrite = mayCall("transactions.create");
	const mayUpdate = mayCall("transactions.update");
	/** Moving between invoices reads the whole invoice, which closes to whoever sees only theirs. */
	const mayMoveInvoice = mayCall("invoices.move") && !seesOwnRowsOnly;
	const mayDelete = mayCall("transactions.remove");
	const mayDeletePlan = mayCall("transactions.removeGroup");
	// What a selection offers, each by the call it makes.
	const maySettleMany = mayCall("transactions.settleMany");
	const mayChangeMany = mayCall("transactions.updateMany");
	const mayDeleteMany = mayCall("transactions.removeMany");
	const mayTeach = mayCall("rules.create");
	const mayShare = mayCall("sharing.split");
	const mayReconcile = mayCall("transactions.reconcile");
	const mayRefund = mayCall("transactions.refund");
	const mayMakeAMove = mayCall("transactions.toTransfer");
	/** The checkboxes are worth drawing when at least one thing can be done with them. */
	const mayPick = maySettleMany || mayChangeMany || mayDeleteMany;
	/** And the menu of a row, when at least one item of it would be drawn. */
	const mayActOnARow =
		mayUpdate ||
		mayTeach ||
		mayShare ||
		mayReconcile ||
		mayDelete ||
		mayDeletePlan ||
		mayMoveInvoice ||
		mayRefund ||
		mayMakeAMove;

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	const cards = useQuery({
		// The archived ones too, for the name of a record made with a card since put away.
		queryKey: ["cards", spaceId, "includingArchived"],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.cards.list(spaceId, { includeArchived: true }) ?? [],
	});

	// Only a shared space needs to know who else is in it, and only to divide a cost.
	// The people of this space, not everybody this person shares any space with: a
	// division is between the members of the space the expense is in, and offering the
	// others meant offering a division the model was right to refuse.
	const peers = useQuery({
		queryKey: ["peopleOfSpace", spaceId],
		enabled: Boolean(session && currentSpace?.kind === "shared" && spaceId !== ""),
		queryFn: () => session?.users.inSpace(spaceId) ?? [],
	});

	// Asking for a category that has others under it means asking for all of them, which
	// is the only reading that makes a two level list useful.
	const chosenCategories = useMemo(() => {
		if (filters.categoryId === "" || filters.categoryId === "none") return undefined;
		const children = (categories.data ?? [])
			.filter((category) => category.parentId === filters.categoryId)
			.map((category) => category.id);
		return [filters.categoryId, ...children];
	}, [filters.categoryId, categories.data]);

	const period = useMemo(() => {
		if (filters.month === "") return {};
		const [year, month] = filters.month.split("-").map(Number);
		const lastDay = new Date(Date.UTC(year ?? 2026, month ?? 1, 0)).getUTCDate();
		return {
			from: `${filters.month}-01`,
			to: `${filters.month}-${String(lastDay).padStart(2, "0")}`,
		};
	}, [filters.month]);

	const records = useQuery({
		queryKey: ["transactions", spaceId, filters, chosenCategories],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.transactions.list({
				spaceId,
				kind: filters.kind === "" ? undefined : filters.kind,
				status: filters.status === "" ? undefined : filters.status,
				accountId: filters.accountId === "" ? undefined : filters.accountId,
				cardId: filters.cardId === "" ? undefined : filters.cardId,
				search: filters.search === "" ? undefined : filters.search,
				categoryIds: chosenCategories,
				withoutCategory: filters.categoryId === "none",
				...period,
			}) ?? [],
	});

	const invalidate = () => {
		afterRecordsChange(queries);
	};

	/** A change over a selection either goes through or says why, and then clears it. */
	const afterBulk = () => {
		setPicked([]);
		setMoveTo("");
		setProblem(null);
		invalidate();
	};

	const complain = (error: unknown) => setProblem(sayWhy(error, t));

	const changeMany = useMutation({
		mutationFn: async (patch: {
			status?: TransactionStatus;
			accountId?: string;
			categoryId?: string;
		}) => session?.transactions.updateMany(picked, patch),
		onSuccess: afterBulk,
		onError: complain,
	});

	// Paid, said of several records, is the button on one record pressed for each: a day
	// still to come moves to today, which is when somebody is saying it. Writing only the
	// status did nothing to a record dated ahead, which is a fact already and waits for
	// its day, so the button pressed and nothing on the screen changed.
	const settlePicked = useMutation({
		mutationFn: async () => session?.transactions.settleMany(picked, today),
		onSuccess: afterBulk,
		onError: complain,
	});

	const removeManyPicked = useMutation({
		mutationFn: async () => session?.transactions.removeMany(picked),
		onSuccess: afterBulk,
		onError: complain,
	});

	// Each of these had no onError, so a refusal or a dropped connection did nothing
	// visible at all: the row stayed where it was and the only way to find out was to
	// reload the page and look.
	const settle = useMutation({
		mutationFn: async (id: string) => session?.transactions.settle(id, today),
		onSuccess: invalidate,
		onError: complain,
	});
	/**
	 * Moving a card purchase to the invoice before or after, which asks first when either of
	 * the two invoices already has a payment: the payment stays where it is, so one ends with
	 * credit and the other owes more.
	 */
	const [movingFirst, setMovingFirst] = useState<{
		row: Transaction;
		towards: "earlier" | "later";
		month: string;
		other: string;
	} | null>(null);
	const moveToInvoice = useMutation({
		mutationFn: async (input: {
			row: Transaction;
			towards: "earlier" | "later";
			asked?: boolean;
		}) => {
			if (!session || input.row.invoiceMonth === null) return;
			const from = input.row.invoiceMonth;
			const to = addMonthsToMonth(from, input.towards === "earlier" ? -1 : 1);
			if (!input.asked) {
				const states = await session.invoices.list(input.row.accountId, today);
				const paid = [from, to].find((month) => {
					const one = states.find((state) => state.month === month);
					return one !== undefined && (one.paid > 0 || one.scheduled > 0);
				});
				if (paid !== undefined) {
					setMovingFirst({
						row: input.row,
						towards: input.towards,
						month: paid,
						other: paid === from ? to : from,
					});
					return;
				}
			}
			await session.invoices.move(input.row.id, input.towards);
			invalidate();
		},
		onError: complain,
	});

	/**
	 * A purchase on a benefit card taken back. It comes back to the card and off the category
	 * of the purchase, and it is never income, because nothing came in.
	 */
	const [refunding, setRefunding] = useState<Transaction | null>(null);
	/** A record being made into the move between accounts it really was. */
	const [makingAMove, setMakingAMove] = useState<Transaction | null>(null);
	const [refundAmount, setRefundAmount] = useState("");
	const [refundOn, setRefundOn] = useState("");
	function openRefund(row: Transaction) {
		setProblem(null);
		setRefunding(row);
		setRefundAmount(fillAmount(-row.amount, i18n.resolvedLanguage, row.currency));
		setRefundOn(today);
	}
	const refund = useMutation({
		mutationFn: async () => {
			if (!session || !refunding) return;
			await session.transactions.refund(refunding.id, {
				amount: readAmount(refundAmount, refunding.currency),
				happenedOn: refundOn as CalendarDate,
				description: t("transactions.refundOf", { description: refunding.description }),
			});
		},
		onSuccess: () => {
			setRefunding(null);
			invalidate();
		},
		onError: complain,
	});

	const remove = useMutation({
		mutationFn: async (id: string) => session?.transactions.remove(id),
		onSuccess: invalidate,
		onError: complain,
	});
	const removeGroup = useMutation({
		mutationFn: async (groupId: string) => session?.transactions.removeGroup(groupId),
		onSuccess: invalidate,
		onError: complain,
	});
	/**
	 * Turns one record into a rule: whatever was written in the description becomes the
	 * text to look for, and the category it was given becomes the answer. One click,
	 * because the person has already made the decision by sorting this record.
	 */
	const teach = useMutation({
		mutationFn: async (row: Transaction) => {
			if (!session || !row.categoryId) return null;
			return session.rules.create({
				spaceId: row.spaceId,
				matchText: row.description,
				categoryId: row.categoryId,
			});
		},
		onSuccess: (rule) => {
			if (rule) setTaught(rule.matchText);
			void queries.invalidateQueries({ queryKey: ["rules"] });
		},
		onError: complain,
	});

	const reconcile = useMutation({
		mutationFn: async (input: { id: string; reconciled: boolean }) =>
			session?.transactions.reconcile(input.id, input.reconciled),
		onSuccess: invalidate,
		onError: complain,
	});

	const narrowed = narrowedIn(filters);

	const clearFilters = () => {
		show({ ...filters, kind: "", status: "", accountId: "", cardId: "", categoryId: "" });
		setPicked([]);
	};

	if (!currentSpace) return null;

	const rows = records.data ?? [];
	const nameOf = (accountId: string) =>
		accounts.data?.find((account) => account.id === accountId)?.name ?? "";
	const nameOfCategory = (categoryId: string) =>
		categories.data?.find((category) => category.id === categoryId)?.name ?? "";

	// In the currency of the space, which is what the footer labels it with. It added the
	// amount as written, so a dinner of forty dollars went into a total in reais as forty.
	const total = addUpInBase(rows);

	const visible = rows.map((row) => row.id);
	const allPicked = visible.length > 0 && visible.every((id) => picked.includes(id));
	const toggle = (id: string) =>
		setPicked((current) =>
			current.includes(id) ? current.filter((kept) => kept !== id) : [...current, id],
		);

	return (
		<div className="space-y-6">
			<SectionTitle
				level="h1"
				action={
					mayWrite ? (
						<>
							<Button
								size="small"
								variant="primary"
								icon={<Icon name="plus" />}
								onClick={() => {
									setEditing(null);
									setOpen(true);
								}}
							>
								{t("transactions.create")}
							</Button>
							{/* The screen offered three ways to type a record in and no way to read a
							    file, which was four clicks away under the settings. This is where
							    somebody already is when they decide not to type a month by hand. */}
							<Link
								to={ROUTES.import}
								className={buttonClasses({ variant: "secondary", size: "small" })}
							>
								{t("importing.title")}
							</Link>
						</>
					) : null
				}
			>
				{t("transactions.title")}
			</SectionTitle>

			{mayWrite ? (
				<Panel>
					<QuickEntry spaceId={spaceId} accounts={accounts.data ?? []} today={today} />
				</Panel>
			) : null}

			{/* Six filters open at all times took a third of the screen before a single
			    record appeared. The month is the one everybody changes, and searching is
			    the one everybody does, so those two stay out. The rest are behind a
			    button that says how many of them are doing something. */}
			<Panel
				title={t("transactions.listTitle")}
				action={
					<>
						<Button
							size="small"
							variant={showFilters ? "primary" : "secondary"}
							icon={<Icon name="filter" />}
							onClick={() => setShowFilters(!showFilters)}
							aria-expanded={showFilters}
						>
							{narrowed === 0
								? t("transactions.filters")
								: t("transactions.filtersOn", { count: narrowed })}
						</Button>
						{narrowed > 0 ? (
							<Button size="small" variant="quiet" onClick={clearFilters}>
								{t("transactions.clearFilters")}
							</Button>
						) : null}
					</>
				}
			>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<Field
						label={t("transactions.month")}
						type="month"
						value={filters.month}
						onChange={(event) => change({ month: event.target.value })}
					/>
					<Field
						label={t("transactions.search")}
						value={filters.search}
						onChange={(event) => change({ search: event.target.value })}
						placeholder={t("transactions.searchPlaceholder")}
						type="search"
					/>
				</div>

				{showFilters ? (
					<div className="mt-3 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-4">
						<Select
							label={t("transactions.kind")}
							value={filters.kind}
							onChange={(event) => change({ kind: event.target.value as TransactionKind | "" })}
							options={[
								{ value: "", label: t("transactions.anyKind") },
								{ value: "expense", label: t("transactionKind.expense") },
								{ value: "income", label: t("transactionKind.income") },
								// Still tipo=transfer in the address, which somebody may have saved.
								{ value: "transfer", label: t("transactions.kindMoves") },
							]}
						/>
						<Select
							label={t("transactions.status")}
							value={filters.status}
							onChange={(event) => change({ status: event.target.value as TransactionStatus | "" })}
							options={[
								{ value: "", label: t("transactions.anyStatus") },
								{ value: "settled", label: t("transactionStatus.settled") },
								{ value: "planned", label: t("transactionStatus.planned") },
							]}
						/>
						<Select
							label={t("transactions.account")}
							value={filters.accountId}
							onChange={(event) => change({ accountId: event.target.value })}
							options={[
								{ value: "", label: t("transactions.anyAccount") },
								...accountOptions(accounts.data ?? [], t),
							]}
						/>
						{/* Only when there is one. A space with no card should not be asked
						    about cards. */}
						{(cards.data ?? []).length > 0 ? (
							<Select
								label={t("filters.card")}
								value={filters.cardId}
								onChange={(event) => change({ cardId: event.target.value })}
								options={[
									{ value: "", label: t("filters.anyCard") },
									...cardOptions(cards.data ?? [], t),
								]}
							/>
						) : null}
						<Select
							label={t("transactions.category")}
							value={filters.categoryId}
							onChange={(event) => change({ categoryId: event.target.value })}
							options={[
								{ value: "", label: t("transactions.anyCategory") },
								{ value: "none", label: t("transactions.noCategory") },
								...(categories.data ?? [])
									.filter((category) => category.parentId === null)
									.flatMap((parent) => [
										{ value: parent.id, label: parent.name },
										...(categories.data ?? [])
											.filter((child) => child.parentId === parent.id)
											.map((child) => ({
												value: child.id,
												label: `  ${child.name}`,
											})),
									]),
							]}
						/>
					</div>
				) : null}

				<div className="mt-3">
					<SavedFilters
						spaceId={spaceId}
						current={filters as unknown as FilterQuery}
						onApply={(query) => {
							show(filtersFromSaved(query, thisMonth));
							setPicked([]);
						}}
					/>
				</div>
			</Panel>

			{records.isPending ? <Skeleton lines={5} /> : null}

			{!records.isPending && rows.length === 0 ? (
				<EmptyState
					icon="wallet"
					title={t("transactions.emptyTitle")}
					description={t("transactions.emptyBody")}
					action={
						// The empty state was the one door left unlocked. The button at the top
						// and the quick entry beside it both asked first, which made this one
						// read as the sanctioned way in, and it is the state a Viewer is most
						// likely to land on: any quiet month, or a filter that matches nothing.
						mayWrite ? (
							<div className="flex flex-wrap justify-center gap-2">
								<Button
									variant="primary"
									onClick={() => {
										setEditing(null);
										setOpen(true);
									}}
								>
									{t("transactions.create")}
								</Button>
								{/* A quiet month is exactly where somebody reaches for a statement. */}
								<Link
									to={ROUTES.import}
									className={buttonClasses({ variant: "secondary", size: "medium" })}
								>
									{t("importing.title")}
								</Link>
							</div>
						) : null
					}
				/>
			) : null}

			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			{taught ? (
				<Callout tone="neutral">{t("transactions.taught", { text: taught })}</Callout>
			) : null}

			{picked.length > 0 ? (
				<div className="flex flex-wrap items-center gap-3 rounded-md border border-accent bg-accentSoft px-4 py-3 text-sm">
					<span className="font-medium text-ink">
						{t("transactions.picked", { count: picked.length })}
					</span>
					{maySettleMany ? (
						<Button
							size="small"
							variant="secondary"
							onClick={() => settlePicked.mutate()}
							disabled={settlePicked.isPending}
						>
							{t("transactions.settle")}
						</Button>
					) : null}
					{mayChangeMany ? (
						<>
							<label className="flex items-center gap-2 text-quiet">
								{t("transactions.moveTo")}
								<select
									value={moveTo}
									aria-label={t("transactions.moveTo")}
									onChange={(event) => {
										setMoveTo(event.target.value);
										if (event.target.value !== "") {
											changeMany.mutate({ accountId: event.target.value });
										}
									}}
									className="h-8 rounded-sm border border-line bg-panel px-2 text-sm text-ink"
								>
									<option value="">{t("transactions.pickAccount")}</option>
									{(accounts.data ?? [])
										.filter((account) => account.archivedAt === null)
										.map((account) => (
											<option key={account.id} value={account.id}>
												{account.name}
											</option>
										))}
								</select>
							</label>
							<label className="flex items-center gap-2 text-quiet">
								{t("transactions.sortInto")}
								<select
									value=""
									aria-label={t("transactions.sortInto")}
									onChange={(event) => {
										if (event.target.value !== "") {
											changeMany.mutate({ categoryId: event.target.value });
										}
									}}
									className="h-8 rounded-sm border border-line bg-panel px-2 text-sm text-ink"
								>
									<option value="">{t("transactions.pickCategory")}</option>
									{(categories.data ?? [])
										.filter((category) => category.parentId === null)
										.flatMap((parent) => [
											<option key={parent.id} value={parent.id}>
												{parent.name}
											</option>,
											...(categories.data ?? [])
												.filter((child) => child.parentId === parent.id)
												.map((child) => (
													<option key={child.id} value={child.id}>
														{`  ${child.name}`}
													</option>
												)),
										])}
								</select>
							</label>
						</>
					) : null}
					{mayDeleteMany ? (
						<Button
							size="small"
							variant="destructive"
							onClick={() => setDropping({ kind: "many" })}
							disabled={removeManyPicked.isPending}
						>
							{t("actions.delete")}
						</Button>
					) : null}
					<Button size="small" variant="quiet" onClick={() => setPicked([])}>
						{t("transactions.clearPicked")}
					</Button>
				</div>
			) : null}

			{rows.length > 0 ? (
				<Panel flush>
					<Table caption={t("transactions.caption")}>
						<TableHead>
							<TableRow>
								{/* The column itself goes when nothing can be done with a selection,
								    header and cells together, so the table keeps its shape. */}
								{mayPick ? (
									<TableHeader>
										<input
											type="checkbox"
											checked={allPicked}
											aria-label={t("transactions.pickAll")}
											onChange={(event) => setPicked(event.target.checked ? visible : [])}
											className="size-4 accent-[var(--ink)]"
										/>
									</TableHeader>
								) : null}
								<TableHeader>{t("transactions.day")}</TableHeader>
								<TableHeader>{t("transactions.description")}</TableHeader>
								{/* The account is the first thing to go when the screen is narrow:
								    it is context, and the description is the answer. */}
								<TableHeader className="hidden sm:table-cell">
									{t("transactions.account")}
								</TableHeader>
								<TableHeader numeric={true}>{t("transactions.amount")}</TableHeader>
								<TableHeader numeric={true}>
									<span className="sr-only">{t("transactions.actions")}</span>
								</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									{mayPick ? (
										<TableCell>
											<input
												type="checkbox"
												checked={picked.includes(row.id)}
												aria-label={t("transactions.pick", { description: row.description })}
												onChange={() => toggle(row.id)}
												className="size-4 accent-[var(--ink)]"
											/>
										</TableCell>
									) : null}
									<TableCell className="whitespace-nowrap font-mono text-quiet">
										{row.happenedOn.slice(8)}/{row.happenedOn.slice(5, 7)}
									</TableCell>
									<TableCell>
										<span className={hasHappened(row, today) ? "" : "text-quiet"}>
											{row.description}
										</span>
										{row.categoryId ? (
											<span className="ml-2 text-xs text-quiet">
												{nameOfCategory(row.categoryId)}
											</span>
										) : null}
										{hasHappened(row, today) ? null : (
											<span className="ml-2 text-xs text-ochre">
												{t("transactionStatus.planned")}
											</span>
										)}
										{row.reconciledAt !== null ? (
											<span className="ml-2 text-xs text-cedar">
												{t("transactions.reconciled")}
											</span>
										) : null}
									</TableCell>
									<TableCell className="hidden text-quiet sm:table-cell">
										{/* The card beside the account, when the record says which: the
										    card and the current account of one bank carry one name, and
										    the plastic is what somebody remembers paying with. */}
										{paidWithLabel(
											nameOf(row.accountId),
											row.cardId === null
												? null
												: cards.data?.find((card) => card.id === row.cardId),
										)}
										{row.counterAccountId ? ` → ${nameOf(row.counterAccountId)}` : ""}
									</TableCell>
									<TableCell numeric={true}>
										<Value
											amount={row.amount}
											currency={row.currency}
											tone={row.kind === "transfer" ? "neutral" : "auto"}
										/>
									</TableCell>
									<TableCell numeric={true}>
										{/* A button that opens an empty popup is worse than no button. */}
										{mayActOnARow ? (
											<Menu
												align="end"
												trigger={
													<Button
														size="small"
														variant="quiet"
														aria-label={t("transactions.actions")}
													>
														<Icon name="settings" />
													</Button>
												}
											>
												{/* A row of a split invoice, or of one paid with another card, changes
												    only with the arrangement: this says why, and what to do instead. */}
												{row.arrangedFor !== null ? (
													<MenuLabel>
														{t(
															row.arrangedBy === "card"
																? "arrangement.lockedCard"
																: "arrangement.lockedParts",
															{ month: monthLong(row.arrangedFor) },
														)}
													</MenuLabel>
												) : null}
												{mayUpdate && row.arrangedFor === null ? (
													<MenuItem
														onSelect={() => {
															setEditing(row);
															setOpen(true);
														}}
													>
														{t("transactions.edit")}
													</MenuItem>
												) : null}
												{row.status === "planned" && mayUpdate ? (
													<MenuItem onSelect={() => settle.mutate(row.id)}>
														{t("transactions.settle")}
													</MenuItem>
												) : null}
												{/* A purchase on a card the bank closed onto another invoice, moved
												    from where somebody finds it, and not only from the invoice. */}
												{mayRefund &&
												row.kind === "expense" &&
												row.amount < 0 &&
												accounts.data?.find((one) => one.id === row.accountId)?.kind ===
													"voucher" ? (
													<MenuItem onSelect={() => openRefund(row)}>
														{t("transactions.refund")}
													</MenuItem>
												) : null}
												{/* Money out that went into savings, or a payment written from both
												    ends by the importer of 1.x, made into the move it was. */}
												{mayMakeAMove &&
												row.arrangedFor === null &&
												sideOfMove(row, accounts.data ?? []) !== null ? (
													<MenuItem onSelect={() => setMakingAMove(row)}>
														{t("toMove.action")}
													</MenuItem>
												) : null}
												{mayMoveInvoice &&
												row.arrangedFor === null &&
												row.invoiceMonth !== null &&
												row.kind !== "transfer" ? (
													<>
														<MenuItem
															onSelect={() => moveToInvoice.mutate({ row, towards: "earlier" })}
														>
															{t("invoice.moveEarlier")}
														</MenuItem>
														<MenuItem
															onSelect={() => moveToInvoice.mutate({ row, towards: "later" })}
														>
															{t("invoice.moveLater")}
														</MenuItem>
													</>
												) : null}
												{row.categoryId && mayTeach ? (
													<MenuItem onSelect={() => teach.mutate(row)}>
														{t("transactions.alwaysSortLikeThis")}
													</MenuItem>
												) : null}
												{currentSpace.kind === "shared" &&
												row.kind === "expense" &&
												row.arrangedFor === null &&
												mayShare ? (
													<MenuItem onSelect={() => setDividing(row)}>
														{t("sharing.divide")}
													</MenuItem>
												) : null}
												{mayReconcile ? (
													<MenuItem
														onSelect={() =>
															reconcile.mutate({
																id: row.id,
																reconciled: row.reconciledAt === null,
															})
														}
													>
														{row.reconciledAt === null
															? t("transactions.reconcile")
															: t("transactions.unreconcile")}
													</MenuItem>
												) : null}
												{mayDelete && row.arrangedFor === null ? <MenuSeparator /> : null}
												{mayDelete && row.arrangedFor === null ? (
													<MenuItem onSelect={() => setDropping({ kind: "one", row })}>
														{t("actions.delete")}
													</MenuItem>
												) : null}
												{mayDeletePlan && row.installmentGroup && row.arrangedFor === null ? (
													<MenuItem
														onSelect={() =>
															setDropping({
																kind: "group",
																row,
																group: row.installmentGroup ?? "",
															})
														}
													>
														{t("transactions.deleteGroup")}
													</MenuItem>
												) : null}
											</Menu>
										) : null}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>

					<p className="flex items-baseline justify-between border-t border-line bg-sunken px-4 py-3 text-sm">
						<span className="text-quiet">
							{t("transactions.countedIn", { count: rows.length })}
						</span>
						<Value amount={total} currency={currentSpace.baseCurrency} tone="auto" />
					</p>
				</Panel>
			) : null}

			<ToTransferDialog
				record={makingAMove}
				onClose={() => setMakingAMove(null)}
				accounts={accounts.data ?? []}
				today={today}
			/>

			<Dialog
				open={refunding !== null}
				onOpenChange={(next) => !next && setRefunding(null)}
				title={t("transactions.refundTitle")}
				description={t("transactions.refundBody")}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setRefunding(null)}>
							{t("actions.cancel")}
						</Button>
						<Button onClick={() => refund.mutate()} disabled={refund.isPending}>
							{t("transactions.refund")}
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<Field
						label={t("transactions.amount")}
						value={refundAmount}
						onChange={(event) => setRefundAmount(event.target.value)}
						numeric={true}
						inputMode="decimal"
					/>
					<Field
						label={t("transactions.day")}
						type="date"
						value={refundOn}
						onChange={(event) => setRefundOn(event.target.value)}
					/>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</div>
			</Dialog>

			<Dialog
				open={movingFirst !== null}
				onOpenChange={(next) => !next && setMovingFirst(null)}
				title={t("invoice.alreadyPaidTitle")}
				description={
					movingFirst
						? t("invoice.alreadyPaidBody", {
								month: invoiceMonthName(movingFirst.month),
								other: invoiceMonthName(movingFirst.other),
							})
						: ""
				}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setMovingFirst(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							onClick={() => {
								if (movingFirst) {
									moveToInvoice.mutate({
										row: movingFirst.row,
										towards: movingFirst.towards,
										asked: true,
									});
								}
								setMovingFirst(null);
							}}
						>
							{t("invoice.moveAnyway")}
						</Button>
					</>
				}
			>
				{null}
			</Dialog>

			<SplitDialog
				open={dividing !== null}
				onOpenChange={(open) => {
					if (!open) setDividing(null);
				}}
				record={dividing}
				people={peers.data ?? []}
			/>

			<TransactionForm
				open={isOpen}
				onOpenChange={setOpen}
				accounts={accounts.data ?? []}
				spaceId={spaceId}
				editing={editing}
				today={today}
			/>

			{/* One question for the three ways of deleting, saying what goes in each. */}
			<Dialog
				open={dropping !== null}
				onOpenChange={(next) => !next && setDropping(null)}
				title={t("transactions.deleteTitle")}
				description={t("transactions.deleteDescription")}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setDropping(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (dropping?.kind === "one") remove.mutate(dropping.row.id);
								if (dropping?.kind === "group") removeGroup.mutate(dropping.group);
								if (dropping?.kind === "many") removeManyPicked.mutate();
								setDropping(null);
							}}
						>
							{t("actions.delete")}
						</Button>
					</>
				}
			>
				<p className="text-sm">
					{dropping?.kind === "one"
						? t("transactions.deleteOne", { description: dropping.row.description })
						: dropping?.kind === "group"
							? t("transactions.deleteWholeGroup", {
									count: dropping.row.installmentCount ?? 0,
									description: dropping.row.description,
								})
							: t("transactions.deleteMany", { count: picked.length })}
				</p>
				{dropping?.kind === "one" && dropping.row.recurrenceId ? (
					<p className="mt-2 text-quiet text-sm">{t("transactions.deleteOccurrence")}</p>
				) : null}
				<p className="mt-2 text-quiet text-sm">{t("transactions.deleteForever")}</p>
			</Dialog>
		</div>
	);
}
