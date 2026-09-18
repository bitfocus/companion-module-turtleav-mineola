import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModuleInstance from '../main.js'
import { informationStatus2x2, inputStatus2x2, outputStatus2x2, presetStatus, response } from './fixtures.js'

// Enough of InstanceBase to construct the module without a Companion host, and quiet loggers
vi.mock('@companion-module/base', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@companion-module/base')>()
	class InstanceBase {
		constructor(_internal: unknown) {}
		log(): void {}
		updateStatus(): void {}
		checkAllFeedbacks(): void {}
		checkFeedbacksById(): void {}
	}
	const quiet = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
	return { ...actual, InstanceBase, createModuleLogger: () => quiet }
})

// No real sockets in unit tests: a WebSocket that never connects
vi.mock('ws', () => ({
	WebSocket: class {
		static readonly CONNECTING = 0
		static readonly OPEN = 1
		readyState = 0
		addEventListener(): void {}
		removeAllListeners(): void {}
		terminate(): void {}
	},
}))

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

describe('initial connection retry', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	/** An instance whose device is offline until `device.online` is set; attempts() counts connection attempts. */
	function setup() {
		const instance = new ModuleInstance({})
		const device = { online: false }
		const payloads: Record<string, () => object> = {
			get_input_status: inputStatus2x2,
			get_output_status: outputStatus2x2,
			get_preset_status: presetStatus,
			get_information_status: informationStatus2x2,
		}
		const httpPost = vi.spyOn(instance, 'httpPost').mockImplementation(async (msg) => {
			if (!device.online) throw new Error('device offline')
			return response(payloads[msg.comhead]())
		})
		const updateAllDefs = vi.spyOn(instance, 'updateAllDefs').mockImplementation(() => {})
		// #setupDevice sends one get_information_status per attempt
		const attempts = () => httpPost.mock.calls.filter(([msg]) => msg.comhead === 'get_information_status').length
		return { instance, device, attempts, updateAllDefs }
	}

	it('connects on the first attempt when the device answers', async () => {
		const { instance, device, attempts, updateAllDefs } = setup()
		device.online = true
		await instance.configUpdated({ host: '10.0.0.9', verbose: false })
		await vi.advanceTimersByTimeAsync(0)

		expect(attempts()).toBe(1)
		expect(updateAllDefs).toHaveBeenCalledTimes(1)
		await instance.destroy()
	})

	it('retries with a doubling backoff until the device answers, then stops', async () => {
		const { instance, device, attempts, updateAllDefs } = setup()
		await instance.configUpdated({ host: '10.0.0.9', verbose: false })
		await vi.advanceTimersByTimeAsync(0)
		expect(attempts()).toBe(1)

		await vi.advanceTimersByTimeAsync(1000)
		expect(attempts()).toBe(2)

		// The second wait is 2s
		await vi.advanceTimersByTimeAsync(1999)
		expect(attempts()).toBe(2)

		device.online = true
		await vi.advanceTimersByTimeAsync(1)
		expect(attempts()).toBe(3)
		expect(updateAllDefs).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(120_000)
		expect(attempts()).toBe(3)
		await instance.destroy()
	})

	it('caps the backoff at 30s', async () => {
		const { instance, attempts } = setup()
		await instance.configUpdated({ host: '10.0.0.9', verbose: false })

		// Attempts at 0, 1, 3, 7, 15, 31s, then every 30s: 61, 91
		await vi.advanceTimersByTimeAsync(90_999)
		expect(attempts()).toBe(7)
		await vi.advanceTimersByTimeAsync(1)
		expect(attempts()).toBe(8)
		await instance.destroy()
	})

	it('stops the previous loop when the config changes', async () => {
		const { instance, attempts } = setup()
		await instance.configUpdated({ host: '10.0.0.1', verbose: false })
		await vi.advanceTimersByTimeAsync(0)
		await instance.configUpdated({ host: '10.0.0.2', verbose: false })
		await vi.advanceTimersByTimeAsync(0)
		expect(attempts()).toBe(2)

		// Both loops would retry at 1s; only the new config's should
		await vi.advanceTimersByTimeAsync(1000)
		expect(attempts()).toBe(3)
		await instance.destroy()
	})

	it('stops retrying on destroy', async () => {
		const { instance, device, attempts, updateAllDefs } = setup()
		await instance.configUpdated({ host: '10.0.0.9', verbose: false })
		await vi.advanceTimersByTimeAsync(0)
		await instance.destroy()

		device.online = true
		await vi.advanceTimersByTimeAsync(60_000)
		expect(attempts()).toBe(1)
		expect(updateAllDefs).not.toHaveBeenCalled()
	})

	it('does not try to connect without a host', async () => {
		const { instance, attempts } = setup()
		await instance.configUpdated({ host: '', verbose: false })
		await vi.advanceTimersByTimeAsync(60_000)

		expect(attempts()).toBe(0)
		await instance.destroy()
	})
})
