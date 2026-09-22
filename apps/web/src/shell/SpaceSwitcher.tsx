// Which space am I in, and how do I change it. The colour is a helper, the name is
// the message, and both are always on screen.

import type { SpaceColour } from "@cofre/ui";
import { Button, Icon, Menu, MenuItem, MenuLabel, MenuSeparator, SpaceMark } from "@cofre/ui";
import { useNavigate } from "@tanstack/react-router";
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
		switchProfile,
		addProfile,
		signOut,
	} = useCofre();

	if (!currentSpace) return null;

	const others = profiles.filter((person) => person.id !== user?.id);

	return (
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
			<MenuItem onSelect={() => void navigate({ to: ROUTES.members })}>{t("nav.members")}</MenuItem>

			{/* Who is reading, and how to be somebody else. It lives here because this is
			    the menu that already answers "where am I", and being in the wrong space
			    and being the wrong person are the same kind of mistake. */}
			<MenuSeparator />
			<MenuLabel>{t("profiles.you", { name: user?.name ?? "" })}</MenuLabel>

			{mode === "browser" ? (
				<>
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
	);
}
