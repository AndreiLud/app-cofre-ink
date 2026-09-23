// Where the money goes, and how much of it was needed.
//
// The list is the shape of the data: a category that stands on its own, and under it
// the ones that hang from it. The priority sits on the same line because it is the
// reason this screen exists, not a setting hidden behind a menu.

import type { Category, SpendingPriority } from "@cofre/storage";
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
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RulesSection } from "../components/RulesSection.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

const PRIORITIES: SpendingPriority[] = ["essential", "important", "desirable", "superfluous"];

/** The colour says how much it was needed, from the one that pays itself to the one that does not. */
const PRIORITY_TONE: Record<SpendingPriority, string> = {
	essential: "text-ink",
	important: "text-quiet",
	desirable: "text-ochre",
	superfluous: "text-seal",
};

export function CategoriesPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";

	const [isOpen, setOpen] = useState(false);
	const [editing, setEditing] = useState<Category | null>(null);
	const [name, setName] = useState("");
	const [kind, setKind] = useState<"expense" | "income">("expense");
	const [priority, setPriority] = useState<SpendingPriority>("important");
	const [parentId, setParentId] = useState("");
	const [problem, setProblem] = useState<string | null>(null);

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	const rows = categories.data ?? [];
	const parents = rows.filter((category) => category.parentId === null);
	const childrenOf = (id: string) => rows.filter((category) => category.parentId === id);

	useEffect(() => {
		if (!isOpen) return;
		setProblem(null);
		if (editing) {
			setName(editing.name);
			setKind(editing.kind);
			setPriority(editing.priority);
			setParentId(editing.parentId ?? "");
			return;
		}
		setName("");
		setKind("expense");
		setPriority("important");
		setParentId("");
	}, [isOpen, editing]);

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["categories"] });
		void queries.invalidateQueries({ queryKey: ["transactions"] });
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

	const save = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			if (editing) {
				return session.categories.update(editing.id, {
					name,
					priority,
					parentId: parentId === "" ? null : parentId,
				});
			}
			return session.categories.create({
				spaceId,
				name,
				kind,
				priority,
				parentId: parentId === "" ? null : parentId,
			});
		},
		onSuccess: () => {
			setOpen(false);
			invalidate();
		},
		onError: complain,
	});

	const install = useMutation({
		mutationFn: async () =>
			session?.categories.installDefaults({
				spaceId,
				language: i18n.resolvedLanguage === "en" ? "en" : "pt",
			}),
		onSuccess: invalidate,
		onError: complain,
	});

	const archive = useMutation({
		mutationFn: async (id: string) => session?.categories.archive(id),
		onSuccess: invalidate,
		onError: complain,
	});

	const remove = useMutation({
		mutationFn: async (id: string) => session?.categories.remove(id),
		onSuccess: invalidate,
		onError: complain,
	});

	if (!currentSpace) return null;

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	function line(category: Category, isChild: boolean) {
		return (
			<li
				key={category.id}
				className={`flex items-baseline justify-between gap-4 py-2 ${isChild ? "pl-6" : ""}`}
			>
				<span className="flex min-w-0 items-baseline gap-3">
					<span className={isChild ? "text-sm text-quiet" : "text-sm font-medium text-ink"}>
						{category.name}
					</span>
					{category.kind === "expense" ? (
						<span className={`text-xs ${PRIORITY_TONE[category.priority]}`}>
							{t(`priority.${category.priority}`)}
						</span>
					) : null}
				</span>
				<Menu
					align="end"
					trigger={
						<Button size="small" variant="quiet" aria-label={t("categories.actions")}>
							<Icon name="settings" />
						</Button>
					}
				>
					<MenuItem
						onSelect={() => {
							setEditing(category);
							setOpen(true);
						}}
					>
						{t("categories.edit")}
					</MenuItem>
					<MenuItem onSelect={() => archive.mutate(category.id)}>
						{t("categories.archive")}
					</MenuItem>
					<MenuSeparator />
					<MenuItem onSelect={() => remove.mutate(category.id)}>{t("actions.delete")}</MenuItem>
				</Menu>
			</li>
		);
	}

	const side = (which: "expense" | "income") => {
		const list = parents.filter((category) => category.kind === which);
		if (list.length === 0) return null;
		return (
			<Panel title={t(`categories.${which}`)}>
				<ul className="divide-y divide-line">
					{list.flatMap((parent) => [
						line(parent, false),
						...childrenOf(parent.id).map((child) => line(child, true)),
					])}
				</ul>
			</Panel>
		);
	};

	return (
		<div className="space-y-8">
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
						{t("categories.create")}
					</Button>
				}
			>
				{t("categories.title", { space: currentSpace.name })}
			</SectionTitle>

			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			{categories.isPending ? <Skeleton lines={6} /> : null}

			{!categories.isPending && rows.length === 0 ? (
				<EmptyState
					icon="wallet"
					title={t("categories.emptyTitle")}
					description={t("categories.emptyBody")}
					action={
						<Button variant="primary" onClick={() => install.mutate()} disabled={install.isPending}>
							{t("categories.install")}
						</Button>
					}
				/>
			) : null}

			{side("expense")}
			{side("income")}

			{rows.length > 0 ? <RulesSection spaceId={spaceId} categories={rows} /> : null}

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={editing ? t("categories.edit") : t("categories.create")}
				description={t("categories.createDescription")}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setOpen(false)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form onSubmit={submit} className="space-y-4">
					{editing ? null : (
						<Segmented
							label={t("categories.side")}
							value={kind}
							onChange={(next) => {
								setKind(next);
								setParentId("");
							}}
							options={[
								{ value: "expense", label: t("categories.expense") },
								{ value: "income", label: t("categories.income") },
							]}
						/>
					)}

					<Field
						label={t("categories.name")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("categories.namePlaceholder")}
						required={true}
					/>

					{/* Priority is about spending. Money coming in is simply money coming in. */}
					{kind === "expense" ? (
						<Select
							label={t("categories.priority")}
							hint={t("categories.priorityHint")}
							value={priority}
							onChange={(event) => setPriority(event.target.value as SpendingPriority)}
							options={PRIORITIES.map((level) => ({
								value: level,
								label: t(`priority.${level}`),
							}))}
						/>
					) : null}

					<Select
						label={t("categories.parent")}
						hint={t("categories.parentHint")}
						value={parentId}
						onChange={(event) => setParentId(event.target.value)}
						options={[
							{ value: "", label: t("categories.noParent") },
							...parents
								.filter(
									(category) =>
										category.kind === kind &&
										category.id !== editing?.id &&
										childrenOf(editing?.id ?? "").length === 0,
								)
								.map((category) => ({ value: category.id, label: category.name })),
						]}
					/>

					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
