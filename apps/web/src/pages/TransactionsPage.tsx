// Everything that happened, newest first, with the filters that answer the questions
// people actually ask: what did I spend at that place, what is still to come, what
// went through this card.

import { monthOf, todayIn } from "@cofre/core";
import type { Transaction, TransactionKind, TransactionStatus } from "@cofre/storage";
import {
	Button,
	EmptyState,
	Field,
	Icon,
	Menu,
	MenuItem,
	MenuSeparator,
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
import { TransactionForm } from "../components/TransactionForm.tsx";
import { Value } from "../components/Value.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

type Filters = {
	kind: TransactionKind | "";
	status: TransactionStatus | "";
	accountId: string;
	search: string;
	month: string;
};

export function TransactionsPage() {
	const { t } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	const [filters, setFilters] = useState<Filters>({
		kind: "",
		status: "",
		accountId: "",
		search: "",
		month: monthOf(today),
	});
	const [isOpen, setOpen] = useState(false);
	const [editing, setEditing] = useState<Transaction | null>(null);

	const spaceId = currentSpace?.id ?? "";

	const accounts = useQuery({
		queryKey: ["accounts", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(spaceId, { includeArchived: true }) ?? [],
	});

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
		queryKey: ["transactions", spaceId, filters],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.transactions.list({
				spaceId,
				kind: filters.kind === "" ? undefined : filters.kind,
				status: filters.status === "" ? undefined : filters.status,
				accountId: filters.accountId === "" ? undefined : filters.accountId,
				search: filters.search === "" ? undefined : filters.search,
				...period,
			}) ?? [],
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["transactions"] });
		void queries.invalidateQueries({ queryKey: ["balances"] });
	};

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
	const reconcile = useMutation({
		mutationFn: async (input: { id: string; reconciled: boolean }) =>
			session?.transactions.reconcile(input.id, input.reconciled),
		onSuccess: invalidate,
	});

	if (!currentSpace) return null;

	const rows = records.data ?? [];
	const nameOf = (accountId: string) =>
		accounts.data?.find((account) => account.id === accountId)?.name ?? "";

	const total = rows.reduce((sum, row) => (row.kind === "transfer" ? sum : sum + row.amount), 0);

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
				{t("transactions.title", { space: currentSpace.name })}
			</SectionTitle>

			<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
				<Field
					label={t("transactions.month")}
					type="month"
					value={filters.month}
					onChange={(event) => setFilters({ ...filters, month: event.target.value })}
				/>
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
				<Field
					label={t("transactions.search")}
					value={filters.search}
					onChange={(event) => setFilters({ ...filters, search: event.target.value })}
					placeholder={t("transactions.searchPlaceholder")}
					type="search"
				/>
			</div>

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

			{rows.length > 0 ? (
				<>
					<Table caption={t("transactions.caption", { space: currentSpace.name })}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("transactions.day")}</TableHeader>
								<TableHeader>{t("transactions.description")}</TableHeader>
								<TableHeader>{t("transactions.account")}</TableHeader>
								<TableHeader numeric={true}>{t("transactions.amount")}</TableHeader>
								<TableHeader numeric={true}>
									<span className="sr-only">{t("accounts.actions")}</span>
								</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="whitespace-nowrap font-mono text-graphite">
										{row.happenedOn.slice(8)}/{row.happenedOn.slice(5, 7)}
									</TableCell>
									<TableCell>
										<span className={row.status === "planned" ? "text-graphite" : ""}>
											{row.description}
										</span>
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
									<TableCell className="text-graphite">
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

					<p className="flex items-baseline justify-between border-t border-ink pt-2 text-sm">
						<span className="text-graphite">
							{t("transactions.countedIn", { count: rows.length })}
						</span>
						<Value amount={total} currency={currentSpace.baseCurrency} tone="auto" />
					</p>
				</>
			) : null}

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
