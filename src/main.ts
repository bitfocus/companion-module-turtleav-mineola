import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionSchema } from './actions.js'
import { handleError } from './errors.js'
import { UpdateFeedbacks, type FeedbackSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { StatusManager } from './status.js'
import { Mineola, type MineolaStateEvent } from './mineola.js'
import type { HttpMessage } from './types.js'
import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { WebSocket } from 'ws'
import PQueue from 'p-queue'
import { throttle } from 'es-toolkit'
import { abortableDelay } from './utils.js'

const POLL_INTERVALS = {
	IO: 250,
	PRESET: 5000,
	INFORMATION: 30000,
} as const

const HTTP_TIMEOUT = 1000
const HTTP_HEADERS = { 'Content-Type': 'application/json' } as const
const WEBSOCKET_PORT = 41230
/** Initial connection retries: doubling from INITIAL, capped at MAX (ms) */
const RETRY_BACKOFF = { INITIAL: 1000, MAX: 30000 } as const

type FeedbackCategory = MineolaStateEvent

export type ModuleTypes = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionSchema
	feedbacks: FeedbackSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleTypes> {
	#config!: ModuleConfig // Setup in init()
	#client!: AxiosInstance
	#socket!: WebSocket
	#queue = new PQueue({ concurrency: 4 })
	#controller = new AbortController()
	public mineola!: Mineola
	public statusManager = new StatusManager(this, { status: InstanceStatus.Connecting, message: 'Initialising' }, 2000)
	public feedbackSubscriptions: Record<FeedbackCategory, Set<string>> = {
		inputs: new Set<string>(),
		outputs: new Set<string>(),
		presets: new Set<string>(),
		information: new Set<string>(),
		power: new Set<string>(),
		outputMaster: new Set<string>(),
		levels: new Set<string>(),
	}
	#feedbackIdsToCheck = new Set<string>()
	#pollTimers = {
		io: undefined as NodeJS.Timeout | undefined,
		preset: undefined as NodeJS.Timeout | undefined,
		information: undefined as NodeJS.Timeout | undefined,
	}

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.#config = config
		this.statusManager.updateStatus(InstanceStatus.Connecting)
		await this.configUpdated(config)
	}

	async destroy(): Promise<void> {
		this.log('debug', `destroy ${this.id}: ${this.label}`)
		this.#cleanup()
	}

	#cleanup(): void {
		this.#queue.clear()
		this.#controller.abort()
		// Cancelled explicitly rather than given the controller's signal: the controller is replaced on every config
		// update, and an es-toolkit throttle whose signal has aborted silently drops calls made within its window
		this.throttledCheckFeedbacksById.cancel()
		this.throttledUpdateActionFeedbackDefs.cancel()
		this.#throttledWebSocketReconnect.cancel()
		this.#closeWebSocketConnection()
		Object.values(this.#pollTimers).forEach((timer) => {
			if (timer) clearTimeout(timer)
		})
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.#config = config
		this.debug('Config Updated')
		this.debug(config)

		// Cleanup old connections
		this.#cleanup()
		this.#controller = new AbortController()
		// Not awaited: init awaits configUpdated, and must not wait on a device that may be offline
		void this.#connectWithRetry(config.host, this.#controller.signal)
	}

	/**
	 * Connects, retrying with backoff until it succeeds or `signal` aborts. `signal` is the controller of the config
	 * this loop was started for, captured rather than re-read: a config update or destroy aborts it, and the new config
	 * runs its own loop, so this one must stop rather than reconnect to a host that is no longer configured.
	 */
	async #connectWithRetry(host: string, signal: AbortSignal): Promise<void> {
		if (!host) {
			this.statusManager.updateStatus(InstanceStatus.BadConfig, `No host`)
			return
		}
		for (let attempt = 0; !signal.aborted; attempt++) {
			try {
				await this.#setupConnection(host)
				return
			} catch (err) {
				// Superseded: this attempt failed because its requests were aborted, which is not worth retrying
				if (signal.aborted) return
				handleError(err, this)
				const delay = Math.min(RETRY_BACKOFF.INITIAL * 2 ** attempt, RETRY_BACKOFF.MAX)
				this.log('info', `Connection failed, retrying in ${delay / 1000}s`)
				await abortableDelay(delay, signal)
			}
		}
	}

	/** A single connection attempt. Throws on failure, and #connectWithRetry decides whether to try again. */
	async #setupConnection(host: string): Promise<void> {
		this.#createClient(host)
		await this.#setupDevice()
		this.#newSocket(host)
		this.updateAllDefs()
		// Feedbacks register their polling subscriptions from inside their callbacks, so checking them all is
		// what tells the polling loop which data to fetch
		void this.#startPolling().then(() => {
			this.checkAllFeedbacks()
		})
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** The connection's Verbose Logs setting, for the other files' loggers to gate their debug output on */
	public get verbose(): boolean {
		return this.#config.verbose
	}

	public debug(msg: string | object): void {
		if (this.#config.verbose) {
			const message = typeof msg === 'object' ? JSON.stringify(msg) : msg
			this.log('debug', message)
		}
	}

	#createClient(host = this.#config.host): void {
		if (!host) {
			this.statusManager.updateStatus(InstanceStatus.BadConfig, 'No host')
			return
		}
		this.#client = axios.create({
			baseURL: `http://${host}/cgi-bin?instr.cgi`,
			headers: HTTP_HEADERS,
			timeout: HTTP_TIMEOUT,
		})
	}

	#newSocket(host: string): void {
		if (
			this.#socket &&
			(this.#socket.readyState === WebSocket.OPEN || this.#socket.readyState === WebSocket.CONNECTING)
		) {
			this.#closeWebSocketConnection()
		}
		this.debug(`Initialising websocket to ws://${host}:${WEBSOCKET_PORT}/`)
		this.#socket = new WebSocket(`ws://${host}:${WEBSOCKET_PORT}/`, { signal: this.#controller.signal })
		this.#socket.addEventListener('open', () => {
			this.statusManager.updateStatus(InstanceStatus.Ok, `Websocket connected`)
			this.log('info', `Websocket connected`)
		})
		this.#socket.addEventListener('error', (error) => {
			handleError(error, this)
			this.#throttledWebSocketReconnect()
		})
		this.#socket.addEventListener('close', (event) => {
			this.log('info', `WebSocket closed - ${event.code}: ${event.reason}`)
			this.#throttledWebSocketReconnect()
		})
		this.#socket.addEventListener('message', (msg) => {
			this.debug(`Websocket message received: ${typeof msg.data == 'object' ? JSON.stringify(msg.data) : msg.data}`)
			if (!this.mineola) return
			this.mineola.WebSocketMessage = msg
		})
	}

	#throttledWebSocketReconnect = throttle(
		() => {
			this.#newSocket(this.#config.host)
		},
		10000,
		{ edges: ['trailing'] },
	)

	#closeWebSocketConnection(): void {
		if (this.#socket) {
			this.#socket.terminate()
			//this.#socket.close(1000, 'Resetting connection')
			this.#socket.removeAllListeners('open')
			this.#socket.removeAllListeners('message')
			this.#socket.removeAllListeners('close')
			this.#socket.removeAllListeners('error')
		}
	}

	/**
	 * @param signal Optional caller signal, eg an action's context.signal. Combined with the instance controller so the
	 * request is dropped when either aborts: the user no longer wants it, or the connection is being torn down.
	 */
	public async httpPost(data: HttpMessage, priority: number = 1, signal?: AbortSignal): Promise<AxiosResponse> {
		const combinedSignal = signal ? AbortSignal.any([this.#controller.signal, signal]) : this.#controller.signal
		return await this.#queue.add(
			async ({ signal }) => {
				if (!this.#client) throw new Error('Axios Client not initialised')

				const response = await this.#client.post('', data, { signal: signal })

				this.statusManager.updateStatus(InstanceStatus.Ok, response.statusText)
				this.debug(
					`Successful HTTP Post to http://${this.#config.host}/cgi-bin?instr.cgi with post data ${JSON.stringify(data)}\nResponse data:`,
				)
				this.debug(response.data)

				return response
			},
			{ priority, signal: combinedSignal },
		)
	}

	async #setupDevice(): Promise<void> {
		// Fetch all initial state in parallel
		const [inputs, outputs, presets, info] = await Promise.all([
			this.httpPost({ comhead: 'get_input_status' }),
			this.httpPost({ comhead: 'get_output_status' }),
			this.httpPost({ comhead: 'get_preset_status' }),
			this.httpPost({ comhead: 'get_information_status' }),
		])

		this.mineola = Mineola.createMineola(
			inputs,
			outputs,
			presets,
			info,
			() => this.verbose,
			(err) => handleError(err, this),
		)
		this.#setupFeedbackEventHandlers()
	}

	#setupFeedbackEventHandlers(): void {
		const handleFeedbackEvent = (eventType: FeedbackCategory) => {
			this.feedbackSubscriptions[eventType].forEach((id) => this.#feedbackIdsToCheck.add(id))
			this.throttledCheckFeedbacksById()
		}

		;(Object.keys(this.feedbackSubscriptions) as FeedbackCategory[]).forEach((event) => {
			this.mineola.on(event, () => handleFeedbackEvent(event))
		})

		// Channel dropdown labels carry the names, so a rename means rebuilding the definitions
		this.mineola.on('channelNames', () => this.throttledUpdateActionFeedbackDefs())
	}

	throttledCheckFeedbacksById = throttle(
		() => {
			if (this.#feedbackIdsToCheck.size === 0) return
			this.checkFeedbacksById(...Array.from(this.#feedbackIdsToCheck))
			this.#feedbackIdsToCheck.clear()
		},
		50,
		{ edges: ['trailing'] },
	)

	updateAllDefs(): void {
		try {
			this.updateActions()
			this.updateFeedbacks()
			this.updateVariableDefinitions()
			this.updatePresets()
		} catch (err) {
			handleError(err, this)
		}
	}

	throttledUpdateActionFeedbackDefs = throttle(
		() => {
			this.debug(`Updating Action / Feedback / Variable / Preset definitions`)
			this.updateAllDefs()
			this.checkAllFeedbacks()
		},
		1000,
		{ edges: ['trailing'] },
	)

	async #startPolling(): Promise<void> {
		await Promise.all([this.#pollIO(), this.#pollPresets(), this.#pollInfo()])
	}

	async #pollIO(): Promise<void> {
		if (this.#pollTimers.io) clearTimeout(this.#pollTimers.io)

		try {
			const shouldPollInputs = this.feedbackSubscriptions.inputs.size > 0
			const shouldPollOutputs = this.feedbackSubscriptions.outputs.size > 0
			// Power and Output Master data included in both inputs and outputs response, only poll if we don't poll either of those
			const shouldPollDsp =
				(this.feedbackSubscriptions.power.size > 0 || this.feedbackSubscriptions.outputMaster.size > 0) &&
				!shouldPollInputs &&
				!shouldPollOutputs
			// Fetch in parallel if needed
			const requests = []
			if (shouldPollInputs) {
				requests.push(
					this.httpPost({ comhead: 'get_input_status' }).then((inputs) => {
						this.mineola.inputs = inputs
					}),
				)
			}
			if (shouldPollOutputs) {
				requests.push(
					this.httpPost({ comhead: 'get_output_status' }).then((outputs) => {
						this.mineola.outputs = outputs
					}),
				)
			}
			if (shouldPollDsp) {
				requests.push(
					this.httpPost({ comhead: 'get_dsp_status' }).then((dsp) => {
						this.mineola.dsp = dsp
					}),
				)
			}

			if (requests.length > 0) {
				await Promise.all(requests)
			}
		} catch (err) {
			handleError(err, this)
		}

		this.#pollTimers.io = setTimeout(() => {
			this.#pollIO().catch(() => {})
		}, POLL_INTERVALS.IO)
	}

	async #pollPresets(): Promise<void> {
		if (this.#pollTimers.preset) clearTimeout(this.#pollTimers.preset)

		try {
			if (this.feedbackSubscriptions.presets.size > 0) {
				const presets = await this.httpPost({ comhead: 'get_preset_status' }, 0)
				this.mineola.presets = presets
			}
		} catch (err) {
			handleError(err, this)
		}

		this.#pollTimers.preset = setTimeout(() => {
			this.#pollPresets().catch(() => {})
		}, POLL_INTERVALS.PRESET)
	}

	async #pollInfo(): Promise<void> {
		if (this.#pollTimers.information) clearTimeout(this.#pollTimers.information)

		try {
			if (this.feedbackSubscriptions.information.size > 0) {
				const info = await this.httpPost({ comhead: 'get_information_status' }, 0)
				this.mineola.info = info
			}
		} catch (err) {
			handleError(err, this)
		}

		this.#pollTimers.information = setTimeout(() => {
			this.#pollInfo().catch(() => {})
		}, POLL_INTERVALS.INFORMATION)
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}
