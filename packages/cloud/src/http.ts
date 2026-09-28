// One way of calling somebody else's API.
//
// Every destination in this package talks over the same fetch, so the tests hand it a
// fake one and nothing else has to know. What matters here is that a failure carries
// the status and the body, because "could not sync" with no reason is the least useful
// thing an application can say.

export class CloudError extends Error {
	/** What the other side answered, or zero when it did not answer at all. */
	readonly status: number;
	readonly body: string;
	/** The name of the place, so the interface can put it in a sentence. */
	readonly where: string;

	constructor(where: string, status: number, body: string) {
		super(status === 0 ? `${where} did not answer` : `${where} answered ${status}`);
		this.name = "CloudError";
		this.status = status;
		this.where = where;
		this.body = body.slice(0, 500);
	}
}

/** The fetch a store uses, which the tests replace. */
export type Fetcher = typeof globalThis.fetch;

/**
 * A name with dots in it and nothing else: what somebody copies out of a service.
 *
 * Deliberately narrow. A path, a relative one, a scheme of its own and anything with a
 * space in it all fail this and are refused rather than guessed at, because guessing wrong
 * here means sending a password somewhere it was not meant to go.
 */
function looksLikeAHost(first: string): boolean {
	return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?$/i.test(first);
}

/**
 * The address of a destination has to be somewhere else.
 *
 * A blank one, or a path with no host on it, is resolved by fetch against whatever
 * address this application is being served from, and every call in this package carries a
 * credential: a Basic header built from an application password, or a database token as a
 * Bearer. So an empty field does not mean "ask the page we are on", it means the caller
 * has nothing to talk to, and sending somebody's password to whoever serves the page is
 * not a thing to do on the way to finding that out.
 */
export function addressOfAPlace(url: string, where: string): string {
	let trimmed = url.trim().replace(/\/+$/, "");

	// Two shapes a person is handed by the service itself and pastes in whole. Turso shows
	// a database as libsql://name.turso.io, which is the same host over https, and a host
	// on its own is what the hint beside the field asks for. Refusing either of them is
	// refusing the address the service gave them, which is not a thing they can be
	// expected to work out from a sentence about not reaching the destination.
	if (/^libsql:\/\//i.test(trimmed)) {
		trimmed = `https://${trimmed.slice("libsql://".length)}`;
	} else if (looksLikeAHost(trimmed.split("/")[0] ?? "")) {
		trimmed = `https://${trimmed}`;
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new CloudError(where, 0, `"${url}" is not the address of anything`);
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new CloudError(where, 0, `"${url}" is not an address this can reach`);
	}
	if (parsed.hostname === "") {
		throw new CloudError(where, 0, `"${url}" names no host`);
	}
	return trimmed;
}

/**
 * The same question, asked before anything is armed rather than when it fails.
 *
 * A screen that knows an address cannot be turned into a request can say so while the
 * person is looking at the field, instead of switching a backup on that dies on its first
 * pass. Same rule, one place, so the two answers cannot drift apart.
 */
export function looksReachable(url: string): boolean {
	try {
		addressOfAPlace(url, "");
		return true;
	} catch {
		return false;
	}
}

export type CallOptions = {
	method?: string;
	headers?: Record<string, string>;
	/**
	 * Text or bytes. Bytes are what every file this package writes is, and the type the
	 * browser declares for a body is narrower than the one it accepts.
	 */
	body?: BodyInit | Uint8Array | null;
	fetcher?: Fetcher;
	/** The name of the place, for the message when it goes wrong. */
	where: string;
	/** Statuses that are an answer rather than a failure, such as a file that is gone. */
	allow?: number[];
};

export async function call(url: string, options: CallOptions): Promise<Response> {
	const fetcher = options.fetcher ?? globalThis.fetch;

	let response: Response;
	try {
		response = await fetcher(url, {
			method: options.method ?? "GET",
			headers: options.headers,
			body: (options.body ?? undefined) as BodyInit | undefined,
		});
	} catch (reason) {
		// No answer at all: no connection, a name that does not resolve, a certificate
		// the browser refused, a server that is not there, or a browser refusing the
		// call for its own reasons. From here they are one thing, and the raw message a
		// browser gives for it is "Failed to fetch", which helps nobody.
		throw new CloudError(options.where, 0, reason instanceof Error ? reason.message : "");
	}

	if (response.ok || (options.allow ?? []).includes(response.status)) return response;

	const text = await response.text().catch(() => "");
	throw new CloudError(options.where, response.status, text);
}

export async function callJson<T>(url: string, options: CallOptions): Promise<T> {
	const response = await call(url, options);
	const text = await response.text();
	return (text === "" ? {} : JSON.parse(text)) as T;
}
