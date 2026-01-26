import { InstanceBase, runEntrypoint, InstanceStatus, SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { handleError } from './errors.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { StatusManager } from './status.js'
import { Mineola, MineolaEvents } from './mineola.js'
import type { HttpMessage } from './types.js'
import axios, { AxiosInstance, AxiosResponse } from 'axios'
import PQueue from 'p-queue'
import { throttle } from 'es-toolkit'

const IO_POLL_INTERVAL = 250
const PRESET_POLL_INTERVAL = 5000
const INFORMATION_POLL_INTERVAL = 30000

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	#config!: ModuleConfig // Setup in init()
	#client!: AxiosInstance
	#queue = new PQueue({ concurrency: 1 })
	#controller = new AbortController()
	public mineola!: Mineola
	public statusManager = new StatusManager(this, { status: InstanceStatus.Connecting, message: 'Initialising' }, 2000)
	public feedbackSubscriptions = {
		inputs: new Set<string>(),
		outputs: new Set<string>(),
		presets: new Set<string>(),
		information: new Set<string>(),
		power: new Set<string>(),
		outputMaster: new Set<string>(),
	}
	#feedbackIdsToCheck = new Set<string>()
	#ioPollTimer: NodeJS.Timeout | undefined = undefined
	#presetTimer: NodeJS.Timeout | undefined = undefined
	#informationPollTimer: NodeJS.Timeout | undefined = undefined

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.#config = config

		this.statusManager.updateStatus(InstanceStatus.Connecting)

		this.configUpdated(config).catch(() => {})
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', `destroy ${this.id}: ${this.label}`)
		this.#queue.clear()
		this.#controller.abort()
		if (this.#ioPollTimer) clearTimeout(this.#ioPollTimer)
		if (this.#presetTimer) clearTimeout(this.#presetTimer)
		if (this.#informationPollTimer) clearTimeout(this.#informationPollTimer)
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.#config = config
		this.debug(config)

		this.#controller.abort()

		this.#controller = new AbortController()
		try {
			this.createClient(config.host)
			await this.setupDevice()
			this.updateAllDefs()
			await this.pollIO()
			await this.pollPresets()
			await this.pollInfo()
			this.checkFeedbacks()
		} catch (err) {
			handleError(err, this)
		}
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	public debug(msg: string | object): void {
		if (this.#config.verbose) {
			if (typeof msg == 'object') msg = JSON.stringify(msg)
			this.log('debug', `${msg}`)
		}
	}

	private createClient(host = this.#config.host): void {
		if (!host) {
			this.statusManager.updateStatus(InstanceStatus.BadConfig, 'No host')
			return
		}
		this.#client = axios.create({
			baseURL: `http://${host}/cgi-bin?instr.cgi`,
			headers: { 'Content-Type': 'application/json' },
		})
	}

	public async httpPost(data: HttpMessage, priority: number = 1): Promise<AxiosResponse<any, any>> {
		return await this.#queue.add(
			async ({ signal }) => {
				if (!this.#client) throw new Error('Axios Client not initialised')
				const response = await this.#client
					.post('', data, { signal: signal })
					.then((response: AxiosResponse<any, any>) => {
						this.statusManager.updateStatus(InstanceStatus.Ok, response.statusText)
						this.debug(
							`Successful HTTP Post to http://${this.#config.host}/cgi-bin?instr.cgi with post data ${JSON.stringify(data)}\nResponse data:`,
						)
						this.debug(response.data)
						return response
					})
				return response
			},
			{ priority: priority, signal: this.#controller.signal },
		)
	}

	async setupDevice(): Promise<void> {
		try {
			const inputs = await this.httpPost({ comhead: 'get_input_status' })
			const outputs = await this.httpPost({ comhead: 'get_output_status' })
			const presets = await this.httpPost({ comhead: 'get_preset_status' })
			const info = await this.httpPost({ comhead: 'get_information_status' })
			this.mineola = Mineola.createMineola(inputs, outputs, presets, info)
			this.updateAllDefs()
			const handleFeedbackEvent = (eventType: keyof typeof this.feedbackSubscriptions) => {
				this.feedbackSubscriptions[eventType].forEach((id) => this.#feedbackIdsToCheck.add(id))
				this.throttledCheckFeedbacksById()
			}

			;(Object.keys(this.feedbackSubscriptions) as Array<keyof MineolaEvents>).forEach((event) => {
				this.mineola.on(event, () => handleFeedbackEvent(event))
			})
		} catch (err) {
			handleError(err, this)
		}
	}

	throttledCheckFeedbacksById = throttle(
		() => {
			if (this.#feedbackIdsToCheck.size === 0) return
			this.checkFeedbacksById(...Array.from(this.#feedbackIdsToCheck))
			this.#feedbackIdsToCheck.clear()
		},
		50,
		{ edges: ['trailing'], signal: this.#controller.signal },
	)

	updateAllDefs(): void {
		try {
			this.updateActions() // export actions
			this.updateFeedbacks() // export feedbacks
			this.updateVariableDefinitions() // export variable definitions
			this.updatePresets()
		} catch (err) {
			handleError(err, this)
		}
	}

	throttledUpdateActionFeedbackDefs = throttle(
		() => {
			this.debug(`Updating Action / Feedback / Variable / Preset definitions`)
			this.updateAllDefs()
			this.checkFeedbacks()
		},
		5000,
		{ edges: ['trailing'], signal: this.#controller.signal },
	)

	async pollIO(): Promise<void> {
		if (this.#ioPollTimer) clearTimeout(this.#ioPollTimer)
		try {
			if (this.feedbackSubscriptions.inputs.size > 0) {
				const inputs = await this.httpPost({ comhead: 'get_input_status' })
				this.mineola.inputs = inputs
			}
			const outputs = await this.httpPost({ comhead: 'get_output_status' })
			this.mineola.outputs = outputs
		} catch (err) {
			handleError(err, this)
		}
		this.#ioPollTimer = setTimeout(() => {
			this.pollIO().catch(() => {})
		}, IO_POLL_INTERVAL)
	}

	async pollPresets(): Promise<void> {
		if (this.#presetTimer) clearTimeout(this.#presetTimer)
		try {
			if (this.feedbackSubscriptions.presets.size > 0) {
				const presets = await this.httpPost({ comhead: 'get_preset_status' }, 0)
				this.mineola.presets = presets
			}
		} catch (err) {
			handleError(err, this)
		}
		this.#presetTimer = setTimeout(() => {
			this.pollPresets().catch(() => {})
		}, PRESET_POLL_INTERVAL)
	}
	async pollInfo(): Promise<void> {
		if (this.#informationPollTimer) clearTimeout(this.#informationPollTimer)
		try {
			if (this.feedbackSubscriptions.information.size > 0) {
				const presets = await this.httpPost({ comhead: 'get_preset_status' }, 0)
				this.mineola.presets = presets
			}
		} catch (err) {
			handleError(err, this)
		}
		this.#informationPollTimer = setTimeout(() => {
			this.pollInfo().catch(() => {})
		}, INFORMATION_POLL_INTERVAL)
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

runEntrypoint(ModuleInstance, UpgradeScripts)
