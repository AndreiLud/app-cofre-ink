// Which space am I in, and how do I change it. The colour is a helper, the name is
// the message, and both are always on screen.

import type { SpaceColour } from "@cofre/ui";
import {
	Button,
	Dialog,
	Field,
	Icon,
	Menu,
	MenuItem,
	MenuLabel,
	MenuSeparator,
	SpaceMark,
} from "@cofre/ui";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

export function SpaceSwitcher() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const {
		spaces,
		currentSpace,
		selectSpace,
		user,
		profiles,
		mode,
		renameMe,
		switchProfile,
		addProfile,
		signOut,
	} = useCofre();

	const [naming, setNaming] = useState<string | null>(null);

	if (!currentSpace) return null;

	const others = profiles.filter((person) => person.id !== user?.id);

	async function rename(event: FormEvent) {
		event.preventDefault();
		if (naming === null || naming.trim() === "") return;
		await renameMe(naming);
		setNaming(null);
	}

	return (
		<>
			<Menu
				align="start"
				trigger={
					<Button size="small" variant="quiet" className="min-w-0">
						<SpaceMark
							name={currentSpace.name}
							colour={currentSpace.colour as SpaceColour}
							description={t("spaces.current", { name: currentSpace.name })}
						/>
						<Icon name="chevronDown" className="ml-1 text-quiet" />
					</Button>
				}
			>
				<MenuLabel>{t("spaces.switch")}</MenuLabel>
				{spaces.map((space) => (
					<MenuItem
						key={space.id}
						onSelect={() => selectSpace(space.id)}
						selected={space.id === currentSpace.id}
						detail={space.id === currentSpace.id ? <Icon name="check" /> : undefined}
					>
						<SpaceMark name={space.name} colour={space.colour as SpaceColour} />
					</MenuItem>
				))}
				<MenuSeparator />
				{/* Spaces and members are settings, not screens somebody opens every day, so
				    they live here instead of taking room in the navigation. */}
				<MenuItem onSelect={() => void navigate({ to: ROUTES.spaces })}>
					{t("spaces.manage")}
				</MenuItem>
				<MenuItem onSelect={() => void navigate({ to: ROUTES.members })}>
					{t("nav.members")}
				</MenuItem>

				{/* Who is reading, and how to be somebody else. It lives here because this is
				    the menu that already answers "where am I", and being in the wrong space
				    and being the wrong person are the same kind of mistake. */}
				<MenuSeparator />
				<MenuLabel>{t("profiles.you", { name: user?.name ?? "" })}</MenuLabel>

				{mode === "browser" ? (
					<>
						{/* The front door asks nobody their name, so the name it wrote down is
						    a default and this is where it stops being one. */}
						<MenuItem onSelect={() => setNaming(user?.name ?? "")}>{t("profiles.rename")}</MenuItem>
						{others.map((person) => (
							<MenuItem key={person.id} onSelect={() => void switchProfile(person.id)}>
								{t("profiles.beThisOne", { name: person.name })}
							</MenuItem>
						))}
						<MenuItem onSelect={() => addProfile()}>{t("profiles.add")}</MenuItem>
					</>
				) : (
					<MenuItem onSelect={() => void signOut()}>{t("palette.signOut")}</MenuItem>
				)}
			</Menu>

			<Dialog
				open={naming !== null}
				onOpenChange={(open) => setNaming(open ? naming : null)}
				title={t("profiles.rename")}
				description={t("profiles.renameDescription")}
				closeLabel={t("actions.cancel")}
				size="small"
				footer={
					<>
						<Button variant="quiet" onClick={() => setNaming(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="primary"
							disabled={naming === null || naming.trim() === ""}
							onClick={() => void renameMe(naming ?? "").then(() => setNaming(null))}
						>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form onSubmit={rename}>
					<Field
						label={t("onboarding.name")}
						hint={t("profiles.renameHint")}
						value={naming ?? ""}
						onChange={(event) => setNaming(event.target.value)}
						placeholder={t("onboarding.namePlaceholder")}
						autoComplete="name"
						required={true}
					/>
				</form>
			</Dialog>
		</>
	);
}
