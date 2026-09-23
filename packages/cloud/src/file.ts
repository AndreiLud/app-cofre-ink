// A file the person moves themselves.
//
// This is the destination that always works. No token, no address, nothing to allow in
// a browser, nothing that can be switched off by somebody else: the file goes to the
// downloads folder, and the folder it ends up in is whatever the person already syncs,
// whether that is a drive, a network share or something they carry in a pocket.
//
// It is also the destination everything else is measured against. When a drive refuses
// to talk to a browser, this is still there.

import type { StoredBundle, SyncBundle, SyncStore } from "@cofre/storage";

export type FileStoreOptions = {
	name?: string;
	/** The file the person picked, when they picked one. */
	read: () => Promise<StoredBundle>;
	/** Hands the merged file back to them. */
	write: (bundle: SyncBundle) => Promise<void> | void;
};

export function createFileStore(options: FileStoreOptions): SyncStore {
	return {
		name: options.name ?? "arquivo",
		read: () => options.read(),
		async write(_spaceId, bundle) {
			await options.write(bundle);
			// A file that was handed to a person has no version to come back to. The next
			// exchange reads whatever they give it, and the union is taken again.
			return { revision: null };
		},
	};
}

export { bundleFileName } from "./pack.ts";
