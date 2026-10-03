// Which version this copy is, under the danger zone, and on a server whether a newer one was
// published and how to get to it.
//
// A line and not a panel: it is a fact about the copy, not something to do with the data. In
// the browser that line is all there is, because the page is the copy and a reload brings the
// one the address serves. On a server the button asks, through the server, which version was
// published last; never on its own, because nothing leaves the owner's server unless somebody
// asks (rule 5), and a check on every opening would tell GitHub every day that the server
// exists. Whoever is signed in may press it, a reader too: the answer is public and says
// nothing about anybody's money (part 2, K.2 to K.4).

import { releasePageOf } from "@cofre/cloud";
import { compareVersions, crossesMajor, parseVersion, versionText } from "@cofre/core";
import { Button, Callout } from "@cofre/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { readNotes } from "../lib/releaseNotes.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { type UpdateStep, updateSteps } from "../lib/updateCommands.ts";
import { APP_VERSION } from "../lib/version.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import type {
	ReleaseSaid,
	ServerAbout,
	ServerClient,
	UpdateAnswer,
} from "../storage/remoteSession.ts";

/** The id of the panel of the manual copy, which the steps point at. */
export const MANUAL_COPY = "copiaManual";

/** A version as people read it, whatever the server wrote. */
function said(version: string): string {
	const parsed = parseVersion(version);
	return parsed ? versionText(parsed) : version;
}

export function AboutThisCopy() {
	const { t } = useTranslation();
	const { mode, client, serverVersion } = useCofre();

	return (
		<div className="space-y-4 text-sm">
			<p className="text-quiet">{t("about.line", { version: APP_VERSION })}</p>
			{mode === "server" && client !== null ? (
				<OnTheServer client={client} serverVersion={serverVersion} />
			) : null}
		</div>
	);
}

function OnTheServer({
	client,
	serverVersion,
}: {
	client: ServerClient;
	serverVersion: string | null;
}) {
	const { t, i18n } = useTranslation();
	// Nothing here goes to GitHub: it is the server saying how it was installed.
	const about = useQuery({
		queryKey: ["about"],
		queryFn: () => client.about(),
		staleTime: Infinity,
	});
	// One press, one request. The server keeps the answer an hour, so a second press in that
	// hour costs GitHub nothing either.
	const check = useMutation({ mutationFn: () => client.checkForUpdates() });

	const page = parseVersion(APP_VERSION);
	const server = serverVersion ? parseVersion(serverVersion) : null;
	const differs = page !== null && server !== null && compareVersions(page, server) !== 0;

	const answer = check.data ?? null;
	const hour = (instant: number) =>
		new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: "2-digit", minute: "2-digit" }).format(
			instant,
		);
	const day = (calendar: string) =>
		new Intl.DateTimeFormat(i18n.resolvedLanguage, {
			day: "2-digit",
			month: "2-digit",
			timeZone: "UTC",
		}).format(new Date(`${calendar}T12:00:00Z`));

	function sentence(found: UpdateAnswer): string {
		if (found.state === "ahead") return t("about.ahead");
		if (found.state === "behind" && found.latest) {
			const values = { latest: said(found.latest.version), version: said(found.version) };
			return found.latest.publishedOn
				? t("about.behind", { ...values, day: day(found.latest.publishedOn) })
				: t("about.behindNoDay", values);
		}
		return t("about.current", { hour: hour(found.checkedAt) });
	}

	return (
		<>
			{differs && server ? (
				<p className="text-quiet">
					{t("about.otherServer", { page: said(APP_VERSION), server: versionText(server) })}
				</p>
			) : null}

			<div className="space-y-2">
				<Button
					variant="secondary"
					size="small"
					disabled={check.isPending}
					onClick={() => check.mutate()}
				>
					{t("about.check")}
				</Button>
				{/* Before the press, so nobody learns what it does by doing it. */}
				<p className="max-w-[62ch] text-xs leading-relaxed text-quiet">{t("about.checkHint")}</p>
			</div>

			{/* There from the start and empty, so the answer is announced when it arrives. */}
			<div role="status" aria-live="polite" className="text-ink">
				{check.isError ? <p>{sayWhy(check.error, t)}</p> : null}
				{answer && !check.isPending ? <p>{sentence(answer)}</p> : null}
			</div>

			{answer && answer.state === "behind" && answer.latest && !check.isPending ? (
				<Behind answer={answer} latest={answer.latest} about={about.data ?? null} />
			) : null}
		</>
	);
}

function Behind({
	answer,
	latest,
	about,
}: {
	answer: UpdateAnswer;
	latest: ReleaseSaid;
	about: ServerAbout | null;
}) {
	const { t } = useTranslation();
	const mine = parseVersion(answer.version);
	const next = parseVersion(latest.version);
	// Made from the version that was read, never from an address GitHub sent.
	const releasePage = next ? releasePageOf(next) : null;
	const newMajor = mine !== null && next !== null && crossesMajor(mine, next);

	return (
		<div className="space-y-5">
			<section className="space-y-3">
				<h2 className="text-sm font-semibold text-ink">{t("about.notesTitle")}</h2>
				{answer.newer.map((release) => (
					<Notes key={release.version} release={release} />
				))}
				{releasePage ? (
					<p>
						<a className="text-ink underline" href={releasePage} target="_blank" rel="noreferrer">
							{t("about.releasePage")}
						</a>
					</p>
				) : null}
			</section>

			<section className="space-y-3">
				<h2 className="text-sm font-semibold text-ink">{t("about.howTitle")}</h2>
				{newMajor && mine && next ? (
					<Callout tone="attention">
						{t("about.newMajor", {
							latest: said(latest.version),
							major: mine.major,
							next: next.major,
						})}
					</Callout>
				) : null}
				{about === null ? null : about.dataOnAVolume === false ? (
					<Callout tone="problem">
						<p>{t("about.notOnAVolume")}</p>
						<p className="mt-2">{t("about.notOnAVolumeWhat")}</p>
					</Callout>
				) : (
					<Steps about={about} />
				)}
				<p className="max-w-[62ch] text-quiet">{t("about.goingBack")}</p>
			</section>
		</div>
	);
}

function Notes({ release }: { release: ReleaseSaid }) {
	const blocks = readNotes(release.notes);
	return (
		<div className="space-y-2">
			<h3 className="font-medium text-ink">{said(release.version)}</h3>
			{blocks.length === 0 ? null : (
				<div className="max-w-[62ch] space-y-2 leading-relaxed text-quiet">
					{blocks.map((block, index) => {
						// The notes have no identity of their own beyond where they are.
						const key = `${index}`;
						if (block.kind === "heading") {
							return (
								<p key={key} className="font-medium text-ink">
									{block.text}
								</p>
							);
						}
						if (block.kind === "list") {
							return (
								<ul key={key} className="list-disc space-y-1 pl-5">
									{block.items.map((item, at) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: an item of the notes is where it is
										<li key={at}>{item}</li>
									))}
								</ul>
							);
						}
						return <p key={key}>{block.text}</p>;
					})}
				</div>
			)}
		</div>
	);
}

function Steps({ about }: { about: ServerAbout }) {
	const { t } = useTranslation();
	const steps = updateSteps({
		database: about.database,
		installedWith: about.installedWith,
		version: about.version,
		databasePath: about.databasePath,
	});
	const byHand = about.installedWith === "source";

	return (
		<ol className="space-y-4">
			{steps.map((step, index) => (
				<li key={step.step} className="space-y-2">
					<p className="font-medium text-ink">
						{index + 1}. {t(step.step === "copy" ? "about.stepCopy" : "about.stepUpdate")}
					</p>
					{byHand && step.step === "copy" ? (
						<p className="text-quiet">{t("about.stopFirst")}</p>
					) : null}
					<Commands step={step} />
					{step.step === "copy" ? (
						<p className="max-w-[62ch] text-quiet">
							{t("about.alsoManual")}{" "}
							<a className="text-ink underline" href={`#${MANUAL_COPY}`}>
								{t("about.manualLink")}
							</a>
						</p>
					) : null}
					{byHand && step.step === "update" ? (
						<p className="text-quiet">{t("about.startAfter")}</p>
					) : null}
				</li>
			))}
		</ol>
	);
}

/**
 * The commands of one step, and a button that copies them.
 *
 * A server on the home network is usually reached over plain http, where the browser offers no
 * clipboard to a page. There the button selects the commands instead, so a keyboard copy takes
 * exactly them and nothing around them.
 */
function Commands({ step }: { step: UpdateStep }) {
	const { t } = useTranslation();
	const block = useRef<HTMLPreElement>(null);
	const [done, setDone] = useState<"copied" | "selected" | null>(null);
	const text = step.lines.join("\n");

	async function copy() {
		try {
			if (!navigator.clipboard) throw new Error("no clipboard");
			await navigator.clipboard.writeText(text);
			setDone("copied");
		} catch {
			const node = block.current;
			const selection = window.getSelection();
			if (node && selection) {
				const range = document.createRange();
				range.selectNodeContents(node);
				selection.removeAllRanges();
				selection.addRange(range);
			}
			setDone("selected");
		}
	}

	return (
		<div className="space-y-2">
			<pre
				ref={block}
				// Wrapped rather than scrolled sideways: a line of docker run is wider than a
				// telephone, and a copy takes the lines as they were written either way.
				className="whitespace-pre-wrap break-all rounded-sm border border-line bg-sunken px-3 py-2 font-mono text-xs leading-relaxed text-ink"
			>
				{text}
			</pre>
			<div className="flex flex-wrap items-center gap-3">
				<Button variant="quiet" size="small" onClick={() => void copy()}>
					{t("about.copy")}
				</Button>
				<span role="status" className="text-xs text-quiet">
					{done === "copied" ? t("about.copied") : done === "selected" ? t("about.selected") : ""}
				</span>
			</div>
		</div>
	);
}
