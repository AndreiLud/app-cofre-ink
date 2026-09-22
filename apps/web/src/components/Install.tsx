// The one line that turns a page into an application on somebody's phone.
//
// It appears when the browser says it can, and says what to do by hand when the browser
// is Safari on an iPhone, which never offers. Once installed it says nothing at all: a
// permanent suggestion to install something already installed is how a person learns to
// ignore a whole corner of a screen.

import { Button, Callout } from "@cofre/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type InstallOffer, installOffer, watchForInstall } from "../lib/install.ts";

const DISMISSED = "cofreInstallDismissed";

function wasDismissed(): boolean {
	try {
		return localStorage.getItem(DISMISSED) === "yes";
	} catch {
		return false;
	}
}

export function Install() {
	const { t } = useTranslation();
	const [offer, setOffer] = useState<InstallOffer>(() => installOffer());
	const [hidden, setHidden] = useState(wasDismissed);

	useEffect(() => watchForInstall(() => setOffer(installOffer())), []);

	if (hidden || offer.installed) return null;
	if (offer.prompt === null && !offer.byHand) return null;

	const dismiss = () => {
		setHidden(true);
		try {
			localStorage.setItem(DISMISSED, "yes");
		} catch {
			// Without storage it comes back next time, which is a small annoyance and
			// not a reason to fail.
		}
	};

	return (
		<Callout
			tone="neutral"
			title={t("install.title")}
			className="mb-6 print:hidden"
			action={
				<span className="flex flex-wrap gap-2">
					{offer.prompt ? (
						<Button
							size="small"
							variant="primary"
							onClick={() => {
								void offer.prompt?.().then(() => setOffer(installOffer()));
							}}
						>
							{t("install.action")}
						</Button>
					) : null}
					<Button size="small" variant="quiet" onClick={dismiss}>
						{t("install.later")}
					</Button>
				</span>
			}
		>
			{offer.byHand ? t("install.byHand") : t("install.body")}
		</Callout>
	);
}
