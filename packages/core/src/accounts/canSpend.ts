// How much is still there to spend this month.
//
// The first line of the product brief promises somebody sees, in seconds, how much is
// left to spend this month, and no screen answered it. The overview showed what the
// accounts hold, which is not the answer: most of it is already promised to the rent,
// to the card and to what the household said it would put aside.
//
// So the answer is a subtraction, and every part of it is named, because a number
// somebody is going to spend against has to be one they can argue with.

export type CanSpendInput = {
	/**
	 * What can be spent now.
	 *
	 * Deliberately not what somebody has: an investment is money and it is not money for
	 * lunch, and a number that told a household to sell a fund to get through Thursday
	 * would be worse than no number.
	 */
	spendable: number;
	/** What still arrives before the month ends, in minor units. */
	comingIn: number;
	/** What still falls due before the month ends, including a card invoice, as a positive number. */
	fallingDue: number;
	/** What the savings rule still asks for this month, as a positive number. */
	stillToSave: number;
};

export type CanSpend = {
	/** What is left. Negative means the month is already over budget, and is shown as such. */
	amount: number;
	/** The four parts, so a screen can show the subtraction rather than assert the answer. */
	parts: CanSpendInput;
};

/**
 * The subtraction, with nothing clamped.
 *
 * A negative answer is the most useful one this function produces, so it is returned as
 * it comes out. Clamping it at zero would turn "you are eight hundred short for the
 * month" into "you have nothing left", which are different sentences and only one of
 * them is true.
 */
export function canSpendThisMonth(input: CanSpendInput): CanSpend {
	return {
		amount: input.spendable + input.comingIn - input.fallingDue - input.stillToSave,
		parts: input,
	};
}
