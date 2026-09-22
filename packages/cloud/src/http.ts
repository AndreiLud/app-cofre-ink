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
