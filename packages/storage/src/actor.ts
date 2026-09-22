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
	// A saved filter is a person's own shortcut. Everybody who can read a space can
	// keep one, and the repository only ever shows somebody their own.
	"filter.read": ["owner", "admin", "editor", "viewer", "logger"],
	"filter.write": ["owner", "admin", "editor", "viewer", "logger"],
	"activity.read": ["owner", "admin", "editor", "viewer"],
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
 */
export function seesOwnRowsOnly(actor: Actor, spaceId: string): boolean {
	return roleIn(actor, spaceId) === "logger";
}

/** Every space this person can read, which is what the consolidated view is made of. */
export function readableSpaceIds(actor: Actor): string[] {
	return actor.memberships
		.filter((membership) => membership.state === "active")
		.map((membership) => membership.spaceId);
}

export function can(actor: Actor, spaceId: string, permission: Permission): boolean {
	const role = roleIn(actor, spaceId);
	if (role === null) return false;
	return (PERMISSIONS[permission] as readonly Role[]).includes(role);
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
