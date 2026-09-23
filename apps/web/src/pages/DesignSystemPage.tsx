import { money } from "@cofre/core/money";
import {
	Amount,
	Button,
	contrastLevel,
	contrastRatio,
	Field,
	InsightTitle,
	SectionTitle,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Language, LOCALE_OF } from "../i18n/index.ts";
import { readToken, useTheme } from "../lib/theme.ts";
import { useCofre } from "../storage/CofreProvider.tsx";

const TEXT_TOKENS = ["ink", "graphite", "cedar", "seal", "ochre"] as const;
const FILL_TOKENS = ["amber", "rule", "raised"] as const;

// Fictional entries, the kind the product will hold. Never real data.
const UPCOMING = [
	{ day: "22/09", description: "Aluguel", category: "Moradia", amount: money(-145_000) },
	{ day: "25/09", description: "Fatura Nubank", category: "Cartão", amount: money(-128_644) },
	{ day: "28/09", description: "Spotify", category: "Assinaturas", amount: money(-2190) },
	{ day: "30/09", description: "Salário", category: "Renda", amount: money(612_000) },
];

type Measured = { name: string; value: string; ratio: number };
type Palette = { theme: "light" | "dark"; text: Measured[]; fills: Measured[] };

/** Reads the tokens that are actually applied, so the gallery never shows a guess. */
function useMeasuredPalette(isDark: boolean): Palette {
	const [palette, setPalette] = useState<Palette>({ theme: "light", text: [], fills: [] });

	useEffect(() => {
		const background = readToken("--paper");
		const measure = (name: string): Measured => {
			const value = readToken(`--${name}`);
			let ratio = 0;
			try {
				ratio = contrastRatio(value, background);
			} catch {
				ratio = 0;
			}
			return { name, value, ratio };
		};
		setPalette({
			theme: isDark ? "dark" : "light",
			text: TEXT_TOKENS.map(measure),
			fills: FILL_TOKENS.map(measure),
		});
	}, [isDark]);

	return palette;
}

function Swatch({ entry, showLevel }: { entry: Measured; showLevel: boolean }) {
	const { t } = useTranslation();
	const level = contrastLevel(entry.ratio);
	return (
		<div className="flex items-center gap-3 border-b border-line py-2">
			<span
				aria-hidden="true"
				className="size-8 shrink-0 rounded-sm border border-ink/10"
				style={{ backgroundColor: entry.value }}
			/>
			<span className="flex-1">
				<span className="block text-sm font-medium text-ink">{entry.name}</span>
				<span className="block font-mono text-xs text-quiet">{entry.value}</span>
			</span>
			<span className="text-right">
				<span className="block font-mono text-sm tabular-nums text-ink">
					{entry.ratio.toFixed(1)}
				</span>
				<span className="block text-xs text-quiet">
					{showLevel ? level : t("designSystem.fillNote")}
				</span>
			</span>
		</div>
	);
}

export function DesignSystemPage() {
	const { t, i18n } = useTranslation();
	const { amountsHidden } = useCofre();
	const { choice } = useTheme();
	const isDark =
		choice === "dark" ||
		(choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
	const palette = useMeasuredPalette(isDark);
	const locale = LOCALE_OF[(i18n.resolvedLanguage ?? "pt") as Language];
	const hiddenAmounts = amountsHidden;

	return (
		<div>
			<div className="space-y-12">
				<div className="space-y-2">
					<h1 className="text-3xl">{t("designSystem.title")}</h1>
					<p className="max-w-[60ch] text-quiet">{t("designSystem.subtitle")}</p>
				</div>

				<section className="space-y-4">
					<SectionTitle>{t("designSystem.colours")}</SectionTitle>
					<p className="max-w-[70ch] text-sm text-quiet">{t("designSystem.colourNote")}</p>
					<div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
						<div>
							<p className="pb-1 text-xs font-medium text-quiet">{t("designSystem.textTokens")}</p>
							{palette.text.map((entry) => (
								<Swatch key={entry.name} entry={entry} showLevel={true} />
							))}
						</div>
						<div>
							<p className="pb-1 text-xs font-medium text-quiet">{t("designSystem.fillTokens")}</p>
							{palette.fills.map((entry) => (
								<Swatch key={entry.name} entry={entry} showLevel={false} />
							))}
						</div>
					</div>
				</section>

				<section className="space-y-4">
					<SectionTitle>{t("designSystem.typography")}</SectionTitle>
					<div className="space-y-3">
						<p className="font-serif text-3xl">{t("designSystem.specimenTitle")}</p>
						<p className="font-serif text-xl">{t("insight.headline")}</p>
						<p className="text-base">{t("designSystem.specimenBody")}</p>
						<p className="text-sm text-quiet">{t("designSystem.specimenSupport")}</p>
						<p className="font-mono text-base tabular-nums">1.234,56 7.890,12 0,05 999,00</p>
					</div>
				</section>

				<section className="space-y-4">
					<SectionTitle>{t("designSystem.components")}</SectionTitle>
					<div className="flex flex-wrap items-center gap-3">
						<Button variant="primary">{t("actions.save")}</Button>
						<Button variant="secondary">{t("actions.newEntry")}</Button>
						<Button variant="quiet">{t("actions.cancel")}</Button>
						<Button variant="destructive">{t("actions.delete")}</Button>
						<Button variant="secondary" disabled={true}>
							{t("actions.save")}
						</Button>
					</div>
					<div className="grid gap-4 md:max-w-xl md:grid-cols-2">
						<Field
							label={t("fields.amount")}
							hint={t("fields.amountHint")}
							numeric={true}
							defaultValue="42,90"
							inputMode="decimal"
						/>
						<Field
							label={t("fields.description")}
							placeholder={t("fields.descriptionPlaceholder")}
						/>
						<Field
							label={t("fields.amount")}
							numeric={true}
							defaultValue="quarenta"
							error={t("fields.amountError")}
						/>
					</div>
				</section>

				<section className="space-y-4">
					<SectionTitle action={<span className="text-xs text-quiet">{t("demo.notice")}</span>}>
						{t("designSystem.tableSample")}
					</SectionTitle>
					<Table caption={t("table.caption")}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("table.date")}</TableHeader>
								<TableHeader>{t("table.description")}</TableHeader>
								<TableHeader>{t("table.category")}</TableHeader>
								<TableHeader numeric={true}>{t("table.amount")}</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{UPCOMING.map((entry) => (
								<TableRow key={entry.description}>
									<TableCell className="font-mono text-quiet">{entry.day}</TableCell>
									<TableCell>{entry.description}</TableCell>
									<TableCell className="text-quiet">{entry.category}</TableCell>
									<TableCell numeric={true}>
										<Amount
											value={entry.amount}
											tone="auto"
											locale={locale}
											hidden={hiddenAmounts}
										/>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</section>

				<section className="space-y-4">
					<SectionTitle
						action={
							<Button size="small" variant="quiet">
								{t("actions.seeTable")}
							</Button>
						}
					>
						{t("designSystem.chartSample")}
					</SectionTitle>
					<InsightTitle detail={t("insight.detail")}>{t("insight.headline")}</InsightTitle>
				</section>
			</div>
		</div>
	);
}
