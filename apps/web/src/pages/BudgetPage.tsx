// Deciding money before spending it.
//
// Three questions on one screen, in the order they matter. What did I promise to put
// aside. What am I saving for. And what am I allowing myself, category by category.
//
// Every limit shows the same three things: how much is gone, how much is left, and
// whether the rest of the month will hold. The last one is the point. A bar that is
// half full on the third of the month is not the same news as a bar that is half full
// on the twenty eighth, and this screen says which one it is.

import { monthOf, todayIn } from "@cofre/core";
import type { BudgetWithProgress, SpendingPriority } from "@cofre/storage";
import {
	Button,
	Callout,
	Dialog,
	EmptyState,
	Field,
	Icon,
	InsightTitle,
	Menu,
	MenuItem,
	Panel,
	Segmented,
	Select,
	Skeleton,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

const PRIORITIES: SpendingPriority[] = ["essential", "important", "desirable", "superfluous"];

/** The bar is the whole reading of a limit, so it says the state in its colour. */
const BAR = {
	comfortable: "bg-cedar",
	tight: "bg-ochre",
	over: "bg-seal",
};

function parseAmount(text: string): number {
	const cleaned = text
		.replace(/[^\d,.]/g, "")
		.replace(/\./g, "")
		.replace(",", ".");
	const value = Number(cleaned);
	return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function BudgetPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	const month = monthOf(today);

	const [isOpen, setOpen] = useState(false);
	const [scope, setScope] = useState<"total" | "priority" | "category">("category");
	const [categoryId, setCategoryId] = useState("");
	const [priority, setPriority] = useState<SpendingPriority>("superfluous");
	const [amount, setAmount] = useState("");
	const [problem, setProblem] = useState<string | null>(null);

	const [savingOpen, setSavingOpen] = useState(false);
	const [savingMode, setSavingMode] = useState<"percent" | "fixed">("percent");
	const [savingValue, setSavingValue] = useState("10");
	const [savingAccount, setSavingAccount] = useState("");

	const [goalOpen, setGoalOpen] = useState(false);
	const [goalName, setGoalName] = useState("");
	const [goalAmount, setGoalAmount] = useState("");
	const [goalAccount, setGoalAccount] = useState("");
	const [goalDate, setGoalDate] = useState("");

	const enabled = Boolean(session && currentSpace);

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled,
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});
	const accounts = useQuery({
		queryKey: ["accounts", spaceId],
		enabled,
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});
	const limits = useQuery({
		queryKey: ["budgets", spaceId, month],
		enabled,
		queryFn: () => session?.budgets.progress({ spaceId, month, today }) ?? [],
	});
	const goals = useQuery({
		queryKey: ["goals", spaceId],
		enabled,
		queryFn: () => session?.goals.progress({ spaceId, today }) ?? [],
	});
	const savings = useQuery({
		queryKey: ["savings", spaceId, month],
		enabled,
		queryFn: () => session?.goals.savings({ spaceId, month }) ?? null,
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["budgets"] });
		void queries.invalidateQueries({ queryKey: ["goals"] });
		void queries.invalidateQueries({ queryKey: ["savings"] });
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

	const saveLimit = useMutation({
		mutationFn: async () =>
			session?.budgets.create({
				spaceId,
				scope,
				amount: parseAmount(amount),
				categoryId: scope === "category" ? categoryId : null,
				priority: scope === "priority" ? priority : null,
			}),
		onSuccess: () => {
			setOpen(false);
			setAmount("");
			setProblem(null);
			invalidate();
		},
		onError: complain,
	});

	const removeLimit = useMutation({
		mutationFn: async (id: string) => session?.budgets.remove(id),
		onSuccess: invalidate,
		onError: complain,
	});

	const saveRule = useMutation({
		mutationFn: async () =>
			session?.goals.setRule({
				spaceId,
				mode: savingMode,
				value:
					savingMode === "percent"
						? Math.round(Number(savingValue.replace(",", ".")) * 100)
						: parseAmount(savingValue),
				accountId: savingAccount === "" ? null : savingAccount,
			}),
		onSuccess: () => {
			setSavingOpen(false);
			setProblem(null);
			invalidate();
		},
		onError: complain,
	});

	const clearRule = useMutation({
		mutationFn: async () => session?.goals.clearRule(spaceId),
		onSuccess: invalidate,
		onError: complain,
	});

	const saveGoal = useMutation({
		mutationFn: async () =>
			session?.goals.create({
				spaceId,
				name: goalName,
				targetAmount: parseAmount(goalAmount),
				accountId: goalAccount,
				targetDate: goalDate === "" ? null : goalDate,
			}),
		onSuccess: () => {
			setGoalOpen(false);
			setGoalName("");
			setGoalAmount("");
			setGoalDate("");
			setProblem(null);
			invalidate();
		},
		onError: complain,
	});

	const removeGoal = useMutation({
		mutationFn: async (id: string) => session?.goals.remove(id),
		onSuccess: invalidate,
		onError: complain,
	});

	if (!currentSpace) return null;

	const currency = currentSpace.baseCurrency;
	const usable = (accounts.data ?? []).filter((account) => account.archivedAt === null);
	const sorted = (categories.data ?? []).filter((category) => category.kind === "expense");

	const nameOfLimit = (limit: BudgetWithProgress) => {
		if (limit.scope === "total") return t("budget.everything");
		if (limit.scope === "priority") return t(`priority.${limit.priority ?? "important"}`);
		return categories.data?.find((category) => category.id === limit.categoryId)?.name ?? "";
	};

	const rows = limits.data ?? [];
	const over = rows.filter((limit) => limit.progress.state === "over").length;
	const monthName = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
		month: "long",
		timeZone: "UTC",
	}).format(new Date(`${month}-01T00:00:00Z`));

	return (
		<div className="space-y-5">
			<InsightTitle
				level="h1"
				detail={rows.length === 0 ? t("budget.noneYet") : t("budget.detail", { month: monthName })}
			>
				{rows.length === 0
					? t("budget.headlineEmpty")
					: over > 0
						? t("budget.headlineOver", { count: over })
						: t("budget.headlineFine")}
			</InsightTitle>

			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			<Panel
				title={t("budget.savingsTitle")}
				action={
					<Button size="small" variant="secondary" onClick={() => setSavingOpen(true)}>
						{savings.data?.rule ? t("budget.changeRule") : t("budget.setRule")}
					</Button>
				}
			>
				{savings.isPending ? <Skeleton lines={2} /> : null}

				{!savings.isPending && !savings.data?.rule ? (
					<p className="max-w-[60ch] text-sm text-quiet">{t("budget.savingsExplain")}</p>
				) : null}

				{savings.data?.rule ? (
					<div className="space-y-2">
						<p className="text-sm text-quiet">
							{savings.data.rule.mode === "percent"
								? t("budget.ruleIsPercent", { percent: savings.data.rule.value / 100 })
								: t("budget.ruleIsFixed")}{" "}
							{savings.data.rule.mode === "fixed" ? (
								<Value amount={savings.data.rule.value} currency={currency} tone="neutral" />
							) : null}
						</p>
						<p className="font-mono text-2xl tabular-nums">
							<Value amount={savings.data.put} currency={currency} tone="neutral" />
							<span className="ml-2 text-sm text-quiet">
								{t("budget.ofExpected")}{" "}
								<Value amount={savings.data.expected} currency={currency} tone="neutral" />
							</span>
						</p>
						<p className="text-sm text-quiet">
							{savings.data.put >= savings.data.expected
								? t("budget.savingsDone")
								: t("budget.savingsBehind")}
						</p>
						<Button size="small" variant="quiet" onClick={() => clearRule.mutate()}>
							{t("budget.clearRule")}
						</Button>
					</div>
				) : null}
			</Panel>

			<Panel
				title={t("budget.goalsTitle")}
				action={
					<Button
						size="small"
						variant="secondary"
						onClick={() => {
							setGoalAccount(usable[0]?.id ?? "");
							setGoalOpen(true);
						}}
					>
						{t("budget.newGoal")}
					</Button>
				}
			>
				{goals.isPending ? <Skeleton lines={2} /> : null}

				{!goals.isPending && (goals.data ?? []).length === 0 ? (
					<p className="max-w-[60ch] text-sm text-quiet">{t("budget.goalsExplain")}</p>
				) : null}

				<ul className="divide-y divide-rule">
					{(goals.data ?? []).map((goal) => (
						<li key={goal.id} className="space-y-1 py-3">
							<div className="flex items-baseline justify-between gap-4">
								<span className="text-sm text-ink">{goal.name}</span>
								<span className="flex items-center gap-3 text-sm">
									<span className="text-quiet">
										<Value amount={goal.saved} currency={currency} tone="neutral" />
										{" / "}
										<Value amount={goal.targetAmount} currency={currency} tone="neutral" />
									</span>
									<Menu
										align="end"
										trigger={
											<Button size="small" variant="quiet" aria-label={t("budget.goalActions")}>
												<Icon name="settings" />
											</Button>
										}
									>
										<MenuItem onSelect={() => removeGoal.mutate(goal.id)}>
											{t("actions.delete")}
										</MenuItem>
									</Menu>
								</span>
							</div>
							<div className="h-1.5 w-full bg-rule">
								<div
									className="h-full bg-cedar"
									style={{ width: `${Math.min(100, Math.round(goal.share * 100))}%` }}
								/>
							</div>
							<p className="text-xs text-quiet">
								{goal.left === 0
									? t("budget.goalReached")
									: goal.monthlyNeeded
										? t("budget.goalNeeds", {
												amount: new Intl.NumberFormat(
													i18n.resolvedLanguage === "en" ? "en" : "pt-BR",
													{ style: "currency", currency },
												).format(goal.monthlyNeeded / 100),
											})
										: t("budget.goalLeft", {
												amount: new Intl.NumberFormat(
													i18n.resolvedLanguage === "en" ? "en" : "pt-BR",
													{ style: "currency", currency },
												).format(goal.left / 100),
											})}
							</p>
						</li>
					))}
				</ul>
			</Panel>

			<Panel
				title={t("budget.limitsTitle")}
				action={
					<Button
						size="small"
						variant="primary"
						icon={<Icon name="plus" />}
						onClick={() => {
							setCategoryId(sorted[0]?.id ?? "");
							setOpen(true);
						}}
					>
						{t("budget.newLimit")}
					</Button>
				}
			>
				{limits.isPending ? <Skeleton lines={4} /> : null}

				{!limits.isPending && rows.length === 0 ? (
					<EmptyState
						icon="wallet"
						title={t("budget.emptyTitle")}
						description={t("budget.emptyBody")}
						action={
							<Button
								variant="primary"
								onClick={() => {
									setCategoryId(sorted[0]?.id ?? "");
									setOpen(true);
								}}
							>
								{t("budget.newLimit")}
							</Button>
						}
					/>
				) : null}

				<ul className="divide-y divide-rule">
					{rows.map((limit) => (
						<li key={limit.id} className="space-y-1 py-3">
							<div className="flex items-baseline justify-between gap-4">
								<span className="text-sm text-ink">{nameOfLimit(limit)}</span>
								<span className="flex items-center gap-3 text-sm">
									<span className="text-quiet">
										<Value amount={limit.progress.spent} currency={currency} tone="neutral" />
										{" / "}
										<Value amount={limit.progress.limit} currency={currency} tone="neutral" />
									</span>
									<Menu
										align="end"
										trigger={
											<Button size="small" variant="quiet" aria-label={t("budget.limitActions")}>
												<Icon name="settings" />
											</Button>
										}
									>
										<MenuItem onSelect={() => removeLimit.mutate(limit.id)}>
											{t("actions.delete")}
										</MenuItem>
									</Menu>
								</span>
							</div>
							<div className="h-1.5 w-full bg-rule">
								<div
									className={`h-full ${BAR[limit.progress.state]}`}
									style={{ width: `${Math.min(100, Math.round(limit.progress.share * 100))}%` }}
								/>
							</div>
							<p className="text-xs text-quiet">
								{limit.progress.state === "over"
									? t("budget.stateOver", {
											amount: new Intl.NumberFormat(
												i18n.resolvedLanguage === "en" ? "en" : "pt-BR",
												{ style: "currency", currency },
											).format(Math.abs(limit.progress.left) / 100),
										})
									: limit.progress.state === "tight"
										? t("budget.stateTight", {
												amount: new Intl.NumberFormat(
													i18n.resolvedLanguage === "en" ? "en" : "pt-BR",
													{ style: "currency", currency },
												).format(limit.progress.projected / 100),
											})
										: t("budget.stateComfortable", {
												amount: new Intl.NumberFormat(
													i18n.resolvedLanguage === "en" ? "en" : "pt-BR",
													{ style: "currency", currency },
												).format(limit.progress.left / 100),
											})}
							</p>
						</li>
					))}
				</ul>
			</Panel>

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={t("budget.newLimit")}
				description={t("budget.newLimitDescription")}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setOpen(false)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="primary"
							onClick={() => saveLimit.mutate()}
							disabled={saveLimit.isPending}
						>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form
					onSubmit={(event: FormEvent) => {
						event.preventDefault();
						saveLimit.mutate();
					}}
					className="space-y-4"
				>
					<Segmented
						label={t("budget.limitOn")}
						value={scope}
						onChange={setScope}
						options={[
							{ value: "category", label: t("budget.onCategory") },
							{ value: "priority", label: t("budget.onPriority") },
							{ value: "total", label: t("budget.onEverything") },
						]}
					/>

					{scope === "category" ? (
						<Select
							label={t("transactions.category")}
							value={categoryId}
							onChange={(event) => setCategoryId(event.target.value)}
							options={sorted
								.filter((category) => category.parentId === null)
								.flatMap((parent) => [
									{ value: parent.id, label: parent.name },
									...sorted
										.filter((child) => child.parentId === parent.id)
										.map((child) => ({ value: child.id, label: `  ${child.name}` })),
								])}
						/>
					) : null}

					{scope === "priority" ? (
						<Select
							label={t("categories.priority")}
							value={priority}
							onChange={(event) => setPriority(event.target.value as SpendingPriority)}
							options={PRIORITIES.map((level) => ({
								value: level,
								label: t(`priority.${level}`),
							}))}
						/>
					) : null}

					<Field
						label={t("budget.amount")}
						hint={t("budget.amountHint")}
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						numeric={true}
						inputMode="decimal"
						placeholder="0,00"
						required={true}
					/>
				</form>
			</Dialog>

			<Dialog
				open={savingOpen}
				onOpenChange={setSavingOpen}
				title={t("budget.savingsTitle")}
				description={t("budget.savingsDescription")}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setSavingOpen(false)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="primary"
							onClick={() => saveRule.mutate()}
							disabled={saveRule.isPending}
						>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form
					onSubmit={(event: FormEvent) => {
						event.preventDefault();
						saveRule.mutate();
					}}
					className="space-y-4"
				>
					<Segmented
						label={t("budget.ruleMode")}
						value={savingMode}
						onChange={setSavingMode}
						options={[
							{ value: "percent", label: t("budget.modePercent") },
							{ value: "fixed", label: t("budget.modeFixed") },
						]}
					/>
					<Field
						label={savingMode === "percent" ? t("budget.percentOfIncome") : t("budget.fixedAmount")}
						value={savingValue}
						onChange={(event) => setSavingValue(event.target.value)}
						numeric={true}
						inputMode="decimal"
						required={true}
					/>
					<Select
						label={t("budget.ruleAccount")}
						hint={t("budget.ruleAccountHint")}
						value={savingAccount}
						onChange={(event) => setSavingAccount(event.target.value)}
						options={[
							{ value: "", label: t("budget.noAccount") },
							...usable.map((account) => ({ value: account.id, label: account.name })),
						]}
					/>
				</form>
			</Dialog>

			<Dialog
				open={goalOpen}
				onOpenChange={setGoalOpen}
				title={t("budget.newGoal")}
				description={t("budget.newGoalDescription")}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setGoalOpen(false)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="primary"
							onClick={() => saveGoal.mutate()}
							disabled={saveGoal.isPending}
						>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form
					onSubmit={(event: FormEvent) => {
						event.preventDefault();
						saveGoal.mutate();
					}}
					className="space-y-4"
				>
					<Field
						label={t("budget.goalName")}
						value={goalName}
						onChange={(event) => setGoalName(event.target.value)}
						placeholder={t("budget.goalNamePlaceholder")}
						required={true}
					/>
					<div className="grid gap-4 md:grid-cols-2">
						<Field
							label={t("budget.goalAmount")}
							value={goalAmount}
							onChange={(event) => setGoalAmount(event.target.value)}
							numeric={true}
							inputMode="decimal"
							placeholder="0,00"
							required={true}
						/>
						<Field
							label={t("budget.goalDate")}
							hint={t("budget.goalDateHint")}
							type="date"
							value={goalDate}
							onChange={(event) => setGoalDate(event.target.value)}
						/>
					</div>
					<Select
						label={t("budget.goalAccount")}
						hint={t("budget.goalAccountHint")}
						value={goalAccount}
						onChange={(event) => setGoalAccount(event.target.value)}
						options={usable.map((account) => ({ value: account.id, label: account.name }))}
					/>
				</form>
			</Dialog>
		</div>
	);
}
