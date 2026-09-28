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
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { SpacePeople } from "../components/SpacePeople.tsx";
import { sayWhy } from "../lib/sayWhy.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

const CURRENCIES = ["BRL", "USD", "EUR", "GBP"];

/** The space the dialog is about: one being made, or one being corrected. */
type Target = { made: true } | { made: false; space: Space };

/**
 * One row of the list, and its own question about that one space.
 *
 * What may be done here is a question per space and not per screen, and a question cannot
 * be asked inside a list that changes length, so the row is a component. Editing used to
 * be offered on every row to every role, and the dialog behind it offered the base
 * currency every amount in the space is counted in.
 */
function SpaceRow({
	space,
	isOpen,
	onEnter,
	onEdit,
}: {
	space: Space;
	isOpen: boolean;
	onEnter: () => void;
	onEdit: () => void;
}) {
	const { t } = useTranslation();
	const mayEdit = useWhatIMayDo(space.id).may("space.update");

	return (
		<li className="flex items-center justify-between gap-4 py-3">
			<span className="flex flex-col gap-0.5">
				<SpaceMark name={space.name} colour={space.colour as SpaceColour} />
				<span className="pl-4 text-xs text-quiet">
					{space.kind === "personal" ? t("spaces.personalKind") : t("spaces.sharedKind")}
					{` · ${space.baseCurrency}`}
					{isOpen ? ` · ${t("spaces.open")}` : ""}
				</span>
			</span>
			<span className="flex gap-2">
				{isOpen ? null : (
					<Button size="small" variant="secondary" onClick={onEnter}>
						{t("spaces.enter")}
					</Button>
				)}
				{mayEdit ? (
					<Button size="small" variant="quiet" onClick={onEdit}>
						{t("spaces.edit")}
					</Button>
				) : null}
			</span>
		</li>
	);
}

export function SpacesPage() {
	const { t, i18n } = useTranslation();
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
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
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
					<SpaceRow
						key={space.id}
						space={space}
						isOpen={space.id === currentSpace?.id}
						onEnter={() => selectSpace(space.id)}
						onEdit={() => openEdit(space)}
					/>
				))}
			</ul>

			{/* Who is in the space, under the list of spaces, for the one that is open.
			    It used to be a screen of its own reached from a menu, which put "who is in
			    this space" somewhere other than the screen about spaces. */}
			<SpacePeople />

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
