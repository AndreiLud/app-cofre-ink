// Holds the one connection to the data, the session of the person using it, and the
// space they are looking at. It is also the only place that knows whether the data
// lives in this browser or on a server, which is why no screen has to.

import type { Driver, Space, User } from "@cofre/storage";
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
import type { CofreSession } from "./cofreSession.ts";
import {
	deviceId,
	forgetProfile,
	rememberSpace,
	rememberUser,
	storedSpaceId,
	storedUserId,
} from "./localProfile.ts";
import { forgetMode, rememberMode, type StorageMode, storedMode, storedServer } from "./mode.ts";
import {
	createRemoteSession,
	createServerClient,
	type RemoteInvitations,
	type ServerClient,
} from "./remoteSession.ts";
import { type BrowserDatabase, openBrowserDatabase } from "./workerDriver.ts";

export type CofreStatus =
	| "opening"
	| "needsMode"
	| "needsProfile"
	| "needsSignIn"
	| "ready"
	/** The database file is held by another tab, which takes it exclusively. */
	| "busy"
	| "failed";

export type CofreValue = {
	status: CofreStatus;
	error: string | null;
	mode: StorageMode | null;
	server: string | null;
	/** False when the browser refused to keep the data, which the interface has to say. */
	persistent: boolean;
	driver: Driver | null;
	client: ServerClient | null;
	session: CofreSession | null;
	/** Present only in server mode, because a link needs somewhere to point. */
	linkInvitations: RemoteInvitations | null;
	user: User | null;
	spaces: Space[];
	currentSpace: Space | null;
	amountsHidden: boolean;
	setAmountsHidden: (hidden: boolean) => void;
	selectSpace: (spaceId: string) => void;
	chooseMode: (mode: StorageMode, server?: string) => Promise<void>;
	/** Called after a profile is created during onboarding, in browser mode. */
	adoptUser: (user: User) => Promise<void>;
	/** Called after signing in or signing up, in server mode. */
	adoptServerSession: () => Promise<void>;
	signOut: () => Promise<void>;
	reload: () => Promise<void>;
};

const CofreContext = createContext<CofreValue | null>(null);

// The database opens once per tab, even when React mounts twice in development.
let connection: Promise<BrowserDatabase> | null = null;
function connect() {
	if (!connection) connection = openBrowserDatabase();
	return connection;
}

export function CofreProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<CofreStatus>("opening");
	const [error, setError] = useState<string | null>(null);
	const [mode, setMode] = useState<StorageMode | null>(storedMode);
	const [server, setServer] = useState<string | null>(storedServer);
	const [persistent, setPersistent] = useState(true);
	const [driver, setDriver] = useState<Driver | null>(null);
	const [client, setClient] = useState<ServerClient | null>(null);
	const [session, setSession] = useState<CofreSession | null>(null);
	const [linkInvitations, setLinkInvitations] = useState<RemoteInvitations | null>(null);
	const [user, setUser] = useState<User | null>(null);
	const [spaces, setSpaces] = useState<Space[]>([]);
	const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(storedSpaceId);
	const [amountsHidden, setAmountsHidden] = useState(false);

	const startLocalSession = useCallback(async (database: Driver, userId: string) => {
		const opened = await openSession({ driver: database, userId, deviceId: deviceId() });
		const [me, list] = await Promise.all([opened.users.me(), opened.spaces.list()]);
		setSession(opened);
		setLinkInvitations(null);
		setUser(me);
		setSpaces(list);
		setStatus("ready");
	}, []);

	const startRemoteSession = useCallback(async (address: string) => {
		const remote = createRemoteSession(address);
		const answer = await createServerClient(address).me();
		setSession(remote);
		setLinkInvitations(remote.invitations);
		setUser(answer.user);
		setSpaces(answer.spaces);
		setStatus("ready");
	}, []);

	const openBrowserMode = useCallback(async () => {
		const database = await connect();
		setDriver(database.driver);
		setPersistent(database.outcome === "persistent");
		if (database.outcome === "busy") {
			setStatus("busy");
			return;
		}

		const userId = storedUserId();
		if (!userId) {
			setStatus("needsProfile");
			return;
		}

		// The browser can throw the database away and keep the identifier. That is not
		// a failure, it is someone starting over, so the onboarding takes it from here
		// instead of an error screen with no way out.
		const profile = await findUserById(database.driver, userId);
		if (!profile) {
			forgetProfile();
			setStatus("needsProfile");
			return;
		}

		await startLocalSession(database.driver, userId);
	}, [startLocalSession]);

	const openServerMode = useCallback(
		async (address: string) => {
			const connected = createServerClient(address);
			setClient(connected);
			setPersistent(true);
			try {
				await startRemoteSession(address);
			} catch (problem) {
				// Not signed in yet, or the session expired. Either way, ask.
				if (problem instanceof Error && problem.name === "ServerError") {
					setStatus("needsSignIn");
					return;
				}
				throw problem;
			}
		},
		[startRemoteSession],
	);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				const chosen = storedMode();
				if (!chosen) {
					if (!cancelled) setStatus("needsMode");
					return;
				}
				if (chosen === "server") {
					const address = storedServer();
					if (!address) {
						if (!cancelled) setStatus("needsMode");
						return;
					}
					if (!cancelled) await openServerMode(address);
					return;
				}
				if (!cancelled) await openBrowserMode();
			} catch (problem) {
				if (cancelled) return;
				setError(problem instanceof Error ? problem.message : String(problem));
				setStatus("failed");
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [openBrowserMode, openServerMode]);

	const reload = useCallback(async () => {
		if (!session) return;
		await session.refresh();
		setSpaces(await session.spaces.list());
	}, [session]);

	const chooseMode = useCallback(
		async (next: StorageMode, address?: string) => {
			rememberMode(next, address);
			setMode(next);
			setStatus("opening");
			setError(null);
			try {
				if (next === "server" && address) {
					setServer(address);
					await openServerMode(address);
				} else {
					await openBrowserMode();
				}
			} catch (problem) {
				setError(problem instanceof Error ? problem.message : String(problem));
				setStatus("failed");
			}
		},
		[openBrowserMode, openServerMode],
	);

	const adoptUser = useCallback(
		async (created: User) => {
			if (!driver) return;
			rememberUser(created.id);
			await startLocalSession(driver, created.id);
		},
		[driver, startLocalSession],
	);

	const adoptServerSession = useCallback(async () => {
		const address = storedServer();
		if (!address) return;
		await startRemoteSession(address);
	}, [startRemoteSession]);

	const signOut = useCallback(async () => {
		if (mode === "server" && client) {
			await client.signOut().catch(() => undefined);
			setSession(null);
			setUser(null);
			setSpaces([]);
			setStatus("needsSignIn");
			return;
		}
		forgetProfile();
		forgetMode();
		setSession(null);
		setUser(null);
		setSpaces([]);
		setMode(null);
		setStatus("needsMode");
	}, [client, mode]);

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
			mode,
			server,
			persistent,
			driver,
			client,
			session,
			linkInvitations,
			user,
			spaces,
			currentSpace,
			amountsHidden,
			setAmountsHidden,
			selectSpace,
			chooseMode,
			adoptUser,
			adoptServerSession,
			signOut,
			reload,
		}),
		[
			status,
			error,
			mode,
			server,
			persistent,
			driver,
			client,
			session,
			linkInvitations,
			user,
			spaces,
			currentSpace,
			amountsHidden,
			selectSpace,
			chooseMode,
			adoptUser,
			adoptServerSession,
			signOut,
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
