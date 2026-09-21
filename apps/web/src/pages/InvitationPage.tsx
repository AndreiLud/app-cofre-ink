// Someone opened a link. They may have no account, they may be signed in to the wrong
// server, or they may already be inside. The screen says which of those it is, and
// offers exactly one way forward.

import type { SpaceColour } from "@cofre/ui";
import { Button, Callout, EmptyState, SectionTitle, Skeleton, SpaceMark } from "@cofre/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { createServerClient, ServerError } from "../storage/remoteSession.ts";

export function InvitationPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { token } = useParams({ from: "/convite/$token" });
	const { mode, server, linkInvitations, reload, selectSpace } = useCofre();

	const preview = useQuery({
		queryKey: ["invitation", token, server],
		enabled: Boolean(server),
		retry: false,
		queryFn: () => createServerClient(server ?? "").previewInvitation(token),
	});

	const accept = useMutation({
		mutationFn: async () => {
			if (!linkInvitations) throw new Error("no server session");
			return linkInvitations.accept(token);
		},
		onSuccess: async (joined) => {
			await reload();
			selectSpace(joined.spaceId);
			void navigate({ to: ROUTES.dashboard });
		},
	});

	if (mode !== "server" || !server) {
		return (
			<div className="mx-auto max-w-xl px-4 py-16">
				<EmptyState
					title={t("invitation.needsServerTitle")}
					description={t("invitation.needsServerBody")}
				/>
			</div>
		);
	}

	if (preview.isPending) {
		return (
			<div className="mx-auto max-w-xl px-4 py-16">
				<Skeleton lines={3} />
			</div>
		);
	}

	if (preview.isError) {
		const reason =
			preview.error instanceof ServerError ? preview.error.code : "invitationUnreadable";
		return (
			<div className="mx-auto max-w-xl px-4 py-16 space-y-4">
				<Callout tone="problem" title={t("invitation.cannotOpenTitle")}>
					{t(`invitation.reason.${reason}`, { defaultValue: t("invitation.reason.unknown") })}
				</Callout>
				<Button variant="secondary" onClick={() => void navigate({ to: ROUTES.dashboard })}>
					{t("invitation.goHome")}
				</Button>
			</div>
		);
	}

	const invitation = preview.data;

	return (
		<div className="mx-auto max-w-xl space-y-6 px-4 py-16">
			<SectionTitle level="h1">{t("invitation.title")}</SectionTitle>

			<div className="space-y-3">
				<p className="font-serif text-2xl">
					{t("invitation.headline", {
						name: invitation.invitedByName,
						space: invitation.spaceName,
					})}
				</p>
				<p className="text-graphite">
					{t("invitation.asRole", { role: t(`role.${invitation.role}`) })}
				</p>
				<p className="text-sm text-graphite">{t(`roleHint.${invitation.role}`)}</p>
				<SpaceMark name={invitation.spaceName} colour={invitation.spaceColour as SpaceColour} />
			</div>

			{accept.isError ? (
				<Callout tone="problem" title={t("invitation.cannotOpenTitle")}>
					{accept.error instanceof ServerError
						? t(`invitation.reason.${accept.error.code}`, {
								defaultValue: t("invitation.reason.unknown"),
							})
						: t("invitation.reason.unknown")}
				</Callout>
			) : null}

			<div className="flex gap-3">
				<Button variant="primary" onClick={() => accept.mutate()} disabled={accept.isPending}>
					{accept.isPending ? t("invitation.joining") : t("invitation.join")}
				</Button>
				<Button variant="quiet" onClick={() => void navigate({ to: ROUTES.dashboard })}>
					{t("actions.cancel")}
				</Button>
			</div>
		</div>
	);
}
