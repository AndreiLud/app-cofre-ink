// Who is asking, and what that lets them do.
//
// The matrix below is the whole permission model, written as data so that a person can
// read it and a test can walk it. Every repository method names the permission it
// needs, and the conformance suite fails when a method has no entry here.

import type { ROLES } from "@cofre/db";
import { NotFoundError, PermissionError } from "./errors.ts";

export type Role = (typeof ROLES)[number];
export type MemberState = "invited" | "active" | "removed";

export type Membership = {
	spaceId: string;
	role: Role;
	state: MemberState;
};

export type Actor = {
	userId: string;
	/** Identifies the device in the change log and in the logical clock. */
	deviceId: string;
	memberships: readonly Membership[];
};

export const PERMISSIONS = {
	"space.read": ["owner", "admin", "editor", "viewer", "logger"],
	"space.update": ["owner", "admin"],
	"space.delete": ["owner"],
	"space.leave": ["admin", "editor", "viewer", "logger"],
	"member.read": ["owner", "admin", "editor", "viewer", "logger"],
	"member.invite": ["owner", "admin"],
	"member.changeRole": ["owner", "admin"],
	"member.remove": ["owner", "admin"],
	"account.read": ["owner", "admin", "editor", "viewer", "logger"],
	"account.create": ["owner", "admin", "editor"],
	"account.update": ["owner", "admin", "editor"],
	"account.archive": ["owner", "admin", "editor"],
	"account.delete": ["owner", "admin"],
	// The logger writes and reads, but only ever sees what they wrote themselves.
	"transaction.read": ["owner", "admin", "editor", "viewer", "logger"],
	"transaction.create": ["owner", "admin", "editor", "logger"],
	"transaction.update": ["owner", "admin", "editor", "logger"],
	"transaction.delete": ["owner", "admin", "editor", "logger"],
	"transaction.reconcile": ["owner", "admin", "editor"],
	// Everybody reads the categories, because everybody who writes a record has to
	// pick one. Changing the list itself is a decision about the whole space.
	"category.read": ["owner", "admin", "editor", "viewer", "logger"],
	"category.write": ["owner", "admin", "editor"],
	// A rule and a recurrence write records into the space, so they are set by the
	// people who may write records, and read by everybody who sees them.
	"rule.read": ["owner", "admin", "editor", "viewer", "logger"],
	"rule.write": ["owner", "admin", "editor"],
	"recurrence.read": ["owner", "admin", "editor", "viewer", "logger"],
	"recurrence.write": ["owner", "admin", "editor"],
	// The plan of the space: limits, goals and the promise to save first. Everybody
	// sees it, because a limit nobody knows about is not a limit.
	"plan.read": ["owner", "admin", "editor", "viewer", "logger"],
	"plan.write": ["owner", "admin", "editor"],
	// Who owes whom. A logger records what they spent and is part of the count, so
	// they read it, and the settling is done by the people who run the space.
	"sharing.read": ["owner", "admin", "editor", "viewer", "logger"],
	"sharing.write": ["owner", "admin", "editor"],
	// A saved filter is a person's own shortcut. Everybody who can read a space can
	// keep one, and the repository only ever shows somebody their own.
	"filter.read": ["owner", "admin", "editor", "viewer", "logger"],
	"filter.write": ["owner", "admin", "editor", "viewer", "logger"],
	"activity.read": ["owner", "admin", "editor", "viewer"],
	// A backup is the whole space in one file. Anybody who can read the space can read
	// it a screen at a time, and taking a copy of all of it away is a decision of the
	// people who run the space.
	"backup.export": ["owner", "admin"],
	// Putting one back is the same decision in the other direction, and it only asks
	// this much of a space that is already here. A space that arrives from a file and
	// has nobody in it is nobody's to refuse, and whoever brings it in becomes its
	// owner, which is what makes a backup a way out and not a way in.
	"backup.restore": ["owner", "admin"],
	// What somebody owns is part of what the space is worth, so everybody in it sees
	// the total. Typing in a price is for the people who keep the space.
	"investment.read": ["owner", "admin", "editor", "viewer", "logger"],
	"investment.write": ["owner", "admin", "editor"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** The role this person holds in a space, or nothing if they are not a member of it. */
export function roleIn(actor: Actor, spaceId: string): Role | null {
	const membership = actor.memberships.find(
		(candidate) => candidate.spaceId === spaceId && candidate.state === "active",
	);
	return membership?.role ?? null;
}

export function isMember(actor: Actor, spaceId: string): boolean {
	return roleIn(actor, spaceId) !== null;
}

/**
 * True for the role meant for a child, or for whoever helps with the house: they
 * record what they spent and see what they recorded, and nothing else.
 *
 * This is not a permission and is not in the matrix: it is what a role sees rather than
 * what it may do, which is why a screen about the whole household closes to it while the
 * list of records stays open.
 */
export function roleSeesOwnRowsOnly(role: Role | null | undefined): boolean {
	return role === "logger";
}

export function seesOwnRowsOnly(actor: Actor, spaceId: string): boolean {
	return roleSeesOwnRowsOnly(roleIn(actor, spaceId));
}

/** Every space this person can read, which is what the consolidated view is made of. */
export function readableSpaceIds(actor: Actor): string[] {
	return actor.memberships
		.filter((membership) => membership.state === "active")
		.map((membership) => membership.spaceId);
}

/**
 * What a role may do, asked without an actor.
 *
 * A screen holds a role and not an actor: it has read the member list of the space it is
 * drawing, and every row in it is a person and a role. This is the same matrix the
 * repositories are checked against, so a button and the refusal behind it cannot disagree,
 * and a change to the model reaches the interface without anybody copying a list of roles
 * into a component.
 *
 * Nothing counts as not being a member, which is also the right answer while a member
 * list is still being read: a button that appears a moment late is better than one that
 * is refused when it is pressed.
 */
export function roleCan(role: Role | null | undefined, permission: Permission): boolean {
	if (role === null || role === undefined) return false;
	// A permission the matrix does not hold is not a permission. The types say this
	// cannot happen, and the day one is taken out of the matrix while a screen still
	// names it, the answer that keeps somebody safe is no.
	const allowed = PERMISSIONS[permission] as readonly Role[] | undefined;
	return allowed?.includes(role) === true;
}

export function can(actor: Actor, spaceId: string, permission: Permission): boolean {
	return roleCan(roleIn(actor, spaceId), permission);
}

/**
 * Two different answers, on purpose.
 *
 * Someone who does not belong to the space is told that it does not exist, because
 * confirming that it does would already say something about other people's money.
 * Someone who does belong is told plainly that their role does not allow it, which is
 * the answer they can act on.
 */
export function assertCan(actor: Actor, spaceId: string, permission: Permission): void {
	if (roleIn(actor, spaceId) === null) {
		throw new NotFoundError("space", spaceId);
	}
	if (!can(actor, spaceId, permission)) {
		throw new PermissionError(permission, spaceId);
	}
}

/** An actor with no space yet, which is what a person is right after signing up. */
export function createActor(
	userId: string,
	deviceId: string,
	memberships: Membership[] = [],
): Actor {
	return { userId, deviceId, memberships };
}
