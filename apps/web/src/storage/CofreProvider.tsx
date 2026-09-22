// Holds the one connection to the data, the session of the person using it, and the
// space they are looking at. It is also the only place that knows whether the data
// lives in this browser or on a server, which is why no screen has to.

import type { Driver, Space, User } from "@cofre/storage";
import { findUserById, listProfiles, openSession, tidyEverySpace } from "@cofre/storage";
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
import { asCofreSession } from "./localSession.ts";
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
	/** Browser mode: everybody with a profile on this device, to change between them. */
	profiles: User[];
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
	/** Browser mode: read this database as another profile that is already in it. */
	switchProfile: (userId: string) => Promise<void>;
	/** Browser mode: make room for somebody else on this device. */
	addProfile: () => void;
	reload: () => Promise<void>;
	/**
	 * Browser mode only: takes the database file off the device, forgets the profile and
	 * reloads. The repository layer can empty a space row by row, which is what the
	 * server mode has, but only this leaves nothing behind on a machine.
	 */
	eraseDevice: () => Promise<void>;
};

const CofreContext = createContext<CofreValue | null>(null);

// The database opens once per tab, even when React mounts twice in development.
let connection: Promise<BrowserDatabase> | null = null;
function connect() {
	if (!connection) connection = openBrowserDatabase();
	return connection;
}

// Once per tab as well, because two passes would find nothing and cost a pass.
let tidied = false;
function tidyLater(database: Driver) {
	if (tidied) return;
	tidied = true;

	const run = () => {
		void tidyEverySpace(database).catch(() => {
			// A database that did not shrink today is a database that works.
		});
	};

	// After the first screen has painted, and after whatever the first screen asks
	// for. A person opening the application is waiting for their balance, not for
	// housekeeping.
	const idle = (window as { requestIdleCallback?: (work: () => void) => void }).requestIdleCallback;
	if (idle) idle(run);
	else window.setTimeout(run, 4000);
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
	/** Browser mode only: everybody who has a profile in this database. */
	const [profiles, setProfiles] = useState<User[]>([]);
	const [spaces, setSpaces] = useState<Space[]>([]);
	const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(storedSpaceId);
	const [amountsHidden, setAmountsHidden] = useState(false);

	const startLocalSession = useCallback(async (database: Driver, userId: string) => {
		const opened = await openSession({ driver: database, userId, deviceId: deviceId() });
		const [me, list, everybody] = await Promise.all([
			opened.users.me(),
			opened.spaces.list(),
			listProfiles(database),
		]);
		setSession(asCofreSession(opened));
		setLinkInvitations(null);
		setUser(me);
		setSpaces(list);
		setProfiles(everybody);
		setStatus("ready");

		// The database looks after itself, after the screen is up and while nobody is
		// waiting for anything. It folds at most once a day and it is not worth a
		// message: no record changes, no amount moves, and a failure here is a database
		// that is merely larger than it needs to be.
		tidyLater(database);
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

	/**
	 * Everything this browser holds, gone: the database file, the profile, the mode and
	 * whatever the screens remembered along the way. The page reloads afterwards because
	 * what is in memory is a session over a file that no longer exists, and because
	 * landing on onboarding is the honest picture of what is left.
	 */
	const eraseDevice = useCallback(async () => {
		const database = await connect();
		await database.wipe();
		forgetProfile();
		forgetMode();
		try {
			// The keys the screens keep: the chosen space, the import memory, the
			// destinations, the theme. Nothing here is money, and all of it is about the
			// data that just went.
			for (const key of Object.keys(localStorage)) {
				if (key.startsWith("cofre")) localStorage.removeItem(key);
			}
		} catch {
			// A browser that refuses storage had nothing to forget.
		}
		window.location.reload();
	}, []);

	/**
	 * Another profile on this same device, in browser mode.
	 *
	 * One machine at home and two people is the ordinary case, and until now the only
	 * way to be the other one was to forget the profile and make a new one, which left
	 * the first one in the database with no way back to it. Nothing is created here and
	 * nothing is thrown away: the database is the same, and which person is reading it
	 * is what changes. The space is forgotten with it, because the spaces of one person
	 * are not the spaces of the other.
	 */
	const switchProfile = useCallback(
		async (userId: string) => {
			if (!driver) return;
			setStatus("opening");
			forgetProfile();
			rememberUser(userId);
			setCurrentSpaceId(null);
			await startLocalSession(driver, userId);
		},
		[driver, startLocalSession],
	);

	/** Somebody else on this device, who does not have a profile here yet. */
	const addProfile = useCallback(() => {
		forgetProfile();
		setSession(null);
		setUser(null);
		setSpaces([]);
		setCurrentSpaceId(null);
		setStatus("needsProfile");
	}, []);

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
			profiles,
			spaces,
			currentSpace,
			amountsHidden,
			setAmountsHidden,
			selectSpace,
			chooseMode,
			adoptUser,
			adoptServerSession,
			signOut,
			switchProfile,
			addProfile,
			reload,
			eraseDevice,
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
			profiles,
			spaces,
			currentSpace,
			amountsHidden,
			selectSpace,
			chooseMode,
			adoptUser,
			adoptServerSession,
			signOut,
			switchProfile,
			addProfile,
			reload,
			eraseDevice,
		],
	);

	return <CofreContext.Provider value={value}>{children}</CofreContext.Provider>;
}

export function useCofre(): CofreValue {
	const value = useContext(CofreContext);
	if (!value) throw new Error("useCofre was called outside of the provider");
	return value;
}
