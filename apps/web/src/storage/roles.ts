// What this person may do in this space, asked in one place.
//
// Three screens used to read the member list and write their own lists of roles, and every
// other screen that writes offered everything to everybody and let the model refuse it
// afterwards, in a sentence written for whoever wrote the code. Two costs came with that:
// somebody filled in a whole dialog to be told no at the end, and the lists in the
// components drifted from the matrix nobody was reading.
//
// So there is one question now, asked of the same matrix the repositories are checked
// against: may this role do this. The answer while the member list is still being read is
// no, because a button that appears a moment late is better than one that is refused when
// it is pressed. A space this person is not in answers no for the same reason.

import type { Permission, RepositoryMethod, Role } from "@cofre/storage";
import { METHOD_PERMISSIONS, roleCan, roleSeesOwnRowsOnly } from "@cofre/storage";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useCofre } from "./CofreProvider.tsx";

export type WhatIMayDo = {
	/** The role this person holds here, or nothing while the list is being read. */
	role: Role | null;
	/** The member list has been read. Until then every answer is no. */
	ready: boolean;
	may: (permission: Permission) => boolean;
	/**
	 * The same question asked about one call rather than about a permission.
	 *
	 * A control that is one button on one method says which method, and the permission is
	 * read from the table the conformance probes prove against the repositories themselves.
	 * A button cannot then name a permission at all, so it cannot name the wrong one: the
	 * overview had one that did, gating a delete behind the update permission, and nothing
	 * could tell, because the two hold the same roles today.
	 *
	 * `may` stays for a gate that is not one call, such as a whole screen's editing, because
	 * naming a method there would be a worse fiction than naming a permission.
	 */
	mayCall: (method: RepositoryMethod) => boolean;
	/**
	 * This person only ever sees the records they wrote themselves, which is not a
	 * permission: it is why a screen about the month of the whole household closes to
	 * them while the list of records stays open.
	 */
	seesOwnRowsOnly: boolean;
};

/**
 * Every space has a member row for whoever made it, including the personal one, so a role
 * that is missing means the list has not arrived or this person is not in this space.
 * Neither of those is a reason to draw a button.
 */
export function useWhatIMayDo(spaceId: string | undefined): WhatIMayDo {
	const { session, user } = useCofre();

	// The same key the screens already use, so the two share one read.
	const members = useQuery({
		queryKey: ["members", spaceId],
		enabled: Boolean(session && spaceId),
		queryFn: () => (spaceId ? (session?.members.list(spaceId) ?? []) : []),
	});

	const role = (members.data ?? []).find((one) => one.userId === user?.id)?.role ?? null;

	const may = useCallback((permission: Permission) => roleCan(role, permission), [role]);
	const mayCall = useCallback(
		(method: RepositoryMethod) => roleCan(role, METHOD_PERMISSIONS[method]),
		[role],
	);

	return {
		role,
		ready: members.isSuccess,
		may,
		mayCall,
		seesOwnRowsOnly: roleSeesOwnRowsOnly(role),
	};
}
