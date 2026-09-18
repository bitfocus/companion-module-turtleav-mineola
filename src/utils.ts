import type { DropdownChoice } from '@companion-module/base'

export function getDropdownChoices<T extends readonly string[]>(items: T): DropdownChoice<number>[] {
	return items.map((item, index) => ({
		id: index,
		label: item,
	}))
}

/**
 * Resolves after `ms`, or as soon as `signal` aborts, whichever is first. Never rejects: callers check
 * `signal.aborted` afterwards. Built on the global setTimeout rather than node:timers/promises so that
 * vitest's fake timers can drive it.
 */
export async function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const done = (): void => {
			clearTimeout(timer)
			signal.removeEventListener('abort', done)
			resolve()
		}
		const timer: NodeJS.Timeout = setTimeout(done, ms)
		signal.addEventListener('abort', done, { once: true })
	})
}
