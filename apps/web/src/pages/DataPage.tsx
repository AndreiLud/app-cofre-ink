// The data, and what the person can do with it.
//
// Taking everything out in one file, putting it back somewhere else, and, in browser
// mode, meeting a server of theirs so two devices agree. This screen is the proof of
// the promise the project makes: nothing here talks to anybody until a button is
// pressed, and each button says exactly where the data goes.

import { writeAmount, writeCsv } from "@cofre/importers";
import type { Backup, RestoreResult } from "@cofre/storage";
import { Button, Callout, Field, SectionTitle } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadCsv, downloadJson, fileNameFor, readPickedFile } from "../lib/download.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { normaliseServer } from "../storage/mode.ts";
import { createServerClient } from "../storage/remoteSession.ts";
import { lastSyncAt, type SyncOutcome, syncWithServer } from "../storage/syncClient.ts";

function Section({
	title,
	children,
	description,
}: {
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<section className="space-y-3 border-t border-rule pt-5">
			<h2 className="font-serif text-lg">{title}</h2>
			<p className="max-w-[60ch] text-sm text-graphite">{description}</p>
			{children}
		</section>
	);
}

function RestoreSummary({ result }: { result: RestoreResult }) {
	const { t } = useTranslation();
	return (
		<Callout tone="neutral" title={t("data.restoredTitle")}>
			<ul className="space-y-1">
				{result.spaces.map((space) => (
					<li key={space.spaceId}>
						{t("data.restoredSpace", { name: space.name, count: space.written })}
						{space.skipped.map((entry) => (
							<span key={`${entry.table}:${entry.reason}`} className="block text-xs">
								{t(`data.skipped.${entry.reason}`, { count: entry.count, table: entry.table })}
							</span>
						))}
					</li>
				))}
			</ul>
		</Callout>
	);
}

export function DataPage() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { session, driver, mode, server, currentSpace, spaces, reload } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const [problem, setProblem] = useState<string | null>(null);
	const [restored, setRestored] = useState<RestoreResult | null>(null);

	const [address, setAddress] = useState(server ?? "");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [synced, setSynced] = useState<SyncOutcome | null>(null);
	const [signedIn, setSignedIn] = useState(false);

	const seen =
		spaceId === "" || address === "" ? null : lastSyncAt(spaceId, normaliseServer(address));

	function failed(error: unknown) {
		setProblem(error instanceof Error ? error.message : String(error));
	}

	const exportSpace = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			return session.backup.exportSpace(spaceId);
		},
		onSuccess: (backup: Backup) => {
			setProblem(null);
			downloadJson(fileNameFor("cofre_espaco", "json"), backup);
		},
		onError: failed,
	});

	const exportAll = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			return session.backup.exportEverything();
		},
		onSuccess: (backup: Backup) => {
			setProblem(null);
			downloadJson(fileNameFor("cofre_completo", "json"), backup);
		},
		onError: failed,
	});

	const exportRecords = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			return session.backup.recordsForExport(spaceId);
		},
		onSuccess: (records) => {
			setProblem(null);
			const text = writeCsv(
				[
					t("table.date"),
					t("table.description"),
					t("table.amount"),
					t("data.column.currency"),
					t("data.column.kind"),
					t("data.column.status"),
					t("data.column.account"),
					t("data.column.counterAccount"),
					t("table.category"),
					t("data.column.priority"),
					t("data.column.notes"),
					t("data.column.invoice"),
					t("data.column.installment"),
				],
				records.map((record) => [
					record.happenedOn,
					record.description,
					writeAmount(record.amount),
					record.currency,
					t(`transactionKind.${record.kind}`),
					t(`transactionStatus.${record.status}`),
					record.account,
					record.counterAccount,
					record.category,
					record.priority === null ? null : t(`priority.${record.priority}`),
					record.notes,
					record.invoiceMonth,
					record.installment,
				]),
			);
			downloadCsv(fileNameFor("cofre_lancamentos", "csv"), text);
		},
		onError: failed,
	});

	const restore = useMutation({
		mutationFn: async (file: File) => {
			if (!session) throw new Error("no session");
			const text = new TextDecoder().decode(await readPickedFile(file));
			return session.backup.restore(JSON.parse(text) as Backup);
		},
		onSuccess: async (result) => {
			setProblem(null);
			setRestored(result);
			await reload();
			void queries.invalidateQueries();
		},
		onError: failed,
	});

	const signIn = useMutation({
		mutationFn: async () => {
			const client = createServerClient(normaliseServer(address));
			await client.signIn({ email: email.trim(), password });
			return client.me();
		},
		onSuccess: () => {
			setProblem(null);
			setSignedIn(true);
			setPassword("");
		},
		onError: failed,
	});

	const sync = useMutation({
		mutationFn: async () => {
			if (!driver) throw new Error("no database");
			return syncWithServer(driver, normaliseServer(address), spaceId);
		},
		onSuccess: async (outcome) => {
			setProblem(null);
			setSynced(outcome);
			await reload();
			void queries.invalidateQueries();
		},
		onError: failed,
	});

	return (
		<div className="space-y-6">
			<SectionTitle level="h1">{t("data.title")}</SectionTitle>
			<p className="max-w-[60ch] text-sm text-graphite">{t("data.explain")}</p>

			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			<Section title={t("data.importTitle")} description={t("data.importBody")}>
				<Button variant="primary" onClick={() => void navigate({ to: ROUTES.import })}>
					{t("data.importAction")}
				</Button>
			</Section>

			<Section title={t("data.exportTitle")} description={t("data.exportBody")}>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="secondary"
						disabled={spaceId === "" || exportSpace.isPending}
						onClick={() => exportSpace.mutate()}
					>
						{t("data.exportSpace", { name: currentSpace?.name ?? "" })}
					</Button>
					{spaces.length > 1 ? (
						<Button
							variant="secondary"
							disabled={exportAll.isPending}
							onClick={() => exportAll.mutate()}
						>
							{t("data.exportEverything")}
						</Button>
					) : null}
					<Button
						variant="quiet"
						disabled={spaceId === "" || exportRecords.isPending}
						onClick={() => exportRecords.mutate()}
					>
						{t("data.exportRecords")}
					</Button>
				</div>
			</Section>

			<Section title={t("data.restoreTitle")} description={t("data.restoreBody")}>
				<label htmlFor="backupFile" className="block text-sm font-medium text-ink">
					{t("data.restorePick")}
				</label>
				<input
					id="backupFile"
					type="file"
					accept=".json,application/json"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) restore.mutate(file);
						event.target.value = "";
					}}
					className="block w-full max-w-md text-sm text-ink file:mr-3 file:rounded-sm file:border file:border-rule file:bg-raised file:px-3 file:py-2 file:text-sm file:text-ink"
				/>
				{restored ? <RestoreSummary result={restored} /> : null}
			</Section>

			{mode === "browser" ? (
				<Section title={t("data.syncTitle")} description={t("data.syncBody")}>
					<div className="max-w-md space-y-3">
						<Field
							label={t("data.server")}
							value={address}
							onChange={(event) => setAddress(event.target.value)}
							placeholder="https://cofre.seudominio.com"
							hint={t("data.serverHint")}
						/>

						{signedIn ? null : (
							<>
								<Field
									label={t("onboarding.email")}
									type="email"
									autoComplete="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
								<Field
									label={t("signIn.password")}
									type="password"
									autoComplete="current-password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
								/>
								<Button
									variant="secondary"
									disabled={address === "" || email === "" || password === "" || signIn.isPending}
									onClick={() => signIn.mutate()}
								>
									{t("data.connect")}
								</Button>
							</>
						)}

						{signedIn ? (
							<div className="space-y-2">
								<Button
									variant="primary"
									disabled={spaceId === "" || sync.isPending}
									onClick={() => sync.mutate()}
								>
									{t("data.syncNow", { name: currentSpace?.name ?? "" })}
								</Button>
								{synced ? (
									<p className="text-sm text-graphite">
										{t("data.syncDone", { sent: synced.pushed, received: synced.pulled })}
									</p>
								) : null}
							</div>
						) : null}

						{seen === null ? null : (
							<p className="text-xs text-graphite">
								{t("data.lastSync", {
									when: new Date(seen).toLocaleString(i18n.resolvedLanguage ?? "pt-BR"),
								})}
							</p>
						)}
					</div>
				</Section>
			) : null}
		</div>
	);
}
