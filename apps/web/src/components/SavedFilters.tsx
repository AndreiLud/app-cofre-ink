// The questions somebody asks every week, kept one click away.
//
// They are stored with the space and not with the browser, so the filter written on
// the phone is there on the computer. Each one belongs to whoever wrote it, which the
// repository layer takes care of.

import { Button, Callout, Dialog, Field, Icon } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { sayWhy } from "../lib/sayWhy.ts";
import { useCofre } from "../storage/CofreProvider.tsx";

export type FilterQuery = Record<string, unknown>;

export type SavedFiltersProps = {
	spaceId: string;
	/** What the screen is showing right now, which is what gets saved. */
	current: FilterQuery;
	onApply: (query: FilterQuery) => void;
};

/** Two filters are the same question when the parts that were set match. */
function sameQuery(left: FilterQuery, right: FilterQuery): boolean {
	const written = (query: FilterQuery) =>
		JSON.stringify(
			Object.entries(query)
				.filter(([, value]) => value !== "" && value !== undefined && value !== null)
				.sort(([one], [other]) => one.localeCompare(other)),
		);
	return written(left) === written(right);
}

export function SavedFilters({ spaceId, current, onApply }: SavedFiltersProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

	const [naming, setNaming] = useState(false);
	const [name, setName] = useState("");
	const [problem, setProblem] = useState<string | null>(null);

	const saved = useQuery({
		queryKey: ["savedFilters", spaceId],
		enabled: Boolean(session && spaceId),
		queryFn: () => session?.savedFilters.list(spaceId) ?? [],
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["savedFilters"] });
	};

	// A saved filter is a person's own shortcut, so every role may keep one and nothing
	// here is ever refused for a role. It can still fail, and it used to fail in silence.
	const complain = (error: unknown) => setProblem(sayWhy(error, t));

	const keep = useMutation({
		mutationFn: async () =>
			session?.savedFilters.create({
				spaceId,
				name,
				query: current,
				position: saved.data?.length ?? 0,
			}),
		onSuccess: () => {
			setProblem(null);
			setNaming(false);
			setName("");
			invalidate();
		},
		onError: complain,
	});

	const forget = useMutation({
		mutationFn: async (id: string) => session?.savedFilters.remove(id),
		onSuccess: () => {
			setProblem(null);
			invalidate();
		},
		onError: complain,
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		if (name.trim() !== "") keep.mutate();
	}

	const rows = saved.data ?? [];

	return (
		<div className="flex flex-wrap items-center gap-2">
			{rows.map((filter) => {
				const active = sameQuery(filter.query, current);
				return (
					<span
						key={filter.id}
						className={`flex items-center gap-1 rounded-sm border px-2 py-1 text-sm ${
							active ? "border-ink text-ink" : "border-line text-quiet"
						}`}
					>
						<button type="button" onClick={() => onApply(filter.query)} className="hover:text-ink">
							{filter.name}
						</button>
						<button
							type="button"
							onClick={() => forget.mutate(filter.id)}
							aria-label={t("savedFilters.forget", { name: filter.name })}
							className="text-quiet hover:text-seal"
						>
							<Icon name="close" />
						</button>
					</span>
				);
			})}

			<Button size="small" variant="quiet" onClick={() => setNaming(true)}>
				{t("savedFilters.keep")}
			</Button>

			{problem && !naming ? (
				<span className="basis-full">
					<Callout tone="problem">{problem}</Callout>
				</span>
			) : null}

			<Dialog
				open={naming}
				onOpenChange={setNaming}
				title={t("savedFilters.keepTitle")}
				description={t("savedFilters.keepDescription")}
				closeLabel={t("actions.close")}
				size="small"
				footer={
					<>
						<Button variant="quiet" onClick={() => setNaming(false)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="primary"
							onClick={() => keep.mutate()}
							disabled={name.trim() === "" || keep.isPending}
						>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form onSubmit={submit}>
					<Field
						label={t("savedFilters.name")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("savedFilters.namePlaceholder")}
						autoFocus={true}
					/>
					{/* Keeping a filter is only ever done from in here, and the callout was
					    drawn outside, behind this dialog. */}
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
