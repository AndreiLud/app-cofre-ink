// Someone opened a link. They may have no account, they may be signed in to the wrong
// server, or they may already be inside. The screen says which of those it is, and
// offers exactly one way forward.

import type { SpaceColour } from "@cofre/ui";
import { Button, Callout, EmptyState, SectionTitle, Skeleton, SpaceMark } from "@cofre/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { sayWhy } from "../lib/sayWhy.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { createServerClient } from "../storage/remoteSession.ts";

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
		return (
			<div className="mx-auto max-w-xl px-4 py-16 space-y-4">
				{/* Through the one translator, like every other failure in the application.
				    This screen had a second set of sentences for the same refusals, so a
				    used link said one thing here and another thing everywhere else, and the
				    two drifted from the moment the second one was written. */}
				<Callout tone="problem" title={t("invitation.cannotOpenTitle")}>
					{sayWhy(preview.error, t)}
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
				<p className="text-quiet">
					{t("invitation.asRole", { role: t(`role.${invitation.role}`) })}
				</p>
				<p className="text-sm text-quiet">{t(`roleHint.${invitation.role}`)}</p>
				<SpaceMark name={invitation.spaceName} colour={invitation.spaceColour as SpaceColour} />
			</div>

			{accept.isError ? (
				<Callout tone="problem" title={t("invitation.cannotOpenTitle")}>
					{sayWhy(accept.error, t)}
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
