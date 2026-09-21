// Holds the one connection to the database, the session of the person using it, and
// the space they are looking at. Everything else asks this.

import type { Driver, Session, Space, User } from "@cofre/storage";
import { findUserById, openSession } from "@cofre/storage";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	deviceId,
	forgetProfile,
	rememberSpace,
	rememberUser,
	storedSpaceId,
	storedUserId,
} from "./localProfile.ts";
import { openBrowserDatabase } from "./workerDriver.ts";

export type CofreStatus = "opening" | "needsProfile" | "ready" | "failed";

export type CofreValue = {
	status: CofreStatus;
	error: string | null;
	/** False when the browser refused to keep the data, which the interface has to say. */
	persistent: boolean;
	driver: Driver | null;
	session: Session | null;
	user: User | null;
	spaces: Space[];
	currentSpace: Space | null;
	amountsHidden: boolean;
	setAmountsHidden: (hidden: boolean) => void;
	selectSpace: (spaceId: string) => void;
	/** Called after a profile is created during onboarding. */
	adoptUser: (user: User) => Promise<void>;
	reload: () => Promise<void>;
};

const CofreContext = createContext<CofreValue | null>(null);

// The database opens once per tab, even when React mounts twice in development.
let connection: Promise<{ driver: Driver; persistent: boolean }> | null = null;
function connect() {
	if (!connection) connection = openBrowserDatabase();
	return connection;
}

export function CofreProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<CofreStatus>("opening");
	const [error, setError] = useState<string | null>(null);
	const [persistent, setPersistent] = useState(true);
	const [driver, setDriver] = useState<Driver | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [user, setUser] = useState<User | null>(null);
	const [spaces, setSpaces] = useState<Space[]>([]);
	const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(storedSpaceId);
	const [amountsHidden, setAmountsHidden] = useState(false);

	const startSession = useCallback(async (database: Driver, userId: string) => {
		const opened = await openSession({ driver: database, userId, deviceId: deviceId() });
		const [me, list] = await Promise.all([opened.users.me(), opened.spaces.list()]);
		setSession(opened);
		setUser(me);
		setSpaces(list);
		setStatus("ready");
		return opened;
	}, []);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				const database = await connect();
				if (cancelled) return;
				setDriver(database.driver);
				setPersistent(database.persistent);

				const userId = storedUserId();
				if (!userId) {
					setStatus("needsProfile");
					return;
				}

				// The browser can throw the database away and keep the identifier. That
				// is not a failure, it is someone starting over, so the onboarding takes
				// it from here instead of an error screen with no way out.
				const profile = await findUserById(database.driver, userId);
				if (!profile) {
					forgetProfile();
					setStatus("needsProfile");
					return;
				}

				await startSession(database.driver, userId);
			} catch (problem) {
				if (cancelled) return;
				setError(problem instanceof Error ? problem.message : String(problem));
				setStatus("failed");
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [startSession]);

	const reload = useCallback(async () => {
		if (!session) return;
		await session.refresh();
		const list = await session.spaces.list();
		setSpaces(list);
	}, [session]);

	const adoptUser = useCallback(
		async (created: User) => {
			if (!driver) return;
			rememberUser(created.id);
			await startSession(driver, created.id);
		},
		[driver, startSession],
	);

	const selectSpace = useCallback((spaceId: string) => {
		setCurrentSpaceId(spaceId);
		rememberSpace(spaceId);
	}, []);

	// The remembered space may have been removed or may belong to another profile.
	const currentSpace = useMemo(() => {
		if (spaces.length === 0) return null;
		return spaces.find((space) => space.id === currentSpaceId) ?? spaces[0] ?? null;
	}, [spaces, currentSpaceId]);

	useEffect(() => {
		if (currentSpace && currentSpace.id !== currentSpaceId) {
			setCurrentSpaceId(currentSpace.id);
			rememberSpace(currentSpace.id);
		}
	}, [currentSpace, currentSpaceId]);

	const value = useMemo<CofreValue>(
		() => ({
			status,
			error,
			persistent,
			driver,
			session,
			user,
			spaces,
			currentSpace,
			amountsHidden,
			setAmountsHidden,
			selectSpace,
			adoptUser,
			reload,
		}),
		[
			status,
			error,
			persistent,
			driver,
			session,
			user,
			spaces,
			currentSpace,
			amountsHidden,
			selectSpace,
			adoptUser,
			reload,
		],
	);

	return <CofreContext.Provider value={value}>{children}</CofreContext.Provider>;
}

export function useCofre(): CofreValue {
	const value = useContext(CofreContext);
	if (!value) throw new Error("useCofre was called outside of the provider");
	return value;
}

/** For the screens that only make sense with a session already open. */
export function useSession(): { session: Session; spaceId: string } {
	const { session, currentSpace } = useCofre();
	if (!session || !currentSpace) {
		throw new Error("this screen needs a session and a space");
	}
	return { session, spaceId: currentSpace.id };
}
