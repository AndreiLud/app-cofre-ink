// Getting a token without a secret.
//
// Every one of these services wants an application to identify itself, and the usual
// way of doing that puts a secret in the code. This project cannot have one: anybody
// can clone it, and a secret that ships in a repository is not a secret.
//
// So the flow here is the one designed for exactly this situation. The browser makes a
// random number, keeps it, and sends only its hash to the service. The service sends
// back a code, and the code is worth nothing without the number that never left this
// device. The application identifier is not a secret and is the owner's own, made in
// their own account, which is what keeps this project out of the middle.

export type OAuthService = "googleDrive" | "googleSheets" | "dropbox";

export type OAuthSetup = {
	service: OAuthService;
	/** The identifier of the application the owner made in their own account. */
	clientId: string;
	/** Where the service sends the person back, which they registered with it. */
	redirectUri: string;
};

export type OAuthStart = {
	url: string;
	/** Kept until the person comes back, and never sent anywhere. */
	verifier: string;
	state: string;
};

const AUTHORISE: Record<OAuthService, string> = {
	googleDrive: "https://accounts.google.com/o/oauth2/v2/auth",
	googleSheets: "https://accounts.google.com/o/oauth2/v2/auth",
	dropbox: "https://www.dropbox.com/oauth2/authorize",
};

const TOKEN: Record<OAuthService, string> = {
	googleDrive: "https://oauth2.googleapis.com/token",
	googleSheets: "https://oauth2.googleapis.com/token",
	dropbox: "https://api.dropboxapi.com/oauth2/token",
};

const SCOPES: Record<OAuthService, string> = {
	// The corner of the drive that belongs to this application, and nothing else in it.
	googleDrive: "https://www.googleapis.com/auth/drive.appdata",
	googleSheets: "https://www.googleapis.com/auth/spreadsheets",
	dropbox: "files.content.write files.content.read account_info.read",
};

function randomText(length = 64): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return [...bytes]
		.map((byte) => "abcdefghijklmnopqrstuvwxyz0123456789"[byte % 36])
		.join("")
		.slice(0, length);
}

function base64Url(bytes: ArrayBuffer): string {
	const binary = String.fromCharCode(...new Uint8Array(bytes));
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function challengeOf(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return base64Url(digest);
}

/** The address to send the person to, and the number to keep while they are away. */
export async function startOAuth(setup: OAuthSetup): Promise<OAuthStart> {
	const verifier = randomText();
	const state = randomText(24);

	const query = new URLSearchParams({
		client_id: setup.clientId,
		redirect_uri: setup.redirectUri,
		response_type: "code",
		scope: SCOPES[setup.service],
		code_challenge: await challengeOf(verifier),
		code_challenge_method: "S256",
		state,
	});

	// Google hands back a token that expires in an hour and, with these two, one that
	// can ask for another without sending the person back.
	if (setup.service !== "dropbox") {
		query.set("access_type", "offline");
		query.set("prompt", "consent");
	} else {
		query.set("token_access_type", "offline");
	}

	return { url: `${AUTHORISE[setup.service]}?${query.toString()}`, verifier, state };
}

export type OAuthToken = {
	token: string;
	/** Given by the services that allow asking for a new token later. */
	refreshToken: string | null;
	/** Milliseconds, when the service said. */
	expiresAt: number | null;
};

type TokenAnswer = {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
};

async function askForToken(
	setup: OAuthSetup,
	body: URLSearchParams,
	fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<OAuthToken> {
	const response = await fetcher(TOKEN[setup.service], {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});

	const answer = (await response.json()) as TokenAnswer;
	if (!response.ok || !answer.access_token) {
		throw new Error(answer.error_description ?? answer.error ?? "the service refused the code");
	}

	return {
		token: answer.access_token,
		refreshToken: answer.refresh_token ?? null,
		expiresAt: answer.expires_in ? Date.now() + answer.expires_in * 1000 : null,
	};
}

/** Turns the code the person came back with into a token. */
export function finishOAuth(
	setup: OAuthSetup,
	input: { code: string; verifier: string },
	fetcher?: typeof globalThis.fetch,
): Promise<OAuthToken> {
	return askForToken(
		setup,
		new URLSearchParams({
			client_id: setup.clientId,
			redirect_uri: setup.redirectUri,
			grant_type: "authorization_code",
			code: input.code,
			code_verifier: input.verifier,
		}),
		fetcher,
	);
}

/** A new token, without sending the person anywhere, while the old one still allows it. */
export function refreshOAuth(
	setup: OAuthSetup,
	refreshToken: string,
	fetcher?: typeof globalThis.fetch,
): Promise<OAuthToken> {
	return askForToken(
		setup,
		new URLSearchParams({
			client_id: setup.clientId,
			grant_type: "refresh_token",
			refresh_token: refreshToken,
		}),
		fetcher,
	);
}
