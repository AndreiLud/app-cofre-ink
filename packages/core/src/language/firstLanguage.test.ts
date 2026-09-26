// The order the interface picks a language in, and the one question underneath it.

import { describe, expect, it } from "vitest";
import { BRAZIL_TIMEZONES, firstLanguage, isBrazilTimezone } from "./firstLanguage.ts";

describe("telling a Brazilian clock from any other", () => {
	it("knows the zones of Brazil", () => {
		for (const zone of [
			"America/Sao_Paulo",
			"America/Manaus",
			"America/Noronha",
			"America/Rio_Branco",
			"America/Fortaleza",
			"America/Cuiaba",
			"America/Belem",
			"America/Boa_Vista",
		]) {
			expect(isBrazilTimezone(zone), zone).toBe(true);
		}
	});

	it("still answers to the names the database renamed", () => {
		expect(isBrazilTimezone("Brazil/East")).toBe(true);
		expect(isBrazilTimezone("Brazil/West")).toBe(true);
		expect(isBrazilTimezone("Brazil/Acre")).toBe(true);
		expect(isBrazilTimezone("Brazil/DeNoronha")).toBe(true);
		expect(isBrazilTimezone("America/Porto_Acre")).toBe(true);
	});

	it("knows the rest of the world is not Brazil", () => {
		for (const zone of [
			"America/New_York",
			"America/Argentina/Buenos_Aires",
			"America/Bogota",
			"America/Montevideo",
			"Europe/Lisbon",
			"Europe/London",
			"Africa/Luanda",
			"Asia/Tokyo",
			"UTC",
		]) {
			expect(isBrazilTimezone(zone), zone).toBe(false);
		}
	});

	// The continent is two continents, and matching the first half of the name would
	// hand Portuguese to every device between Alaska and Patagonia.
	it("does not take a whole continent for one country", () => {
		expect(isBrazilTimezone("America/Lima")).toBe(false);
		expect(isBrazilTimezone("America/Santiago")).toBe(false);
	});

	it("says no to nothing at all", () => {
		expect(isBrazilTimezone(null)).toBe(false);
		expect(isBrazilTimezone(undefined)).toBe(false);
		expect(isBrazilTimezone("")).toBe(false);
	});

	it("carries the sixteen zones of the country and the five old names", () => {
		expect(BRAZIL_TIMEZONES.size).toBe(21);
	});
});

describe("the order a language is decided in", () => {
	it("takes the address first, over everything", () => {
		expect(firstLanguage({ asked: "en", remembered: "pt", timezone: "America/Sao_Paulo" })).toEqual(
			{ language: "en", source: "address" },
		);

		expect(firstLanguage({ asked: "pt", remembered: "en", timezone: "Europe/London" })).toEqual({
			language: "pt",
			source: "address",
		});
	});

	it("ignores an address that says something else", () => {
		// Somebody typing into the address bar, or a link from who knows where.
		for (const asked of ["es", "PT", "pt-BR", "", "true", "1"]) {
			expect(firstLanguage({ asked, timezone: "Europe/London" }), asked).toEqual({
				language: "en",
				source: "origin",
			});
		}
	});

	it("takes the choice this browser holds, over the clock", () => {
		expect(firstLanguage({ remembered: "en", timezone: "America/Sao_Paulo" })).toEqual({
			language: "en",
			source: "choice",
		});

		expect(firstLanguage({ remembered: "pt", timezone: "Asia/Tokyo" })).toEqual({
			language: "pt",
			source: "choice",
		});
	});

	it("ignores a stored value that is not a language", () => {
		expect(firstLanguage({ remembered: "fr", timezone: "America/Manaus" })).toEqual({
			language: "pt",
			source: "origin",
		});
	});

	it("opens in Portuguese on a Brazilian clock and in English on any other", () => {
		expect(firstLanguage({ timezone: "America/Sao_Paulo" })).toEqual({
			language: "pt",
			source: "origin",
		});

		expect(firstLanguage({ timezone: "America/New_York" })).toEqual({
			language: "en",
			source: "origin",
		});
	});

	it("falls back to Portuguese when the device will not say where it is", () => {
		expect(firstLanguage({})).toEqual({ language: "pt", source: "fallback" });
		expect(firstLanguage({ timezone: null })).toEqual({ language: "pt", source: "fallback" });
		expect(firstLanguage({ timezone: "   " })).toEqual({ language: "pt", source: "fallback" });
		expect(firstLanguage()).toEqual({ language: "pt", source: "fallback" });
	});

	// The source is the whole reason this returns an object instead of a string: the
	// caller writes down a choice and never writes down a guess.
	it("says where the answer came from, so a guess is not kept as a choice", () => {
		expect(firstLanguage({ asked: "en" }).source).toBe("address");
		expect(firstLanguage({ remembered: "en" }).source).toBe("choice");
		expect(firstLanguage({ timezone: "Europe/Lisbon" }).source).toBe("origin");
		expect(firstLanguage({ timezone: "" }).source).toBe("fallback");
	});
});
