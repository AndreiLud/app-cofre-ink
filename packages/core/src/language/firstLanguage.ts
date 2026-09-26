// Which language the interface opens in, decided without asking anybody anything.
//
// Four answers, and the first one that speaks wins. Nothing here consults a service:
// not an address lookup, not a location, not a third party. That is what lets the same
// build behave the same way published at an address of its own, inside a container at
// home, on a folder of a domain and on a machine with no connection at all, and it is
// the rule that nothing leaves the device.

export const LANGUAGES = ["pt", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
	return value === "pt" || value === "en";
}

/**
 * Every zone the tz database gives Brazil, and the names it used to give them.
 *
 * Sixteen current ones, because a country five thousand kilometres wide carries four
 * offsets and an archipelago of its own, and five names kept alive for machines that
 * were configured before the renaming. Written out rather than matched by a prefix:
 * `America/` is two continents, and half of it is not this one.
 */
export const BRAZIL_TIMEZONES: ReadonlySet<string> = new Set([
	"America/Araguaina",
	"America/Bahia",
	"America/Belem",
	"America/Boa_Vista",
	"America/Campo_Grande",
	"America/Cuiaba",
	"America/Eirunepe",
	"America/Fortaleza",
	"America/Maceio",
	"America/Manaus",
	"America/Noronha",
	"America/Porto_Velho",
	"America/Recife",
	"America/Rio_Branco",
	"America/Santarem",
	"America/Sao_Paulo",
	// The names the database kept answering to after it renamed them.
	"America/Porto_Acre",
	"Brazil/Acre",
	"Brazil/DeNoronha",
	"Brazil/East",
	"Brazil/West",
]);

export function isBrazilTimezone(zone: string | null | undefined): boolean {
	if (typeof zone !== "string") return false;
	return BRAZIL_TIMEZONES.has(zone.trim());
}

/** Where the language that opened came from, which is what decides if it is kept. */
export type LanguageSource = "address" | "choice" | "origin" | "fallback";

export type FirstLanguageInput = {
	/** The lang parameter of the address, when a site sent somebody here with one. */
	asked?: string | null;
	/** What this browser wrote down the last time somebody chose. */
	remembered?: string | null;
	/** What the device says its own zone is. */
	timezone?: string | null;
};

export type FirstLanguage = { language: Language; source: LanguageSource };

/**
 * The order, and the reason each one sits where it does.
 *
 * The source travels with the answer because the caller has to treat two of them
 * differently: a language that somebody chose is written down, and a language that was
 * merely guessed from a clock is not.
 */
export function firstLanguage({
	asked,
	remembered,
	timezone,
}: FirstLanguageInput = {}): FirstLanguage {
	// 1. The address. This is the site saying which language the person picked over
	//    there, so it outranks everything, including a choice made here before. Any
	//    other value is somebody typing into the address bar, and is ignored rather
	//    than guessed at.
	if (isLanguage(asked)) return { language: asked, source: "address" };

	// 2. The choice this browser already holds. Somebody pressed the button, and that
	//    beats anything a clock has to say about it.
	if (isLanguage(remembered)) return { language: remembered, source: "choice" };

	// 3. Where the device thinks it is. It decides the first screen and nothing more:
	//    it is never written down, so the button still has the last word and somebody
	//    who travels does not come back to an interface that translated itself.
	if (isBrazilTimezone(timezone)) return { language: "pt", source: "origin" };
	if (typeof timezone === "string" && timezone.trim() !== "") {
		return { language: "en", source: "origin" };
	}

	// 4. A device that will not say. Portuguese, which is what it always was.
	return { language: "pt", source: "fallback" };
}
