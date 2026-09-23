// Who is in this space and what each person may do.
//
// Inviting exists only in server mode, and the screen says so rather than offering a
// button that leads nowhere: in browser mode there is one profile in one browser, so
// an invitation would have nobody to accept it.

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
import { SettleSection } from "../components/SettleSection.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import type { AssignableRole } from "../storage/cofreSession.ts";

const ASSIGNABLE: AssignableRole[] = ["admin", "editor", "viewer", "logger"];

export function MembersPage() {
	const { t } = useTranslation();
	const { session, currentSpace, user, reload, linkInvitations, chooseMode } = useCofre();
	const queries = useQueryClient();

	const [isOpen, setOpen] = useState(false);
	const [role, setRole] = useState<AssignableRole>("editor");
	const [incomeFor, setIncomeFor] = useState<string | null>(null);
	const [income, setIncome] = useState("");
	const [link, setLink] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	const spaceId = currentSpace?.id ?? "";
	const canInvite = linkInvitations !== null && currentSpace?.kind === "shared";

	const members = useQuery({
		queryKey: ["members", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.members.list(spaceId) ?? [],
	});

	const people = useQuery({
		queryKey: ["peers", spaceId],
		enabled: Boolean(session),
		queryFn: () => session?.users.peers() ?? [],
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["members"] });
		void queries.invalidateQueries({ queryKey: ["peers"] });
	};

	const createLink = useMutation({
		mutationFn: async () => {
			if (!linkInvitations) throw new Error("no server session");
			return linkInvitations.create({ spaceId, role });
		},
		onSuccess: (invitation) => {
			setLink(invitation.link);
			setCopied(false);
			setProblem(null);
			invalidate();
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	const changeRole = useMutation({
		mutationFn: async (input: { userId: string; role: AssignableRole }) =>
			session?.members.changeRole(spaceId, input.userId, input.role),
		onSuccess: invalidate,
	});

	const saveIncome = useMutation({
		mutationFn: async () => {
			if (!session || incomeFor === null) return;
			const cleaned = income
				.replace(/[^\d,.]/g, "")
				.replace(/\./g, "")
				.replace(",", ".");
			const amount = income.trim() === "" ? null : Math.round(Number(cleaned) * 100);
			return session.members.setIncome(spaceId, incomeFor, amount);
		},
		onSuccess: () => {
			setIncomeFor(null);
			invalidate();
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	const remove = useMutation({
		mutationFn: async (userId: string) => session?.members.remove(spaceId, userId),
		onSuccess: invalidate,
	});

	const leave = useMutation({
		mutationFn: async () => session?.members.leave(spaceId),
		onSuccess: async () => {
			await reload();
			void queries.invalidateQueries();
		},
	});

	if (!currentSpace) return null;

	const nameOf = (userId: string): string => {
		if (userId === user?.id) return t("members.you", { name: user?.name ?? "" });
		return people.data?.find((person) => person.id === userId)?.name ?? userId.slice(0, 8);
	};

	const rows = members.data ?? [];
	const isPersonal = currentSpace.kind === "personal";
	const myRole = rows.find((member) => member.userId === user?.id)?.role;
	const canManage = myRole === "owner" || myRole === "admin";

	async function copyLink() {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
		} catch {
			// Some browsers refuse without a gesture they recognise. The link is on
			// screen anyway, so it can be selected by hand.
			setCopied(false);
		}
	}

	return (
		<div className="space-y-6">
			<SectionTitle
				level="h1"
				action={
					canInvite ? (
						<Button
							size="small"
							variant="primary"
							icon={<Icon name="plus" />}
							onClick={() => {
								setLink(null);
								setOpen(true);
							}}
						>
							{t("members.invite")}
						</Button>
					) : null
				}
			>
				{t("members.title", { space: currentSpace.name })}
			</SectionTitle>

			{isPersonal ? (
				<Callout title={t("members.personalTitle")}>{t("members.personalBody")}</Callout>
			) : null}

			{!isPersonal && linkInvitations === null ? (
				<Callout
					tone="attention"
					title={t("members.needsServerTitle")}
					action={
						<Button size="small" variant="secondary" onClick={() => void chooseMode("browser")}>
							{t("members.aboutModes")}
						</Button>
					}
				>
					{t("members.needsServerBody")}
				</Callout>
			) : null}

			{members.isPending ? <Skeleton lines={3} /> : null}

			{!members.isPending && rows.length <= 1 && canInvite ? (
				<EmptyState
					title={t("members.aloneTitle")}
					description={t("members.aloneBody")}
					action={
						<Button variant="primary" onClick={() => setOpen(true)}>
							{t("members.invite")}
						</Button>
					}
				/>
			) : null}

			{rows.length > 0 ? (
				<Panel flush>
					<Table caption={t("members.caption", { space: currentSpace.name })}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("members.person")}</TableHeader>
								<TableHeader>{t("members.role")}</TableHeader>
								<TableHeader>{t("members.state")}</TableHeader>
								{isPersonal ? null : (
									<TableHeader numeric={true}>{t("members.income")}</TableHeader>
								)}
								<TableHeader numeric={true}>
									<span className="sr-only">{t("accounts.actions")}</span>
								</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((member) => (
								<TableRow key={member.id}>
									<TableCell>{nameOf(member.userId)}</TableCell>
									<TableCell className="text-quiet">{t(`role.${member.role}`)}</TableCell>
									<TableCell className="text-quiet">{t(`memberState.${member.state}`)}</TableCell>
									{isPersonal ? null : (
										<TableCell numeric={true}>
											{/* Only the division that follows income reads this, and only the
											    person themselves or whoever runs the space may set it. */}
											{member.userId === user?.id || canManage ? (
												<Button
													size="small"
													variant="quiet"
													onClick={() => {
														setIncomeFor(member.userId);
														setIncome(
															member.monthlyIncome === null
																? ""
																: String(member.monthlyIncome / 100).replace(".", ","),
														);
													}}
												>
													{member.monthlyIncome === null
														? t("members.sayIncome")
														: new Intl.NumberFormat("pt-BR", {
																style: "currency",
																currency: currentSpace.baseCurrency,
															}).format(member.monthlyIncome / 100)}
												</Button>
											) : (
												<span className="text-quiet">{t("members.incomeHidden")}</span>
											)}
										</TableCell>
									)}
									<TableCell numeric={true}>
										{member.role === "owner" || member.userId === user?.id ? null : (
											<Menu
												align="end"
												trigger={
													<Button size="small" variant="quiet" aria-label={t("accounts.actions")}>
														<Icon name="settings" />
													</Button>
												}
											>
												{ASSIGNABLE.filter((option) => option !== member.role).map((option) => (
													<MenuItem
														key={option}
														onSelect={() =>
															changeRole.mutate({ userId: member.userId, role: option })
														}
													>
														{t("members.makeRole", { role: t(`role.${option}`) })}
													</MenuItem>
												))}
												<MenuItem onSelect={() => remove.mutate(member.userId)}>
													{t("members.remove")}
												</MenuItem>
											</Menu>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Panel>
			) : null}

			{!isPersonal && rows.find((member) => member.userId === user?.id)?.role !== "owner" ? (
				<Button variant="destructive" size="small" onClick={() => leave.mutate()}>
					{t("members.leave")}
				</Button>
			) : null}

			<Dialog
				open={incomeFor !== null}
				onOpenChange={(open) => {
					if (!open) setIncomeFor(null);
				}}
				title={t("members.incomeTitle")}
				description={t("members.incomeDescription")}
				closeLabel={t("actions.cancel")}
				size="small"
				footer={
					<>
						<Button variant="quiet" onClick={() => setIncomeFor(null)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="primary" onClick={() => saveIncome.mutate()}>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form
					onSubmit={(event: FormEvent) => {
						event.preventDefault();
						saveIncome.mutate();
					}}
				>
					<Field
						label={t("members.income")}
						hint={t("members.incomeHint")}
						value={income}
						onChange={(event) => setIncome(event.target.value)}
						numeric={true}
						inputMode="decimal"
						placeholder="0,00"
						autoFocus={true}
					/>
				</form>
			</Dialog>

			{isPersonal ? null : (
				<SettleSection
					spaceId={spaceId}
					people={people.data ?? []}
					currency={currentSpace.baseCurrency}
					timezone={currentSpace.timezone}
				/>
			)}

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={t("members.invite")}
				description={t("members.inviteDescription", { space: currentSpace.name })}
				closeLabel={t("actions.cancel")}
				footer={
					link ? (
						<Button variant="primary" onClick={() => setOpen(false)}>
							{t("actions.done")}
						</Button>
					) : (
						<>
							<Button variant="quiet" onClick={() => setOpen(false)}>
								{t("actions.cancel")}
							</Button>
							<Button
								variant="primary"
								onClick={() => createLink.mutate()}
								disabled={createLink.isPending}
							>
								{t("members.createLink")}
							</Button>
						</>
					)
				}
			>
				{link ? (
					<div className="space-y-3">
						<p className="text-sm text-quiet">{t("members.linkReady")}</p>
						<p className="break-all border border-line bg-panel p-3 font-mono text-xs">{link}</p>
						<div className="flex items-center gap-3">
							<Button variant="secondary" size="small" onClick={() => void copyLink()}>
								{copied ? t("members.linkCopied") : t("members.copyLink")}
							</Button>
							<span className="text-xs text-quiet">{t("members.linkRules")}</span>
						</div>
					</div>
				) : (
					<div className="space-y-4">
						<Select
							label={t("members.role")}
							value={role}
							onChange={(event) => setRole(event.target.value as AssignableRole)}
							options={ASSIGNABLE.map((value) => ({ value, label: t(`role.${value}`) }))}
							hint={t(`roleHint.${role}`)}
						/>
						{problem ? <Callout tone="problem">{problem}</Callout> : null}
					</div>
				)}
			</Dialog>
		</div>
	);
}
