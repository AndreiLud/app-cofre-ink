// One place to reach everything, from the keyboard.
//
// Built on the accessible dialog rather than on a library, because the list has to
// name the space of every action: running a command from here is exactly when a
// person is not looking at the header.

import { Dialog, Icon, type SpaceColour, SpaceMark } from "@cofre/ui";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Language, rememberLanguage } from "../i18n/index.ts";
import { useTheme } from "../lib/theme.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

export type PaletteState = {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	setOpen: (open: boolean) => void;
};

export function useCommandPalette(): PaletteState {
	const [isOpen, setOpen] = useState(false);

	useEffect(() => {
		const listen = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen((current) => !current);
			}
		};
		window.addEventListener("keydown", listen);
		return () => window.removeEventListener("keydown", listen);
	}, []);

	return {
		isOpen,
		open: useCallback(() => setOpen(true), []),
		close: useCallback(() => setOpen(false), []),
		setOpen,
	};
}

type Command = {
	id: string;
	label: string;
	group: string;
	detail?: ReactNode;
	icon?: ReactNode;
	run: () => void;
};

export function CommandPalette({ state }: { state: PaletteState }) {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { setChoice } = useTheme();
	const cofre = useCofre();
	const [query, setQuery] = useState("");
	const [highlighted, setHighlighted] = useState(0);

	const commands = useMemo<Command[]>(() => {
		const go = (to: string) => () => {
			void navigate({ to });
			state.close();
		};

		const list: Command[] = [
			{
				id: "goDashboard",
				group: t("palette.navigate"),
				label: t("nav.dashboard"),
				run: go(ROUTES.dashboard),
			},
			{
				id: "goAccounts",
				group: t("palette.navigate"),
				label: t("nav.accounts"),
				run: go(ROUTES.accounts),
			},
			{
				id: "goSpaces",
				group: t("palette.navigate"),
				label: t("nav.spaces"),
				run: go(ROUTES.spaces),
			},
			{
				id: "goMembers",
				group: t("palette.navigate"),
				label: t("nav.members"),
				run: go(ROUTES.members),
			},
			{
				id: "goDesignSystem",
				group: t("palette.navigate"),
				label: t("designSystem.title"),
				run: go(ROUTES.designSystem),
			},
		];

		for (const space of cofre.spaces) {
			list.push({
				id: `space${space.id}`,
				group: t("palette.switchSpace"),
				label: space.name,
				icon: <SpaceMark name="" colour={space.colour as SpaceColour} />,
				detail: space.id === cofre.currentSpace?.id ? <Icon name="check" /> : undefined,
				run: () => {
					cofre.selectSpace(space.id);
					state.close();
				},
			});
		}

		list.push(
			{
				id: "togglePrivacy",
				group: t("palette.actions"),
				label: cofre.amountsHidden ? t("privacy.show") : t("privacy.hide"),
				run: () => {
					cofre.setAmountsHidden(!cofre.amountsHidden);
					state.close();
				},
			},
			{
				id: "themeLight",
				group: t("palette.actions"),
				label: t("theme.light"),
				run: () => {
					setChoice("light");
					state.close();
				},
			},
			{
				id: "themeDark",
				group: t("palette.actions"),
				label: t("theme.dark"),
				run: () => {
					setChoice("dark");
					state.close();
				},
			},
			{
				id: "language",
				group: t("palette.actions"),
				label: i18n.resolvedLanguage === "pt" ? t("language.english") : t("language.portuguese"),
				run: () => {
					const next: Language = i18n.resolvedLanguage === "pt" ? "en" : "pt";
					void i18n.changeLanguage(next);
					rememberLanguage(next);
					state.close();
				},
			},
		);

		return list;
	}, [cofre, i18n, navigate, setChoice, state, t]);

	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (needle === "") return commands;
		return commands.filter((command) =>
			`${command.group} ${command.label}`.toLowerCase().includes(needle),
		);
	}, [commands, query]);

	useEffect(() => {
		setHighlighted(0);
	}, []);

	useEffect(() => {
		if (!state.isOpen) setQuery("");
	}, [state.isOpen]);

	const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setHighlighted((current) => (current + 1) % Math.max(matches.length, 1));
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setHighlighted((current) => (current - 1 + matches.length) % Math.max(matches.length, 1));
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			matches[highlighted]?.run();
		}
	};

	let lastGroup = "";

	return (
		<Dialog
			open={state.isOpen}
			onOpenChange={state.setOpen}
			title={t("palette.title")}
			description={t("palette.description")}
			showDescription={false}
			closeLabel={t("actions.cancel")}
			size="medium"
			className="top-24 translate-y-0 p-0"
		>
			<div className="px-5 pb-4">
				{/* The palette exists to be typed into, so it takes focus on purpose. */}
				<input
					autoFocus={true}
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setHighlighted(0);
					}}
					onKeyDown={onKeyDown}
					placeholder={t("palette.placeholder")}
					aria-label={t("palette.placeholder")}
					aria-controls="paletteResults"
					className="h-11 w-full border border-rule bg-raised px-3 text-base text-ink placeholder:text-graphite/70"
				/>

				<ul id="paletteResults" className="mt-3 max-h-80 overflow-y-auto">
					{matches.length === 0 ? (
						<li className="px-1 py-6 text-sm text-graphite">{t("palette.nothing")}</li>
					) : null}
					{matches.map((command, index) => {
						const showGroup = command.group !== lastGroup;
						lastGroup = command.group;
						return (
							<li key={command.id}>
								{showGroup ? (
									<p className="px-1 pb-1 pt-3 text-xs text-graphite">{command.group}</p>
								) : null}
								<button
									type="button"
									onMouseEnter={() => setHighlighted(index)}
									onClick={command.run}
									aria-current={index === highlighted ? "true" : undefined}
									className={`flex w-full items-center justify-between gap-3 px-2 py-2 text-left text-sm ${
										index === highlighted ? "bg-ink text-paper" : "text-ink"
									}`}
								>
									<span className="flex items-center gap-2">
										{command.icon}
										{command.label}
									</span>
									{command.detail}
								</button>
							</li>
						);
					})}
				</ul>
			</div>
		</Dialog>
	);
}
