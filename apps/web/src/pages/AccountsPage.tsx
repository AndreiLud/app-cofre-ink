// Accounts of the current space: what exists, and how to add one.

import { parseMoney } from "@cofre/core";
import type { AccountKind, BenefitKind } from "@cofre/storage";
import {
	Button,
	Callout,
	Dialog,
	EmptyState,
	Field,
	Icon,
	Menu,
	MenuItem,
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
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardsSection } from "../components/CardsSection.tsx";
import { Value } from "../components/Value.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

const KINDS: AccountKind[] = ["checking", "savings", "cash", "credit", "voucher", "investment"];
const BENEFITS: BenefitKind[] = ["meal", "food", "transport", "culture", "mobility"];

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

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["accounts"] });
		void queries.invalidateQueries({ queryKey: ["accountsEverywhere"] });
		// An opening balance is part of what an account is worth, so the balances the
		// overview is showing are no longer true.
		void queries.invalidateQueries({ queryKey: ["balances"] });
		void queries.invalidateQueries({ queryKey: ["advice"] });
	};

	const create = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			const amount =
				balance.trim() === ""
					? 0
					: parseMoney(balance, { currency: currentSpace?.baseCurrency }).amount;
			return session.accounts.create({
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
		},
		onSuccess: () => {
			setOpen(false);
			setName("");
			setBalance("");
			setInstitution("");
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

			<CardsSection spaceId={spaceId} spaceName={currentSpace.name} accounts={rows} />

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
					<Field
						label={t("accounts.institution")}
						value={institution}
						onChange={(event) => setInstitution(event.target.value)}
						placeholder={t("accounts.institutionPlaceholder")}
					/>
					{kind === "credit" ? (
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
					<Field
						label={t("accounts.balance")}
						hint={t("accounts.balanceHint")}
						value={balance}
						onChange={(event) => setBalance(event.target.value)}
						numeric={true}
						inputMode="decimal"
						placeholder="0,00"
					/>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
