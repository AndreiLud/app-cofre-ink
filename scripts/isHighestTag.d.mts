// The types of isHighestTag.mjs, for the test that imports it.

export function versionOf(tag: string): [number, number, number] | null;
export function isHighest(tag: string, tags: string[]): boolean;
