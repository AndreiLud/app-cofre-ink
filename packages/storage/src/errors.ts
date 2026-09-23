// Errors that reach a screen. Each one says what happened, and the interface turns it
// into a sentence that also says what to do about it.

export class PermissionError extends Error {
	readonly permission: string;
	readonly spaceId: string;

	constructor(permission: string, spaceId: string) {
		super(`not allowed to ${permission} in the space ${spaceId}`);
		this.name = "PermissionError";
		this.permission = permission;
		this.spaceId = spaceId;
	}
}

export class NotFoundError extends Error {
	readonly entity: string;
	readonly id: string;

	constructor(entity: string, id: string) {
		super(`there is no ${entity} with the identifier ${id} in reach`);
		this.name = "NotFoundError";
		this.entity = entity;
		this.id = id;
	}
}

export class RuleError extends Error {
	readonly rule: string;

	constructor(rule: string, message: string) {
		super(message);
		this.name = "RuleError";
		this.rule = rule;
	}
}
