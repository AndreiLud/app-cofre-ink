// Everything that happened, newest first, with the filters that answer the questions
// people actually ask: what did I spend at that place, what is still to come, what
// went through this card.

import { monthOf, todayIn } from "@cofre/core";
import type { Transaction, TransactionKind, TransactionStatus } from "@cofre/storage";
import {
	Button,
	Callout,
	EmptyState,
	Field,
	Icon,
	Menu,
	MenuItem,
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
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { QuickEntry } from "../components/QuickEntry.tsx";
import { type FilterQuery, SavedFilters } from "../components/SavedFilters.tsx";
import { SplitDialog } from "../components/SplitDialog.tsx";
import { TransactionForm } from "../components/TransactionForm.tsx";
import { Value } from "../components/Value.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

type Filters = {
	kind: TransactionKind | "";
	status: TransactionStatus | "";
	accountId: string;
	/** A category, the word "none" for what was never sorted, or empty for everything. */
	categoryId: string;
	search: string;
	month: string;
};

/** A saved filter is stored as it was written, so an old one may not have every key. */
function filtersFrom(query: FilterQuery, fallbackMonth: string): Filters {
	const text = (name: string) => (typeof query[name] === "string" ? (query[name] as string) : "");
	return {
		kind: text("kind") as TransactionKind | "",
		status: text("status") as TransactionStatus | "",
		accountId: text("accountId"),
		categoryId: text("categoryId"),
		search: text("search"),
		month: "month" in query ? text("month") : fallbackMonth,
	};
}

export function TransactionsPage() {
	const { t } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	const [filters, setFilters] = useState<Filters>({
		kind: "",
		status: "",
		accountId: "",
		categoryId: "",
		search: "",
		month: monthOf(today),
	});
	const [isOpen, setOpen] = useState(false);
	const [editing, setEditing] = useState<Transaction | null>(null);
	const [picked, setPicked] = useState<string[]>([]);
	const [moveTo, setMoveTo] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [taught, setTaught] = useState<string | null>(null);
	const [dividing, setDividing] = useState<Transaction | null>(null);
	const [showFilters, setShowFilters] = useState(false);

	const spaceId = currentSpace?.id ?? "";

	const accounts = useQuery({
		// Archived accounts are here so that an old record still says where it happened.
		queryKey: ["accounts", spaceId, "includingArchived"],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(spaceId, { includeArchived: true }) ?? [],
	});

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	// Only a shared space needs to know who else is in it, and only to divide a cost.
	const peers = useQuery({
		queryKey: ["peers", spaceId],
		enabled: Boolean(session && currentSpace?.kind === "shared"),
		queryFn: () => session?.users.peers() ?? [],
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
				search: filters.search === "" ? undefined : filters.search,
				categoryIds: chosenCategories,
				withoutCategory: filters.categoryId === "none",
				...period,
			}) ?? [],
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["transactions"] });
		void queries.invalidateQueries({ queryKey: ["balances"] });
		void queries.invalidateQueries({ queryKey: ["advice"] });
	};

	/** A change over a selection either goes through or says why, and then clears it. */
	const afterBulk = () => {
		setPicked([]);
		setMoveTo("");
		setProblem(null);
		invalidate();
	};

	const complain = (error: unknown) => {
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
	};

	const changeMany = useMutation({
		mutationFn: async (patch: {
			status?: TransactionStatus;
			accountId?: string;
			categoryId?: string;
		}) => session?.transactions.updateMany(picked, patch),
		onSuccess: afterBulk,
		onError: complain,
	});

	const removeManyPicked = useMutation({
		mutationFn: async () => session?.transactions.removeMany(picked),
		onSuccess: afterBulk,
		onError: complain,
	});

	const settle = useMutation({
		mutationFn: async (id: string) => session?.transactions.settle(id),
		onSuccess: invalidate,
	});
	const remove = useMutation({
		mutationFn: async (id: string) => session?.transactions.remove(id),
		onSuccess: invalidate,
	});
	const removeGroup = useMutation({
		mutationFn: async (groupId: string) => session?.transactions.removeGroup(groupId),
		onSuccess: invalidate,
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
	});

	/** How many of the filters behind the button are doing something. */
	const narrowed = [filters.kind, filters.status, filters.accountId, filters.categoryId].filter(
		(value) => value !== "",
	).length;

	const clearFilters = () => {
		setFilters({ ...filters, kind: "", status: "", accountId: "", categoryId: "" });
		setPicked([]);
	};

	if (!currentSpace) return null;

	const rows = records.data ?? [];
	const nameOf = (accountId: string) =>
		accounts.data?.find((account) => account.id === accountId)?.name ?? "";
	const nameOfCategory = (categoryId: string) =>
		categories.data?.find((category) => category.id === categoryId)?.name ?? "";

	const total = rows.reduce((sum, row) => (row.kind === "transfer" ? sum : sum + row.amount), 0);

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
				}
			>
				{t("transactions.title")}
			</SectionTitle>

			<Panel>
				<QuickEntry spaceId={spaceId} accounts={accounts.data ?? []} today={today} />
			</Panel>

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
						onChange={(event) => setFilters({ ...filters, month: event.target.value })}
					/>
					<Field
						label={t("transactions.search")}
						value={filters.search}
						onChange={(event) => setFilters({ ...filters, search: event.target.value })}
						placeholder={t("transactions.searchPlaceholder")}
						type="search"
					/>
				</div>

				{showFilters ? (
					<div className="mt-3 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-4">
						<Select
							label={t("transactions.kind")}
							value={filters.kind}
							onChange={(event) =>
								setFilters({ ...filters, kind: event.target.value as TransactionKind | "" })
							}
							options={[
								{ value: "", label: t("transactions.anyKind") },
								{ value: "expense", label: t("transactionKind.expense") },
								{ value: "income", label: t("transactionKind.income") },
								{ value: "transfer", label: t("transactionKind.transfer") },
							]}
						/>
						<Select
							label={t("transactions.status")}
							value={filters.status}
							onChange={(event) =>
								setFilters({ ...filters, status: event.target.value as TransactionStatus | "" })
							}
							options={[
								{ value: "", label: t("transactions.anyStatus") },
								{ value: "settled", label: t("transactionStatus.settled") },
								{ value: "planned", label: t("transactionStatus.planned") },
							]}
						/>
						<Select
							label={t("transactions.account")}
							value={filters.accountId}
							onChange={(event) => setFilters({ ...filters, accountId: event.target.value })}
							options={[
								{ value: "", label: t("transactions.anyAccount") },
								...(accounts.data ?? []).map((account) => ({
									value: account.id,
									label: account.name,
								})),
							]}
						/>
						<Select
							label={t("transactions.category")}
							value={filters.categoryId}
							onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}
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
							setFilters(filtersFrom(query, monthOf(today)));
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
						<Button
							variant="primary"
							onClick={() => {
								setEditing(null);
								setOpen(true);
							}}
						>
							{t("transactions.create")}
						</Button>
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
					<Button
						size="small"
						variant="secondary"
						onClick={() => changeMany.mutate({ status: "settled" })}
						disabled={changeMany.isPending}
					>
						{t("transactions.settle")}
					</Button>
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
					<Button
						size="small"
						variant="destructive"
						onClick={() => removeManyPicked.mutate()}
						disabled={removeManyPicked.isPending}
					>
						{t("actions.delete")}
					</Button>
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
								<TableHeader>
									<input
										type="checkbox"
										checked={allPicked}
										aria-label={t("transactions.pickAll")}
										onChange={(event) => setPicked(event.target.checked ? visible : [])}
										className="size-4 accent-[var(--ink)]"
									/>
								</TableHeader>
								<TableHeader>{t("transactions.day")}</TableHeader>
								<TableHeader>{t("transactions.description")}</TableHeader>
								{/* The account is the first thing to go when the screen is narrow:
								    it is context, and the description is the answer. */}
								<TableHeader className="hidden sm:table-cell">
									{t("transactions.account")}
								</TableHeader>
								<TableHeader numeric={true}>{t("transactions.amount")}</TableHeader>
								<TableHeader numeric={true}>
									<span className="sr-only">{t("accounts.actions")}</span>
								</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<input
											type="checkbox"
											checked={picked.includes(row.id)}
											aria-label={t("transactions.pick", { description: row.description })}
											onChange={() => toggle(row.id)}
											className="size-4 accent-[var(--ink)]"
										/>
									</TableCell>
									<TableCell className="whitespace-nowrap font-mono text-quiet">
										{row.happenedOn.slice(8)}/{row.happenedOn.slice(5, 7)}
									</TableCell>
									<TableCell>
										<span className={row.status === "planned" ? "text-quiet" : ""}>
											{row.description}
										</span>
										{row.categoryId ? (
											<span className="ml-2 text-xs text-quiet">
												{nameOfCategory(row.categoryId)}
											</span>
										) : null}
										{row.status === "planned" ? (
											<span className="ml-2 text-xs text-ochre">
												{t("transactionStatus.planned")}
											</span>
										) : null}
										{row.reconciledAt !== null ? (
											<span className="ml-2 text-xs text-cedar">
												{t("transactions.reconciled")}
											</span>
										) : null}
									</TableCell>
									<TableCell className="hidden text-quiet sm:table-cell">
										{nameOf(row.accountId)}
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
										<Menu
											align="end"
											trigger={
												<Button size="small" variant="quiet" aria-label={t("accounts.actions")}>
													<Icon name="settings" />
												</Button>
											}
										>
											<MenuItem
												onSelect={() => {
													setEditing(row);
													setOpen(true);
												}}
											>
												{t("transactions.edit")}
											</MenuItem>
											{row.status === "planned" ? (
												<MenuItem onSelect={() => settle.mutate(row.id)}>
													{t("transactions.settle")}
												</MenuItem>
											) : null}
											{row.categoryId ? (
												<MenuItem onSelect={() => teach.mutate(row)}>
													{t("transactions.alwaysSortLikeThis")}
												</MenuItem>
											) : null}
											{currentSpace.kind === "shared" && row.kind === "expense" ? (
												<MenuItem onSelect={() => setDividing(row)}>{t("sharing.divide")}</MenuItem>
											) : null}
											<MenuItem
												onSelect={() =>
													reconcile.mutate({ id: row.id, reconciled: row.reconciledAt === null })
												}
											>
												{row.reconciledAt === null
													? t("transactions.reconcile")
													: t("transactions.unreconcile")}
											</MenuItem>
											<MenuSeparator />
											<MenuItem onSelect={() => remove.mutate(row.id)}>
												{t("actions.delete")}
											</MenuItem>
											{row.installmentGroup ? (
												<MenuItem onSelect={() => removeGroup.mutate(row.installmentGroup ?? "")}>
													{t("transactions.deleteGroup")}
												</MenuItem>
											) : null}
										</Menu>
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
		</div>
	);
}
