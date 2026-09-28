// Holds the one connection to the data, the session of the person using it, and the
// space they are looking at. It is also the only place that knows whether the data
// lives in this browser or on a server, which is why no screen has to.

import type { Driver, Space, User } from "@cofre/storage";
import { findUserById, openSession, tidyEverySpace } from "@cofre/storage";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import i18n from "../i18n/index.ts";
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
import { startLocalProfile } from "./startProfile.ts";
import { type BrowserDatabase, openBrowserDatabase } from "./workerDriver.ts";

export type CofreStatus =
	| "opening"
	| "needsMode"
	| "needsSignIn"
	| "ready"
	/** The database file is held by another tab, which takes it exclusively. */
	| "busy"
	| "failed";

export type CofreValue = {
	status: CofreStatus;
	/**
	 * What went wrong, as it was thrown.
	 *
	 * Kept whole rather than flattened to its message, because the message is the
	 * sentence the engine wrote for whoever wrote it and it was going onto the screen.
	 * The screens turn it into words themselves, through the one translator.
	 */
	error: unknown;
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
	/**
	 * Browser mode with nothing asked: the database opens and `setUp` makes the person
	 * and their space, with whatever defaults the screen decided on.
	 */
	startHere: (setUp: (driver: Driver) => Promise<User>) => Promise<void>;
	/** Called after a profile is created behind the front door, in browser mode. */
	adoptUser: (user: User) => Promise<void>;
	/** Called after signing in or signing up, in server mode. */
	adoptServerSession: () => Promise<void>;
	signOut: () => Promise<void>;
	/** Back to the first question, from any screen that can be reached by accident. */
	chooseAgain: () => void;
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
	const [error, setError] = useState<unknown>(null);
	const [mode, setMode] = useState<StorageMode | null>(storedMode);
	const [server, setServer] = useState<string | null>(storedServer);
	const [persistent, setPersistent] = useState(true);
	const [driver, setDriver] = useState<Driver | null>(null);
	const [client, setClient] = useState<ServerClient | null>(null);
	const [session, setSession] = useState<CofreSession | null>(null);
	const [linkInvitations, setLinkInvitations] = useState<RemoteInvitations | null>(null);
	const [user, setUser] = useState<User | null>(null);
	/** Browser mode only: everybody who has a profile in this database. */
	const [spaces, setSpaces] = useState<Space[]>([]);
	const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(storedSpaceId);
	const [amountsHidden, setAmountsHidden] = useState(false);

	const startLocalSession = useCallback(async (database: Driver, userId: string) => {
		const opened = await openSession({ driver: database, userId, deviceId: deviceId() });
		const [me, list] = await Promise.all([opened.users.me(), opened.spaces.list()]);
		setSession(asCofreSession(opened));
		setLinkInvitations(null);
		setUser(me);
		setSpaces(list);
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
		// The browser can throw the database away and keep the identifier. That is not a
		// failure, it is somebody starting over.
		const profile = userId === null ? null : await findUserById(database.driver, userId);

		if (!profile) {
			// Nothing is asked here. The door already asked the one question that cannot
			// be changed later, and everything else it would have wanted, a name, a
			// currency, what the space is called, is corrected from inside in one screen.
			forgetProfile();
			const made = await startLocalProfile(database.driver, {
				name: i18n.t("mode.defaultName"),
				spaceName: i18n.t("onboarding.personalDefault"),
				language: i18n.resolvedLanguage === "en" ? "en" : "pt",
			});
			rememberUser(made.id);
			await startLocalSession(database.driver, made.id);
			return;
		}

		await startLocalSession(database.driver, profile.id);
	}, [startLocalSession]);

	const openServerMode = useCallback(
		async (address: string) => {
			const connected = createServerClient(address);
			setClient(connected);
			setPersistent(true);
			try {
				await startRemoteSession(address);
			} catch {
				// Not signed in yet, the session expired, the address is wrong, or the
				// machine at home is switched off. All of them mean one thing here: there
				// is no session with that server, and the screen that can do something
				// about it is the sign in, which says what went wrong when it tries and
				// offers to keep the data on this device instead.
				//
				// This used to tell the difference and send everything that was not a
				// refusal to the failure screen, which is a dead end with no button on
				// it. A server being off is not a reason to be unable to open your own
				// application.
				setStatus("needsSignIn");
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
				setError(problem);
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
					// The database of this browser is not this mode's database, and what
					// runs the automatic backup only asks whether there is one. Left in
					// place, it kept running the local file against the identifiers of the
					// server's spaces until the page happened to be reloaded.
					setDriver(null);
					setServer(address);
					await openServerMode(address);
				} else {
					await openBrowserMode();
				}
			} catch (problem) {
				setError(problem);
				setStatus("failed");
			}
		},
		[openBrowserMode, openServerMode],
	);

	/**
	 * The front door of somebody who chose to keep everything here.
	 *
	 * Nothing is asked. A form standing between a stranger and the thing they came to
	 * look at is a form most of them close, and every answer on it (their name, the
	 * currency, what the space is called) can be corrected later from inside. What
	 * cannot be undone is losing them at the door.
	 *
	 * And this door is walked twice. Somebody who presses "change where the data lives"
	 * comes back to it with a database already on this machine and a person already in
	 * it, so the person is picked up rather than made again. Making a new one left their
	 * spaces sitting in the file with no screen that reached them, which is what losing
	 * somebody at the door looks like from the inside.
	 */
	const startHere = useCallback(
		async (setUp: (database: Driver) => Promise<User>) => {
			rememberMode("browser");
			setMode("browser");
			setStatus("opening");
			setError(null);
			try {
				const database = await connect();
				setDriver(database.driver);
				setPersistent(database.outcome === "persistent");
				if (database.outcome === "busy") {
					setStatus("busy");
					return;
				}

				const known = storedUserId();
				const already = known === null ? null : await findUserById(database.driver, known);
				if (already) {
					await startLocalSession(database.driver, already.id);
					return;
				}

				const person = await setUp(database.driver);
				rememberUser(person.id);
				await startLocalSession(database.driver, person.id);
			} catch (problem) {
				setError(problem);
				setStatus("failed");
			}
		},
		[startLocalSession],
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
	 * landing back on the front door is the honest picture of what is left.
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
	 * Back to the first question, from wherever things went wrong.
	 *
	 * Every screen that can be reached by accident needs one of these. Without it a
	 * person whose server moved, or whose browser refused to store anything, is looking
	 * at a paragraph with no button under it.
	 */
	const chooseAgain = useCallback(() => {
		forgetMode();
		setSession(null);
		setClient(null);
		setUser(null);
		setSpaces([]);
		setMode(null);
		setServer(null);
		setError(null);
		// Nothing is holding this open any more, and leaving it set kept the automatic
		// backup running against a session that has been put down.
		setDriver(null);
		setStatus("needsMode");
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
			spaces,
			currentSpace,
			amountsHidden,
			setAmountsHidden,
			selectSpace,
			chooseMode,
			startHere,
			adoptUser,
			adoptServerSession,
			signOut,
			chooseAgain,
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
			spaces,
			currentSpace,
			amountsHidden,
			selectSpace,
			chooseMode,
			startHere,
			adoptUser,
			adoptServerSession,
			signOut,
			chooseAgain,
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
