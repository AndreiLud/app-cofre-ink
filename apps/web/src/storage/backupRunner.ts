// When the copy is allowed to be brought up to date.
//
// What a pass does lives in the storage package, because it is about data. Which place
// the settings point at lives next door, because that one reaches for the cloud package.
// What is left here is the part that is about somebody's attention, and it imports
// nothing: a person typing a record touches the database several times in a second, and
// a copy that answered every one of those would be a copy that spends its life
// uploading.

/**
 * Waits for the writing to stop before doing anything. The clock restarts on every
 * change and the run happens once it goes quiet.
 */
export function afterTheTyping(
	wait: number,
	run: () => void,
): { poke: () => void; stop: () => void } {
	let timer: ReturnType<typeof setTimeout> | null = null;

	return {
		poke() {
			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				run();
			}, wait);
		},
		stop() {
			if (timer !== null) clearTimeout(timer);
			timer = null;
		},
	};
}
