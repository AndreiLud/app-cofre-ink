// Spaces: what exists, which one is open, and how to create a shared one.

import {
	Button,
	Callout,
	Dialog,
	Field,
	Icon,
	SectionTitle,
	Select,
	SPACE_COLOURS,
	type SpaceColour,
	SpaceMark,
} from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

export function SpacesPage() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { session, spaces, currentSpace, selectSpace, reload } = useCofre();
	const queries = useQueryClient();

	const [isOpen, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [colour, setColour] = useState<SpaceColour>("clay");
	const [problem, setProblem] = useState<string | null>(null);

	const create = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			const space = await session.spaces.create({ name: name.trim(), colour });
			// A new space with no categories is a screen of empty pickers, so it starts
			// with the same list the personal one did.
			await session.categories.installDefaults({
				spaceId: space.id,
				language: i18n.resolvedLanguage === "en" ? "en" : "pt",
			});
			return space;
		},
		onSuccess: async (space) => {
			setOpen(false);
			setName("");
			setProblem(null);
			await reload();
			void queries.invalidateQueries();
			if (space) selectSpace(space.id);
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		create.mutate();
	}

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
						{t("spaces.create")}
					</Button>
				}
			>
				{t("spaces.title")}
			</SectionTitle>

			<p className="max-w-[60ch] text-sm text-graphite">{t("spaces.explain")}</p>

			<ul className="divide-y divide-rule border-y border-rule">
				{spaces.map((space) => (
					<li key={space.id} className="flex items-center justify-between gap-4 py-3">
						<span className="flex flex-col gap-0.5">
							<SpaceMark name={space.name} colour={space.colour as SpaceColour} />
							<span className="pl-4 text-xs text-graphite">
								{space.kind === "personal" ? t("spaces.personalKind") : t("spaces.sharedKind")}
								{space.id === currentSpace?.id ? ` · ${t("spaces.open")}` : ""}
							</span>
						</span>
						<span className="flex gap-2">
							{space.id === currentSpace?.id ? null : (
								<Button size="small" variant="secondary" onClick={() => selectSpace(space.id)}>
									{t("spaces.enter")}
								</Button>
							)}
							<Button
								size="small"
								variant="quiet"
								onClick={() => {
									selectSpace(space.id);
									void navigate({ to: ROUTES.members });
								}}
							>
								{t("spaces.members")}
							</Button>
						</span>
					</li>
				))}
			</ul>

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={t("spaces.create")}
				description={t("spaces.createDescription")}
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
						label={t("spaces.name")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("spaces.namePlaceholder")}
						required={true}
					/>
					<Select
						label={t("spaces.colour")}
						value={colour}
						onChange={(event) => setColour(event.target.value as SpaceColour)}
						options={Object.keys(SPACE_COLOURS).map((value) => ({
							value,
							label: t(`spaceColour.${value}`),
						}))}
						hint={t("spaces.colourHint")}
					/>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
