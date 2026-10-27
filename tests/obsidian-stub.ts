type Callback = (...data: unknown[]) => unknown;

export class Events {
	private handlers = new Map<string, Callback[]>();

	on(name: string, callback: Callback): {name: string; callback: Callback} {
		this.handlers.set(name, [...(this.handlers.get(name) ?? []), callback]);
		return {name, callback};
	}

	off(name: string, callback: Callback): void {
		this.handlers.set(name, (this.handlers.get(name) ?? []).filter(h => h !== callback));
	}

	trigger(name: string, ...data: unknown[]): void {
		for (const handler of this.handlers.get(name) ?? []) handler(...data);
	}
}
