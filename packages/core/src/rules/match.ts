// Deciding which rule applies to a record.
//
// The matching is deliberately dull: a piece of text that has to appear somewhere in
// the description, ignoring case and accents. No regular expressions and no wildcards,
// because a rule that somebody cannot read back a month later is a rule that quietly
// files money in the wrong place.
//
// Order decides. The first rule that matches is the one that applies, which is what
// lets a specific rule sit above a general one.

export type RuleShape = {
	matchText: string;
	/** When set, the rule only applies to records in that account. */
	accountId?: string | null;
	/** When set, the rule only applies to that kind of record. */
	kind?: string | null;
	position: number;
};

export type RecordShape = {
	description: string;
	accountId: string;
	kind: string;
};

function fold(text: string): string {
	return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function ruleMatches(rule: RuleShape, record: RecordShape): boolean {
	const wanted = fold(rule.matchText);
	if (wanted === "") return false;
	if (!fold(record.description).includes(wanted)) return false;
	if (rule.accountId && rule.accountId !== record.accountId) return false;
	if (rule.kind && rule.kind !== record.kind) return false;
	return true;
}

/**
 * The rule that wins, or nothing. Sorted by position first so that the answer does not
 * depend on the order the database happened to return.
 */
export function pickRule<T extends RuleShape>(rules: readonly T[], record: RecordShape): T | null {
	const ordered = [...rules].sort((left, right) => left.position - right.position);
	return ordered.find((rule) => ruleMatches(rule, record)) ?? null;
}
