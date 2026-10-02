// Who is in this space and what each person may do.
//
// This was a screen of its own, reached from a menu, which put "who is in the space"
// somewhere other than the screen about spaces. It is a part of a space, so it sits
// with the space, under the list, for whichever one is open.
//
// Inviting exists only in server mode, and it says so rather than offering a button
// that leads nowhere: in browser mode there is one person in one browser, so an
// invitation would have nobody to accept it.

import { parseMoney } from "@cofre/core";
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
import { sayWhy } from "../lib/sayWhy.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import type { AssignableRole } from "../storage/cofreSession.ts";
import { useWhatIMayDo } from "../storage/roles.ts";
import { SettleSection } from "./SettleSection.tsx";

const ASSIGNABLE: AssignableRole[] = ["admin", "editor", "viewer", "logger"];

export function SpacePeople() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace, user, reload, linkInvitations, chooseAgain } = useCofre();
	const queries = useQueryClient();

	const [isOpen, setOpen] = useState(false);
	const [role, setRole] = useState<AssignableRole>("editor");
	const [incomeFor, setIncomeFor] = useState<string | null>(null);
	const [income, setIncome] = useState("");
	const [link, setLink] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	// The income dialog keeps its own, because the one above is drawn on the section
	// behind it: a number that could not be read used to complain where nobody could see
	// it while the dialog stayed open saying nothing.
	const [incomeProblem, setIncomeProblem] = useState<string | null>(null);
	/** Who the space is being handed to, while the name is being typed out. */
	const [handingTo, setHandingTo] = useState<{ userId: string; name: string } | null>(null);
	const [typedName, setTypedName] = useState("");
	const [handOverProblem, setHandOverProblem] = useState<string | null>(null);

	const spaceId = currentSpace?.id ?? "";
	// A server, a shared space, and somebody who may actually make an invitation. The
	// role is added further down, once the members are in hand, because until then
	// nobody knows which one this person holds and offering the button is the wrong
	// guess: it was offered to an Editor, a Viewer and a Logger and refused every time.
	const onAServer = linkInvitations !== null && currentSpace?.kind === "shared";

	const members = useQuery({
		queryKey: ["members", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.members.list(spaceId) ?? [],
	});

	const { mayCall, role: myRole } = useWhatIMayDo(spaceId);

	// The people of this space: this screen names its members and settles up between
	// them, and somebody from another space of this person's is neither.
	const people = useQuery({
		queryKey: ["peopleOfSpace", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.users.inSpace(spaceId) ?? [],
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["members"] });
		void queries.invalidateQueries({ queryKey: ["peopleOfSpace"] });
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
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	const complain = (error: unknown) => setProblem(sayWhy(error, t));

	const changeRole = useMutation({
		mutationFn: async (input: { userId: string; role: AssignableRole }) =>
			session?.members.changeRole(spaceId, input.userId, input.role),
		onSuccess: invalidate,
		onError: complain,
	});

	/**
	 * Handing the space over, which the model has always been able to do and no screen
	 * could reach.
	 *
	 * It is the way out for whoever made a space: leaving is refused to an owner, and the
	 * refusal says to transfer it first, which was a thing nobody could do. Typed out,
	 * like the danger zone, because it is not undoable by the person doing it: afterwards
	 * they are an administrator and only the new owner can hand it back.
	 */
	const transfer = useMutation({
		mutationFn: async (userId: string) => session?.members.transferOwnership(spaceId, userId),
		onSuccess: () => {
			setHandingTo(null);
			invalidate();
		},
		onError: (error: unknown) => setHandOverProblem(sayWhy(error, t)),
	});

	const saveIncome = useMutation({
		mutationFn: async () => {
			if (!session || incomeFor === null) return;
			// Read the way every other amount on screen is read, which is the way the
			// same reader every other amount on screen goes through, which decides the
			// decimal mark from the last separator in what was typed. Stripping every dot
			// by hand turned 4500.00 into four hundred and fifty thousand.
			const amount =
				income.trim() === ""
					? null
					: Math.abs(parseMoney(income, { currency: currentSpace?.baseCurrency }).amount);
			return session.members.setIncome(spaceId, incomeFor, amount);
		},
		onSuccess: () => {
			setIncomeFor(null);
			setIncomeProblem(null);
			invalidate();
		},
		// Inside the dialog, where the person is looking, and in words. It used to put the
		// English complaint of the money reader on the section behind the open dialog, and
		// then said the number could not be read whatever had gone wrong, so a refusal or
		// a dropped connection sent somebody back to retype a number that was already
		// right, as many times as they had patience for.
		onError: (error: unknown) => setIncomeProblem(sayWhy(error, t)),
	});

	const remove = useMutation({
		mutationFn: async (userId: string) => session?.members.remove(spaceId, userId),
		onSuccess: invalidate,
		onError: complain,
	});

	const leave = useMutation({
		mutationFn: async () => session?.members.leave(spaceId),
		onSuccess: async () => {
			await reload();
			void queries.invalidateQueries();
		},
		onError: complain,
	});

	if (!currentSpace) return null;

	const nameOf = (userId: string): string => {
		if (userId === user?.id) return t("members.you");
		return people.data?.find((person) => person.id === userId)?.name ?? userId.slice(0, 8);
	};

	const rows = members.data ?? [];
	const isPersonal = currentSpace.kind === "personal";
	/** Setting somebody else's income asks the same thing as changing their role. */
	const maySetAnybodys = mayCall("members.changeRole");
	const mayRemove = mayCall("members.remove");

	// The language on screen, not the one this application was written in. The income
	// used to be drawn as R$ 4.500,00 in the middle of the English interface, and the
	// field was filled with a comma for the cents whichever language was speaking.
	const locale = i18n.resolvedLanguage === "en" ? "en" : "pt-BR";
	const asMoney = (cents: number) =>
		new Intl.NumberFormat(locale, {
			style: "currency",
			currency: currentSpace.baseCurrency,
		}).format(cents / 100);
	const asFigures = (cents: number) =>
		new Intl.NumberFormat(locale, {
			minimumFractionDigits: 2,
			useGrouping: false,
		}).format(cents / 100);
	// An invitation only means anything where there is a server to accept it.
	const canInvite = onAServer && mayCall("members.invite");
	const maySettle = mayCall("sharing.split");
	const mayLeave = mayCall("members.leave");
	/**
	 * Only the owner hands a space over, and only where there is somebody to hand it to.
	 *
	 * Gated on the mode like the invitation above it, and for the same reason. In browser
	 * mode the other people in a space are rows nobody will ever sign in as, so handing a
	 * space to one of them loses it: the new owner is an account no browser will hold, and
	 * nothing in the interface can give it back.
	 */
	const mayHandOver = onAServer && !isPersonal && myRole === "owner";

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
		<div className="space-y-6 border-t border-line pt-6">
			<SectionTitle
				level="h2"
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

			{/* A refusal from any of these has to land somewhere. Changing a role or
			    removing somebody used to fail in silence, because the only place this was
			    drawn was inside the invitation dialog. */}
			{problem && !isOpen ? <Callout tone="problem">{problem}</Callout> : null}

			{isPersonal ? (
				<Callout title={t("members.personalTitle")}>{t("members.personalBody")}</Callout>
			) : null}

			{!isPersonal && linkInvitations === null ? (
				<Callout
					tone="attention"
					title={t("members.needsServerTitle")}
					// Back to the question itself, and not to one of its two answers. It
					// used to reopen browser mode, which is the mode somebody reading this
					// callout is already in.
					action={
						<Button size="small" variant="secondary" onClick={chooseAgain}>
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
					<Table
						caption={t(isPersonal ? "members.captionPersonal" : "members.caption", {
							space: currentSpace.name,
						})}
					>
						<TableHead>
							<TableRow>
								<TableHeader>{t("members.person")}</TableHeader>
								<TableHeader>{t("members.role")}</TableHeader>
								<TableHeader>{t("members.state")}</TableHeader>
								{isPersonal ? null : (
									<TableHeader numeric={true}>{t("members.income")}</TableHeader>
								)}
								<TableHeader numeric={true}>
									<span className="sr-only">{t("members.actions")}</span>
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
											{/* Two different questions, and they used to be one. Who may
											    SET this is the person themselves and whoever runs the
											    space. Who may SEE it is everybody who can read the list,
											    which is what the hint beside the field already promises
											    and what the model already hands down: hiding it here said
											    "not said" about people who had said, and the number was
											    in this browser the whole time. */}
											{member.userId === user?.id || maySetAnybodys ? (
												<Button
													size="small"
													variant="quiet"
													onClick={() => {
														setIncomeFor(member.userId);
														setIncomeProblem(null);
														setIncome(
															member.monthlyIncome === null ? "" : asFigures(member.monthlyIncome),
														);
													}}
												>
													{member.monthlyIncome === null
														? t("members.sayIncome")
														: asMoney(member.monthlyIncome)}
												</Button>
											) : (
												<span className="text-quiet">
													{member.monthlyIncome === null
														? t("members.incomeNotSaid")
														: asMoney(member.monthlyIncome)}
												</span>
											)}
										</TableCell>
									)}
									<TableCell numeric={true}>
										{/* Only for somebody who may actually do either of these. An
										    Editor, a Viewer or a Logger was shown the menu and had
										    every item in it refused without a word. */}
										{(!maySetAnybodys && !mayRemove && !mayHandOver) ||
										member.role === "owner" ||
										member.userId === user?.id ? null : (
											<Menu
												align="end"
												trigger={
													<Button size="small" variant="quiet" aria-label={t("members.actions")}>
														<Icon name="settings" />
													</Button>
												}
											>
												{maySetAnybodys
													? ASSIGNABLE.filter((option) => option !== member.role).map((option) => (
															<MenuItem
																key={option}
																onSelect={() =>
																	changeRole.mutate({ userId: member.userId, role: option })
																}
															>
																{t("members.makeRole", { role: t(`role.${option}`) })}
															</MenuItem>
														))
													: null}
												{/* Owner is not in the list above, on purpose: the model refuses
												    to hand that role out, because two owners is not a state it
												    has an answer for. It is handed over, one for one. */}
												{/* And only to somebody who is actually in the space: the model
												    refuses a space handed to an invitation nobody has accepted,
												    and it refuses it with the sentence for something that does
												    not exist. */}
												{mayHandOver && member.state === "active" ? (
													<MenuItem
														onSelect={() => {
															setHandOverProblem(null);
															setTypedName("");
															setHandingTo({ userId: member.userId, name: nameOf(member.userId) });
														}}
													>
														{t("members.handOver")}
													</MenuItem>
												) : null}
												{mayRemove ? (
													<MenuItem onSelect={() => remove.mutate(member.userId)}>
														{t("members.remove")}
													</MenuItem>
												) : null}
											</Menu>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Panel>
			) : null}

			{!isPersonal && mayLeave ? (
				<Button variant="destructive" size="small" onClick={() => leave.mutate()}>
					{t("members.leave")}
				</Button>
			) : null}

			{/* Typed out, like the danger zone, because the person doing it cannot undo it:
			    afterwards they are an administrator and only the new owner can hand it
			    back. It is also the one way out of a space for whoever made it, which is
			    why the refusal on leaving points here. */}
			<Dialog
				open={handingTo !== null}
				onOpenChange={(open) => {
					if (!open) setHandingTo(null);
				}}
				title={t("members.handOverTitle")}
				description={t("members.handOverDescription", {
					name: handingTo?.name ?? "",
					space: currentSpace.name,
				})}
				closeLabel={t("actions.close")}
				size="small"
				footer={
					<>
						<Button variant="quiet" onClick={() => setHandingTo(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="destructive"
							disabled={
								transfer.isPending ||
								typedName.trim().toLowerCase() !== (handingTo?.name ?? "").trim().toLowerCase()
							}
							onClick={() => handingTo && transfer.mutate(handingTo.userId)}
						>
							{t("members.handOverAction")}
						</Button>
					</>
				}
			>
				<div className="space-y-3">
					<Callout tone="attention">{t("members.handOverWarns")}</Callout>
					<Field
						label={t("members.handOverConfirm", { name: handingTo?.name ?? "" })}
						value={typedName}
						onChange={(event) => setTypedName(event.target.value)}
						error={handOverProblem}
						autoComplete="off"
					/>
				</div>
			</Dialog>

			<Dialog
				open={incomeFor !== null}
				onOpenChange={(open) => {
					if (!open) setIncomeFor(null);
				}}
				title={t("members.incomeTitle")}
				description={t("members.incomeDescription")}
				closeLabel={t("actions.close")}
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
						error={incomeProblem}
						value={income}
						onChange={(event) => {
							setIncomeProblem(null);
							setIncome(event.target.value);
						}}
						numeric={true}
						inputMode="decimal"
						placeholder={t("fields.amountPlaceholder")}
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
					maySettle={maySettle}
				/>
			)}

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={t("members.invite")}
				description={t("members.inviteDescription", { space: currentSpace.name })}
				closeLabel={t("actions.close")}
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
