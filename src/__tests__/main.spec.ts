import { InstanceStatus } from '@companion-module/base'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { CanceledError, type AxiosInstance } from 'axios'
import ModuleInstance from '../main.js'
import type { HttpMessage } from '../types.js'
import { informationStatus2x2, inputStatus2x2, outputStatus2x2, presetStatus, response } from './fixtures.js'

const logger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

// Enough of InstanceBase to construct the module without a Companion host, and loggers that record rather than print
vi.mock('@companion-module/base', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@companion-module/base')>()
	class InstanceBase {
		constructor(_internal: unknown) {}
		log(): void {}
		updateStatus(): void {}
		checkAllFeedbacks(): void {}
		checkFeedbacksById(): void {}
	}
	return { ...actual, InstanceBase, createModuleLogger: () => logger }
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

describe('polling torn down by a config change or destroy', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()
	})
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	/**
	 * Drives the real httpPost, queue and #cleanup, faking only the axios client. The device answers the initial
	 * connection, then holds every request until its signal aborts, as a slow device would. Two action requests are
	 * sent just before polling starts, so the IO poll's two requests take the queue's other two slots and the preset
	 * and information polls (priority 0) wait behind them: teardown aborts the first kind and clear() rejects the
	 * second.
	 */
	async function connectMidPoll() {
		const instance = new ModuleInstance({})
		const device = { answering: true }
		const payloads: Record<string, () => object> = {
			get_input_status: inputStatus2x2,
			get_output_status: outputStatus2x2,
			get_preset_status: presetStatus,
			get_information_status: informationStatus2x2,
		}
		const post = vi.fn(async (_url: string, data: HttpMessage, { signal }: { signal: AbortSignal }) => {
			if (device.answering) return response(payloads[data.comhead]())
			return await new Promise<never>((_resolve, reject) => {
				signal.addEventListener('abort', () => reject(new CanceledError()), { once: true })
			})
		})
		vi.spyOn(axios, 'create').mockReturnValue({ post } as unknown as AxiosInstance)
		vi.spyOn(instance, 'updateAllDefs').mockImplementation(() => {
			device.answering = false
			for (let i = 0; i < 2; i++) instance.httpPost({ comhead: 'get_dsp_status' }).catch(() => {})
		})
		const httpPost = vi.spyOn(instance, 'httpPost')
		instance.feedbackSubscriptions.inputs.add('fb-inputs')
		instance.feedbackSubscriptions.outputs.add('fb-outputs')
		instance.feedbackSubscriptions.presets.add('fb-presets')
		instance.feedbackSubscriptions.information.add('fb-info')

		await instance.configUpdated({ host: '10.0.0.9', verbose: false })
		await vi.advanceTimersByTimeAsync(0)
		// 4 to connect, 2 actions, then 4 polling: 2 running, 2 waiting
		expect(post).toHaveBeenCalledTimes(8)
		expect(httpPost).toHaveBeenCalledTimes(10)
		const updateStatus = vi.spyOn(instance.statusManager, 'updateStatus')
		return { instance, httpPost, updateStatus }
	}

	it('logs nothing and leaves the status alone when the config changes', async () => {
		const { instance, updateStatus } = await connectMidPoll()

		await instance.configUpdated({ host: '', verbose: false })
		await vi.advanceTimersByTimeAsync(0)

		expect(logger.error).not.toHaveBeenCalled()
		expect(logger.warn).not.toHaveBeenCalled()
		expect(updateStatus.mock.calls.map(([status]) => status)).toEqual([InstanceStatus.BadConfig])
		await instance.destroy()
	})

	it('stops polling on destroy', async () => {
		const { instance, httpPost } = await connectMidPoll()

		await instance.destroy()
		await vi.advanceTimersByTimeAsync(60_000)

		expect(httpPost).toHaveBeenCalledTimes(10)
		expect(logger.error).not.toHaveBeenCalled()
	})
})
