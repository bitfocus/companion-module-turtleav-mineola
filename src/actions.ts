import type {
	CompanionActionDefinition,
	CompanionActionDefinitions,
	CompanionActionEvent,
} from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { SetOrErrorResponseSchema } from './schemas.js'
import { ChannelOption } from './options.js'
import { type ComHeadMessageTypes, type HttpMessage, InputSensitivity, OutputLevel } from './types.js'
import { getDropdownChoices } from './utils.js'

function rangeLimitNumber(value: number, min = 0, max = 100): number {
	if (Number.isNaN(value)) throw new Error('Value is a NaN')
	return Math.max(min, Math.min(max, value))
}

function checkValidChannel(value: number, arraySize: number): void {
	if (Number.isNaN(value)) throw new Error(`Channel is a NaN`)
	if (value < 0) throw new Error(`Channel is negative: ${value}`)
	if (value >= arraySize) throw new Error(`Channel is out of range: ${value}`)
}

// Reusable option sets
const STATE_CHOICES = [
	{ id: 0, label: 'Off' },
	{ id: 1, label: 'On' },
	{ id: 2, label: 'Toggle' },
]

const MUTE_CHOICES = [
	{ id: 0, label: 'On' },
	{ id: 1, label: 'Muted' },
	{ id: 2, label: 'Toggle' },
]

// Generic helpers
function getChannelFromAction(action: CompanionActionEvent, offset = -1): number {
	return Number.parseInt(action.options.channel?.toString() ?? '') + offset
}

function getToggleState(requestedState: number, currentState: boolean): number {
	return requestedState === 2 ? 1 - Number(currentState) : requestedState
}

async function sendCommand(self: ModuleInstance, command: HttpMessage, onSuccess?: () => void): Promise<void> {
	const response = await self.httpPost(command)
	const msg = SetOrErrorResponseSchema.parse(response.data)
	if ('error' in msg) throw new Error(msg.error)
	if (msg.result === 1 && msg.comhead === command.comhead && onSuccess) {
		onSuccess()
	}
}

// Generic relative value handler
function getRelativeValue(
	action: any,
	optionKey: string,
	currentValue: number,
	min: number,
	max: number,
	isFloat = false,
): number {
	const parser = isFloat ? Number.parseFloat : Number.parseInt
	let value = parser(action.options[optionKey]?.toString() ?? '')
	if (action.options.relative) value += currentValue
	return rangeLimitNumber(value, min, max)
}

export function UpdateActions(self: ModuleInstance): void {
	const actions: CompanionActionDefinitions = {}

	/**********************/
	/*        Power       */
	/**********************/
	actions.power = {
		name: 'Power',
		options: [
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: STATE_CHOICES,
				default: 2,
				allowCustom: false,
			},
		],
		callback: async (action) => {
			const state = getToggleState(Number(action.options.state ?? 2), self.mineola.power)
			await sendCommand(self, { comhead: 'set_power', power: state }, () => {
				self.mineola.power = Boolean(state)
			})
		},
	}

	/**********************/
	/*    Output Master   */
	/**********************/
	actions.outputMasterMute = {
		name: 'Output Master - Mute',
		options: [
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: MUTE_CHOICES,
				default: 2,
				allowCustom: false,
			},
		],
		callback: async (action) => {
			const state = getToggleState(Number(action.options.state ?? 2), self.mineola.outputMasterMute)
			await sendCommand(self, { comhead: 'set_master_mute', mute: state }, () => {
				self.mineola.outputMasterMute = Boolean(state)
			})
		},
	}

	actions.outputMasterVolume = {
		name: 'Output Master - Volume',
		options: [
			{
				type: 'textinput',
				id: 'volume',
				label: 'Volume',
				default: '50',
				useVariables: { local: true },
				description: `Range: 0 to 100. When relative is enabled negative values decrease volume`,
			},
			{
				type: 'checkbox',
				id: 'relative',
				label: 'Relative',
				default: false,
				description: 'Enable to make a relative volume adjustment',
			},
		],
		callback: async (action) => {
			const value = getRelativeValue(action, 'volume', self.mineola.outputMasterVolume, 0, 100)
			await sendCommand(self, { comhead: 'set_master_volume', volume: value }, () => {
				self.mineola.outputMasterVolume = value
			})
		},
		learn: (action) => ({
			...action.options,
			volume: self.mineola.outputMasterVolume,
			relative: false,
		}),
	}

	/**********************/
	/*       Output       */
	/**********************/
	actions.outputMasterMember = {
		name: 'Output - Master Output Member',
		options: [
			ChannelOption(self.mineola.outputCount, 'Output'),
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: STATE_CHOICES,
				default: 2,
				allowCustom: false,
			},
		],
		callback: async (action) => {
			const out = getChannelFromAction(action)
			checkValidChannel(out, self.mineola.outputCount)
			const state = getToggleState(Number(action.options.state ?? 2), self.mineola.outputs.master_out_member[out])
			await sendCommand(self, { comhead: 'set_master_out_member', source: out, onoff: state }, () => {
				self.mineola.outputMasterMember = { source: out, onoff: Boolean(state) }
			})
		},
	}

	actions.outputMute = {
		name: 'Output - Mute',
		options: [
			ChannelOption(self.mineola.outputCount, 'Output'),
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: MUTE_CHOICES,
				default: 2,
				allowCustom: false,
			},
		],
		callback: async (action) => {
			const out = getChannelFromAction(action)
			checkValidChannel(out, self.mineola.outputCount)
			const state = getToggleState(Number(action.options.state ?? 2), self.mineola.outputs.output_volume_mute[out])
			await sendCommand(self, { comhead: 'set_output_mute', source: out, mute: state }, () => {
				self.mineola.outputMute = { source: out, mute: Boolean(state) }
			})
		},
	}

	actions.outputGain = {
		name: 'Output - Gain',
		options: [
			ChannelOption(self.mineola.outputCount, 'Output'),
			{
				type: 'textinput',
				id: 'gain',
				label: 'Gain',
				default: '0',
				useVariables: { local: true },
				description: `Range: -60 to 12. When relative is enabled negative values decrease gain`,
			},
			{
				type: 'checkbox',
				id: 'relative',
				label: 'Relative',
				default: false,
				description: 'Enable to make a relative gain adjustment',
			},
		],
		callback: async (action) => {
			const out = getChannelFromAction(action)
			checkValidChannel(out, self.mineola.outputCount)
			const value = getRelativeValue(action, 'gain', self.mineola.outputs.output_gain[out], -60, 12, true)
			await sendCommand(self, { comhead: 'set_output_gain', source: out, gain: value }, () => {
				self.mineola.outputGain = { source: out, gain: value }
			})
		},
		learn: (action) => {
			const out = getChannelFromAction(action)
			checkValidChannel(out, self.mineola.outputCount)
			return {
				...action.options,
				gain: self.mineola.outputs.output_gain[out],
				relative: false,
			}
		},
	}

	actions.outputDelay = {
		name: 'Output - Delay',
		options: [
			ChannelOption(self.mineola.outputCount, 'Output'),
			{
				type: 'textinput',
				id: 'delay',
				label: 'Delay (mS)',
				default: '0',
				useVariables: { local: true },
				description: `Range: 0 to 50. When relative is enabled negative values decrease delay`,
			},
			{
				type: 'checkbox',
				id: 'relative',
				label: 'Relative',
				default: false,
				description: 'Enable to make a relative delay adjustment',
			},
		],
		callback: async (action) => {
			const out = getChannelFromAction(action)
			checkValidChannel(out, self.mineola.outputCount)
			const value = getRelativeValue(action, 'delay', self.mineola.outputs.output_audio_delay[out], 0, 50)
			await sendCommand(self, { comhead: 'set_output_delay', source: out, delay: value }, () => {
				self.mineola.outputDelay = { source: out, delay: value }
			})
		},
		learn: (action) => {
			const out = getChannelFromAction(action)
			checkValidChannel(out, self.mineola.outputCount)
			return {
				...action.options,
				delay: self.mineola.outputs.output_audio_delay[out],
				relative: false,
			}
		},
	}

	actions.outputLevel = {
		name: 'Output - Level',
		options: [
			ChannelOption(self.mineola.outputCount, 'Output'),
			{
				type: 'dropdown',
				id: 'level',
				label: 'Level',
				default: 0,
				choices: getDropdownChoices(OutputLevel),
			},
		],
		callback: async (action) => {
			const out = getChannelFromAction(action)
			checkValidChannel(out, self.mineola.outputCount)
			const value = Number(action.options.level ?? 0)
			await sendCommand(self, { comhead: 'set_output_level', level: value }, () => {
				self.mineola.outputLevel = { source: out, level: value }
			})
		},
		learn: (action) => {
			const out = getChannelFromAction(action)
			checkValidChannel(out, self.mineola.outputCount)
			return {
				...action.options,
				level: self.mineola.outputs.select_level[out],
			}
		},
	}

	// Similar pattern for input actions...
	actions.inputMute = {
		name: 'Input - Mute',
		options: [
			ChannelOption(self.mineola.inputCount, 'Input'),
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: MUTE_CHOICES,
				default: 2,
				allowCustom: false,
			},
		],
		callback: async (action) => {
			const input = getChannelFromAction(action)
			checkValidChannel(input, self.mineola.inputCount)
			const state = getToggleState(Number(action.options.state ?? 2), self.mineola.inputs.input_mute[input])
			await sendCommand(self, { comhead: 'set_input_mute', source: input, mute: state }, () => {
				self.mineola.inputMute = { source: input, mute: Boolean(state) }
			})
		},
	}

	actions.inputPhantom = {
		name: 'Input - Phantom Power',
		options: [
			ChannelOption(self.mineola.inputCount, 'Input'),
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: STATE_CHOICES,
				default: 2,
				allowCustom: false,
			},
		],
		callback: async (action) => {
			const input = getChannelFromAction(action)
			checkValidChannel(input, self.mineola.inputCount)
			const state = getToggleState(Number(action.options.state ?? 2), self.mineola.inputs.input_phantom_power[input])
			await sendCommand(self, { comhead: 'set_input_phantom_power', source: input, onoff: state }, () => {
				self.mineola.inputPhantom = { source: input, p48: Boolean(state) }
			})
		},
	}

	actions.inputGain = {
		name: 'Input - Gain',
		options: [
			ChannelOption(self.mineola.inputCount, 'Input'),
			{
				type: 'textinput',
				id: 'gain',
				label: 'Gain',
				default: '0',
				useVariables: { local: true },
				description: `Range: -12 to 12. When relative is enabled negative values decrease gain`,
			},
			{
				type: 'checkbox',
				id: 'relative',
				label: 'Relative',
				default: false,
				description: 'Enable to make a relative gain adjustment',
			},
		],
		callback: async (action) => {
			const input = getChannelFromAction(action)
			checkValidChannel(input, self.mineola.inputCount)
			const value = getRelativeValue(action, 'gain', self.mineola.inputs.input_gain[input], -12, 12, true)
			await sendCommand(self, { comhead: 'set_input_gain', source: input, gain: value }, () => {
				self.mineola.inputGain = { source: input, gain: value }
			})
		},
		learn: (action) => {
			const input = getChannelFromAction(action)
			checkValidChannel(input, self.mineola.inputCount)
			return {
				...action.options,
				gain: self.mineola.inputs.input_gain[input],
				relative: false,
			}
		},
	}

	actions.inputSensitivity = {
		name: 'Input - Sensitivity',
		options: [
			ChannelOption(self.mineola.inputCount, 'Input'),
			{
				type: 'dropdown',
				id: 'sensitivity',
				label: 'Sensitivity',
				default: 0,
				choices: getDropdownChoices(InputSensitivity),
			},
		],
		callback: async (action) => {
			const input = getChannelFromAction(action)
			checkValidChannel(input, self.mineola.inputCount)
			const value = Number(action.options.sensitivity ?? 0)
			await sendCommand(self, { comhead: 'set_input_sensitivity', sensitivity: value }, () => {
				self.mineola.inputSensitivity = { source: input, sensitivity: value }
			})
		},
		learn: (action) => {
			const input = getChannelFromAction(action)
			checkValidChannel(input, self.mineola.inputCount)
			return {
				...action.options,
				sensitivity: self.mineola.inputs.input_sensitivity[input],
			}
		},
	}

	// Name setters follow similar pattern
	const createNameAction = (
		entityType: 'input' | 'output' | 'preset',
		comhead: ComHeadMessageTypes,
		count: number,
		nameArray: string[],
	): CompanionActionDefinition => ({
		name: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} - Name`,
		options: [
			ChannelOption(count, `${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`),
			{
				type: 'textinput',
				id: 'name',
				label: 'Name',
				default: '',
				description: '32 Characters max',
				useVariables: { local: true },
			},
		],
		callback: async (action: CompanionActionEvent) => {
			const index = getChannelFromAction(action)
			checkValidChannel(index, count)
			const value = (action.options.name?.toString() ?? '').substring(0, 32)
			const command: HttpMessage = { comhead: comhead }
			command.name = value
			if (entityType === 'preset') {
				command.index = index
			} else {
				command.source = index
			}
			await sendCommand(self, command, () => {
				switch (entityType) {
					case 'input':
					case 'output':
						self.mineola[`${entityType}Name`] = { source: index, name: value }
						break
					case 'preset':
						self.mineola[`${entityType}Name`] = { index: index, name: value }
				}
			})
		},
		learn: (action: any) => {
			const index = getChannelFromAction(action)
			checkValidChannel(index, count)
			return {
				...action.options,
				name: nameArray[index],
			}
		},
	})

	actions.inputName = createNameAction(
		'input',
		'set_input_name',
		self.mineola.inputCount,
		self.mineola.inputs.input_name,
	)
	actions.outputName = createNameAction(
		'output',
		'set_output_name',
		self.mineola.outputCount,
		self.mineola.outputs.output_name,
	)
	actions.presetName = createNameAction(
		'preset',
		'set_preset_name',
		self.mineola.presetCount,
		self.mineola.presets.name,
	)

	/**********************/
	/*       Preset       */
	/**********************/
	actions.presetSave = {
		name: 'Preset - Save',
		options: [ChannelOption(self.mineola.presetCount, 'Preset')],
		callback: async (action) => {
			const preset = getChannelFromAction(action)
			checkValidChannel(preset, self.mineola.presetCount)
			await sendCommand(self, { comhead: 'set_save_preset', index: preset }, () => {
				self.mineola.presetSave = preset
			})
		},
	}

	actions.presetClear = {
		name: 'Preset - Clear',
		options: [ChannelOption(self.mineola.presetCount, 'Preset')],
		callback: async (action) => {
			const preset = getChannelFromAction(action)
			checkValidChannel(preset, self.mineola.presetCount)
			await sendCommand(self, { comhead: 'set_clear_preset', index: preset }, () => {
				self.mineola.presetClear = preset
			})
		},
	}

	actions.presetRecall = {
		name: 'Preset - Recall',
		options: [ChannelOption(self.mineola.presetCount, 'Preset')],
		callback: async (action) => {
			const preset = getChannelFromAction(action)
			checkValidChannel(preset, self.mineola.presetCount)
			await sendCommand(self, { comhead: 'set_recall_preset', index: preset }, () => {
				self.log('info', `Recalled preset ${preset}: ${self.mineola.presets.name[preset]}`)
			})
		},
	}

	actions.reboot = {
		name: 'Reboot',
		options: [],
		callback: async (_action) => {
			await sendCommand(self, { comhead: 'set_system_reboot' }, () => {
				self.log('info', `Device rebooting`)
			})
		},
	}

	self.setActionDefinitions(actions)
}
