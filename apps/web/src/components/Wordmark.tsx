// The name of the product, set rather than typed.
//
// Two words, and the second one is what the thing is made of, so it is the one in
// italic: a serif italic is the closest a screen gets to something written by hand
// rather than printed. The first word stays upright, which keeps the pair readable at
// the size a header gives it.
//
// It reads the name from the translations and splits on the last space, so a name of
// one word renders as one word and nothing here has to be told when that changes.

import { useTranslation } from "react-i18next";

export function Wordmark({ className }: { className?: string }) {
	const { t } = useTranslation();
	const name = t("app.name");

	const at = name.lastIndexOf(" ");
	const first = at === -1 ? name : name.slice(0, at);
	const last = at === -1 ? "" : name.slice(at + 1);

	return (
		<span className={className}>
			{first}
			{last === "" ? null : (
				<>
					{" "}
					{/* One word of the two, so the pair reads as a name and not as a
					    sentence that lost its way. */}
					<span className="font-serif italic">{last}</span>
				</>
			)}
		</span>
	);
}
