// The things that happen again, on a screen of their own.
//
// They lived at the bottom of the calendar, which is where nobody looks for the rent, and the
// finding that said how much the repeating charges come to sent people to the list of records,
// where a series is not a line. Part 2, G.1 of the request for 2.0.0.

import { todayIn } from "@cofre/core";
import { SectionTitle } from "@cofre/ui";
import { useTranslation } from "react-i18next";
import { RecurrencesSection } from "../components/RecurrencesSection.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

export function RecurringPage() {
	const { t } = useTranslation();
	const { currentSpace } = useCofre();
	if (!currentSpace) return null;
	const today = todayIn(currentSpace.timezone);

	return (
		<div className="space-y-6">
			<SectionTitle level="h1">{t("recurrences.title")}</SectionTitle>
			<RecurrencesSection spaceId={currentSpace.id} today={today} />
		</div>
	);
}
