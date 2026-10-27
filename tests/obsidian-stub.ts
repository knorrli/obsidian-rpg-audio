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

export function normalizePath(path: string): string {
	return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

/** Runs immediately: tests call the debounced function and check its effect synchronously. */
export function debounce<T extends unknown[]>(fn: (...args: T) => unknown) {
	const debounced = (...args: T) => {
		fn(...args);
		return debounced;
	};
	debounced.cancel = () => debounced;
	debounced.run = () => undefined;
	return debounced;
}
