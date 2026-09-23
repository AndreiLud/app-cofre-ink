// Spaces: what exists, which one is open, how to create a shared one, and how to
// correct the one that was created without anybody being asked.

import type { Space } from "@cofre/storage";
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

const CURRENCIES = ["BRL", "USD", "EUR", "GBP"];

/** The space the dialog is about: one being made, or one being corrected. */
type Target = { made: true } | { made: false; space: Space };

export function SpacesPage() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { session, spaces, currentSpace, selectSpace, reload } = useCofre();
	const queries = useQueryClient();

	const [target, setTarget] = useState<Target | null>(null);
	const [name, setName] = useState("");
	const [colour, setColour] = useState<SpaceColour>("clay");
	const [currency, setCurrency] = useState("BRL");
	const [problem, setProblem] = useState<string | null>(null);

	function openNew() {
		setName("");
		setColour("clay");
		setCurrency(currentSpace?.baseCurrency ?? "BRL");
		setProblem(null);
		setTarget({ made: true });
	}

	function openEdit(space: Space) {
		setName(space.name);
		setColour(space.colour as SpaceColour);
		setCurrency(space.baseCurrency);
		setProblem(null);
		setTarget({ made: false, space });
	}

	const save = useMutation({
		mutationFn: async () => {
			if (!session || !target) throw new Error("no session");

			if (!target.made) {
				const space = await session.spaces.update(target.space.id, {
					name: name.trim(),
					colour,
					baseCurrency: currency,
				});
				return { space, made: false };
			}

			const space = await session.spaces.create({
				name: name.trim(),
				colour,
				baseCurrency: currency,
			});
			// A new space with no categories is a screen of empty pickers, so it starts
			// with the same list the personal one did.
			await session.categories.installDefaults({
				spaceId: space.id,
				language: i18n.resolvedLanguage === "en" ? "en" : "pt",
			});
			return { space, made: true };
		},
		onSuccess: async (done) => {
			setTarget(null);
			setProblem(null);
			await reload();
			void queries.invalidateQueries();
			if (done.made) selectSpace(done.space.id);
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	return (
		<div className="space-y-6">
			<SectionTitle
				level="h1"
				action={
					<Button size="small" variant="primary" icon={<Icon name="plus" />} onClick={openNew}>
						{t("spaces.create")}
					</Button>
				}
			>
				{t("spaces.title")}
			</SectionTitle>

			<p className="max-w-[60ch] text-sm text-quiet">{t("spaces.explain")}</p>

			<ul className="divide-y divide-line border-y border-line">
				{spaces.map((space) => (
					<li key={space.id} className="flex items-center justify-between gap-4 py-3">
						<span className="flex flex-col gap-0.5">
							<SpaceMark name={space.name} colour={space.colour as SpaceColour} />
							<span className="pl-4 text-xs text-quiet">
								{space.kind === "personal" ? t("spaces.personalKind") : t("spaces.sharedKind")}
								{` · ${space.baseCurrency}`}
								{space.id === currentSpace?.id ? ` · ${t("spaces.open")}` : ""}
							</span>
						</span>
						<span className="flex gap-2">
							{space.id === currentSpace?.id ? null : (
								<Button size="small" variant="secondary" onClick={() => selectSpace(space.id)}>
									{t("spaces.enter")}
								</Button>
							)}
							<Button size="small" variant="quiet" onClick={() => openEdit(space)}>
								{t("spaces.edit")}
							</Button>
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
				open={target !== null}
				onOpenChange={(open) => setTarget(open ? target : null)}
				title={target?.made === false ? t("spaces.editTitle") : t("spaces.create")}
				description={
					target?.made === false ? t("spaces.editDescription") : t("spaces.createDescription")
				}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setTarget(null)}>
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
					{/* Asked nowhere else now that a device can be opened without a form, and
					    the amounts of a space are counted in it. */}
					<Select
						label={t("onboarding.currency")}
						value={currency}
						onChange={(event) => setCurrency(event.target.value)}
						options={CURRENCIES.map((code) => ({ value: code, label: code }))}
						hint={t("spaces.currencyHint")}
					/>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
