// Who is in this space and what each person may do.
//
// Inviting by link or by email needs a server, which arrives in the next block. Until
// then the screen invites someone who already has a profile in this browser, which is
// what the demonstration data creates.

import type { Role } from "@cofre/storage";
import { findUserByEmail } from "@cofre/storage";
import {
	Button,
	Callout,
	Dialog,
	EmptyState,
	Field,
	Icon,
	Menu,
	MenuItem,
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
import { useCofre } from "../storage/CofreProvider.tsx";

const ASSIGNABLE: Exclude<Role, "owner">[] = ["admin", "editor", "viewer", "logger"];

export function MembersPage() {
	const { t } = useTranslation();
	const { session, driver, currentSpace, user, reload } = useCofre();
	const queries = useQueryClient();

	const [isOpen, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Exclude<Role, "owner">>("editor");
	const [problem, setProblem] = useState<string | null>(null);

	const spaceId = currentSpace?.id ?? "";

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

	const invite = useMutation({
		mutationFn: async () => {
			if (!session || !driver) throw new Error("no session");
			const person = await findUserByEmail(driver, email);
			if (!person) throw new Error(t("members.notFoundHere"));
			return session.members.invite({ spaceId, userId: person.id, role });
		},
		onSuccess: () => {
			setOpen(false);
			setEmail("");
			setProblem(null);
			invalidate();
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	const changeRole = useMutation({
		mutationFn: async (input: { userId: string; role: Exclude<Role, "owner"> }) =>
			session?.members.changeRole(spaceId, input.userId, input.role),
		onSuccess: invalidate,
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

	function submit(event: FormEvent) {
		event.preventDefault();
		invite.mutate();
	}

	const rows = members.data ?? [];
	const isPersonal = currentSpace.kind === "personal";

	return (
		<div className="space-y-6">
			<SectionTitle
				action={
					isPersonal ? null : (
						<Button
							size="small"
							variant="primary"
							icon={<Icon name="plus" />}
							onClick={() => setOpen(true)}
						>
							{t("members.invite")}
						</Button>
					)
				}
			>
				{t("members.title", { space: currentSpace.name })}
			</SectionTitle>

			{isPersonal ? (
				<Callout title={t("members.personalTitle")}>{t("members.personalBody")}</Callout>
			) : null}

			{members.isPending ? <Skeleton lines={3} /> : null}

			{!members.isPending && rows.length <= 1 && !isPersonal ? (
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
				<Table caption={t("members.caption", { space: currentSpace.name })}>
					<TableHead>
						<TableRow>
							<TableHeader>{t("members.person")}</TableHeader>
							<TableHeader>{t("members.role")}</TableHeader>
							<TableHeader>{t("members.state")}</TableHeader>
							<TableHeader numeric={true}>
								<span className="sr-only">{t("accounts.actions")}</span>
							</TableHeader>
						</TableRow>
					</TableHead>
					<TableBody>
						{rows.map((member) => (
							<TableRow key={member.id}>
								<TableCell>{nameOf(member.userId)}</TableCell>
								<TableCell className="text-graphite">{t(`role.${member.role}`)}</TableCell>
								<TableCell className="text-graphite">{t(`memberState.${member.state}`)}</TableCell>
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
			) : null}

			{!isPersonal && rows.find((member) => member.userId === user?.id)?.role !== "owner" ? (
				<Button variant="destructive" size="small" onClick={() => leave.mutate()}>
					{t("members.leave")}
				</Button>
			) : null}

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={t("members.invite")}
				description={t("members.inviteDescription", { space: currentSpace.name })}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setOpen(false)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="primary" onClick={() => invite.mutate()} disabled={invite.isPending}>
							{t("members.sendInvite")}
						</Button>
					</>
				}
			>
				<form onSubmit={submit} className="space-y-4">
					<Callout tone="attention" title={t("members.needsServerTitle")}>
						{t("members.needsServerBody")}
					</Callout>
					<Field
						label={t("members.email")}
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						placeholder="joao@exemplo.invalido"
						type="email"
						required={true}
					/>
					<Select
						label={t("members.role")}
						value={role}
						onChange={(event) => setRole(event.target.value as Exclude<Role, "owner">)}
						options={ASSIGNABLE.map((value) => ({ value, label: t(`role.${value}`) }))}
						hint={t(`roleHint.${role}`)}
					/>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
