// The rules that sort records without anybody being asked.
//
// They live under the categories because that is what they are about, and because a
// seventh place in the navigation would cost more than it gives. Each line reads as a
// sentence: whenever the description has this, it goes there.

import type { CategorizationRule, Category } from "@cofre/storage";
import {
	Button,
	Callout,
	Dialog,
	Field,
	Icon,
	Menu,
	MenuItem,
	MenuSeparator,
	Panel,
	Select,
	Skeleton,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";

export type RulesSectionProps = {
	spaceId: string;
	categories: Category[];
};

export function RulesSection({ spaceId, categories }: RulesSectionProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

	const [isOpen, setOpen] = useState(false);
	const [editing, setEditing] = useState<CategorizationRule | null>(null);
	const [matchText, setMatchText] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [sorted, setSorted] = useState<number | null>(null);

	const rules = useQuery({
		queryKey: ["rules", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.rules.list(spaceId) ?? [],
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["rules"] });
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
			if (editing) return session.rules.update(editing.id, { matchText, categoryId });
			return session.rules.create({ spaceId, matchText, categoryId });
		},
		onSuccess: () => {
			setOpen(false);
			setProblem(null);
			invalidate();
		},
		onError: complain,
	});

	const remove = useMutation({
		mutationFn: async (id: string) => session?.rules.remove(id),
		onSuccess: invalidate,
		onError: complain,
	});

	const toggle = useMutation({
		mutationFn: async (rule: CategorizationRule) =>
			session?.rules.update(rule.id, { disabled: rule.disabledAt === null }),
		onSuccess: invalidate,
		onError: complain,
	});

	const applyNow = useMutation({
		mutationFn: async () => session?.rules.applyToExisting({ spaceId }) ?? 0,
		onSuccess: (count) => {
			setSorted(count ?? 0);
			invalidate();
		},
		onError: complain,
	});

	const nameOf = (id: string) => categories.find((category) => category.id === id)?.name ?? "";

	const options = categories
		.filter((category) => category.parentId === null)
		.flatMap((parent) => [
			{ value: parent.id, label: parent.name },
			...categories
				.filter((child) => child.parentId === parent.id)
				.map((child) => ({ value: child.id, label: `  ${child.name}` })),
		]);

	function open(rule: CategorizationRule | null) {
		setEditing(rule);
		setMatchText(rule?.matchText ?? "");
		setCategoryId(rule?.categoryId ?? options[0]?.value ?? "");
		setProblem(null);
		setOpen(true);
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	const rows = rules.data ?? [];

	return (
		<Panel
			title={t("rulesSection.title")}
			action={
				<span className="flex items-center gap-2">
					{rows.length > 0 ? (
						<Button
							size="small"
							variant="quiet"
							onClick={() => applyNow.mutate()}
							disabled={applyNow.isPending}
						>
							{t("rulesSection.applyNow")}
						</Button>
					) : null}
					<Button size="small" variant="secondary" onClick={() => open(null)}>
						{t("rulesSection.create")}
					</Button>
				</span>
			}
		>
			<p className="max-w-[60ch] text-sm text-quiet">{t("rulesSection.explain")}</p>

			{sorted !== null ? (
				<Callout tone="neutral">{t("rulesSection.sorted", { count: sorted })}</Callout>
			) : null}
			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			{rules.isPending ? <Skeleton lines={2} /> : null}

			{!rules.isPending && rows.length === 0 ? (
				<p className="text-sm text-quiet">{t("rulesSection.empty")}</p>
			) : null}

			<ul className="divide-y divide-line">
				{rows.map((rule) => (
					<li key={rule.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
						<span className={rule.disabledAt === null ? "text-ink" : "text-quiet line-through"}>
							{t("rulesSection.sentence", {
								text: rule.matchText,
								category: nameOf(rule.categoryId),
							})}
						</span>
						<Menu
							align="end"
							trigger={
								<Button size="small" variant="quiet" aria-label={t("rulesSection.actions")}>
									<Icon name="settings" />
								</Button>
							}
						>
							<MenuItem onSelect={() => open(rule)}>{t("rulesSection.edit")}</MenuItem>
							<MenuItem onSelect={() => toggle.mutate(rule)}>
								{rule.disabledAt === null ? t("rulesSection.disable") : t("rulesSection.enable")}
							</MenuItem>
							<MenuSeparator />
							<MenuItem onSelect={() => remove.mutate(rule.id)}>{t("actions.delete")}</MenuItem>
						</Menu>
					</li>
				))}
			</ul>

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={editing ? t("rulesSection.edit") : t("rulesSection.create")}
				description={t("rulesSection.createDescription")}
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
					<Field
						label={t("rulesSection.matchText")}
						hint={t("rulesSection.matchTextHint")}
						value={matchText}
						onChange={(event) => setMatchText(event.target.value)}
						placeholder={t("rulesSection.matchTextPlaceholder")}
						required={true}
					/>
					<Select
						label={t("rulesSection.category")}
						value={categoryId}
						onChange={(event) => setCategoryId(event.target.value)}
						options={options}
					/>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</Panel>
	);
}
