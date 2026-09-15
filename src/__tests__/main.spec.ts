import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModuleInstance from '../main.js'

// Enough of InstanceBase to construct the module without a Companion host
vi.mock('@companion-module/base', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@companion-module/base')>()
	class InstanceBase {
		constructor(_internal: unknown) {}
		log(): void {}
		updateStatus(): void {}
		checkAllFeedbacks(): void {}
		checkFeedbacksById(): void {}
	}
	return { ...actual, InstanceBase }
})

describe('throttled definition rebuild', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	/**
	 * configUpdated aborts and replaces the instance AbortController — init calls it too, so this happens on every
	 * startup. An es-toolkit throttle given that first controller's signal silently drops any call made within its
	 * window once the signal has aborted, with no trailing call, so a rebuild requested after a rename never ran.
	 */
	it('still runs after a config update has replaced the abort controller', async () => {
		const instance = new ModuleInstance({})
		const updateAllDefs = vi.spyOn(instance, 'updateAllDefs').mockImplementation(() => {})
		await instance.configUpdated({ host: '', verbose: false })

		instance.throttledUpdateActionFeedbackDefs()
		await vi.advanceTimersByTimeAsync(10_000)

		expect(updateAllDefs).toHaveBeenCalledTimes(1)
		await instance.destroy()
	})

	it('coalesces a burst of requests into one rebuild', async () => {
		const instance = new ModuleInstance({})
		const updateAllDefs = vi.spyOn(instance, 'updateAllDefs').mockImplementation(() => {})
		await instance.configUpdated({ host: '', verbose: false })

		instance.throttledUpdateActionFeedbackDefs()
		instance.throttledUpdateActionFeedbackDefs()
		instance.throttledUpdateActionFeedbackDefs()
		await vi.advanceTimersByTimeAsync(10_000)

		expect(updateAllDefs).toHaveBeenCalledTimes(1)
		await instance.destroy()
	})

	it('is cancelled by destroy', async () => {
		const instance = new ModuleInstance({})
		const updateAllDefs = vi.spyOn(instance, 'updateAllDefs').mockImplementation(() => {})
		await instance.configUpdated({ host: '', verbose: false })

		instance.throttledUpdateActionFeedbackDefs()
		await instance.destroy()
		await vi.advanceTimersByTimeAsync(10_000)

		expect(updateAllDefs).not.toHaveBeenCalled()
	})
})
