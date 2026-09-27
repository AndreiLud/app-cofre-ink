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
	const { spaces, currentSpace, selectSpace, user, mode, signOut } = useCofre();

	if (!currentSpace) return null;

	return (
		<>
			<Menu
				align="start"
				trigger={
					// A button does not give way by default, and this one has to: it shares
					// the row with the controls, and the controls cannot be made narrower
					// than they are. Without this the name runs underneath them.
					<Button size="small" variant="quiet" className="min-w-0 shrink">
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
				{/* Spaces are a setting, not a screen somebody opens every day, so it lives
				    here instead of taking room in the navigation. Who is in a space lives
				    inside that screen, beside the space itself. */}
				<MenuItem onSelect={() => void navigate({ to: ROUTES.spaces })}>
					{t("spaces.manage")}
				</MenuItem>

				{/* An account is a thing somebody signed into and can sign out of. A browser
				    that keeps its own data has neither, so there is nothing to say here. */}
				{mode === "server" ? (
					<>
						<MenuSeparator />
						<MenuLabel>{t("profiles.you", { name: user?.name ?? "" })}</MenuLabel>
						<MenuItem onSelect={() => void signOut()}>{t("palette.signOut")}</MenuItem>
					</>
				) : null}
			</Menu>
		</>
	);
}
