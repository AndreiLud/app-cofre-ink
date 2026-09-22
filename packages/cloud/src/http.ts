// One way of calling somebody else's API.
//
// Every destination in this package talks over the same fetch, so the tests hand it a
// fake one and nothing else has to know. What matters here is that a failure carries
// the status and the body, because "could not sync" with no reason is the least useful
// thing an application can say.

export class CloudError extends Error {
	readonly status: number;
	readonly body: string;

	constructor(where: string, status: number, body: string) {
		super(`${where} answered ${status}`);
		this.name = "CloudError";
		this.status = status;
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
	const response = await fetcher(url, {
		method: options.method ?? "GET",
		headers: options.headers,
		body: (options.body ?? undefined) as BodyInit | undefined,
	});

	if (response.ok || (options.allow ?? []).includes(response.status)) return response;

	const text = await response.text().catch(() => "");
	throw new CloudError(options.where, response.status, text);
}

export async function callJson<T>(url: string, options: CallOptions): Promise<T> {
	const response = await call(url, options);
	const text = await response.text();
	return (text === "" ? {} : JSON.parse(text)) as T;
}
