import {
	createModuleLogger,
	type CompanionActionDefinition,
	type CompanionActionDefinitions,
	type DropdownChoice,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import { SetOrErrorResponseSchema } from './schemas.js'
import { ChannelOption } from './options.js'
import { type HttpMessage, type SetMessage, InputSensitivity, OutputLevel } from './types.js'
import { getDropdownChoices } from './utils.js'

const logger = createModuleLogger('Actions')

/**
 * Action ids. The values are the ids saved against every button using the action, so they must never change —
 * they predate this enum and are camelCase for that reason.
 */
export enum ActionId {
	Power = 'power',
	OutputMasterMute = 'outputMasterMute',
	OutputMasterVolume = 'outputMasterVolume',
	OutputMasterMember = 'outputMasterMember',
	OutputMute = 'outputMute',
	OutputGain = 'outputGain',
	OutputDelay = 'outputDelay',
	OutputLevel = 'outputLevel',
	OutputName = 'outputName',
	InputMute = 'inputMute',
	InputPhantom = 'inputPhantom',
	InputGain = 'inputGain',
	InputSensitivity = 'inputSensitivity',
	InputName = 'inputName',
	PresetName = 'presetName',
	PresetSave = 'presetSave',
	PresetClear = 'presetClear',
	PresetRecall = 'presetRecall',
	Reboot = 'reboot',
}

/** 0 = off / on (unmuted), 1 = on / muted, 2 = toggle */
export type ToggleState = 0 | 1 | 2

type ChannelOptions = { channel: number }
type ToggleOptions = { state: ToggleState }
type NameOptions = ChannelOptions & { name: string }

export type ActionSchema = {
	[ActionId.Power]: { options: ToggleOptions }
	[ActionId.OutputMasterMute]: { options: ToggleOptions }
	[ActionId.OutputMasterVolume]: { options: { volume: number; relative: boolean } }
	[ActionId.OutputMasterMember]: { options: ChannelOptions & ToggleOptions }
	[ActionId.OutputMute]: { options: ChannelOptions & ToggleOptions }
	[ActionId.OutputGain]: { options: ChannelOptions & { gain: number; relative: boolean } }
	[ActionId.OutputDelay]: { options: ChannelOptions & { delay: number; relative: boolean } }
	[ActionId.OutputLevel]: { options: ChannelOptions & { level: number } }
	[ActionId.OutputName]: { options: NameOptions }
	[ActionId.InputMute]: { options: ChannelOptions & ToggleOptions }
	[ActionId.InputPhantom]: { options: ChannelOptions & ToggleOptions }
	[ActionId.InputGain]: { options: ChannelOptions & { gain: number; relative: boolean } }
	[ActionId.InputSensitivity]: { options: ChannelOptions & { sensitivity: number } }
	[ActionId.InputName]: { options: NameOptions }
	[ActionId.PresetName]: { options: NameOptions }
	[ActionId.PresetSave]: { options: ChannelOptions }
	[ActionId.PresetClear]: { options: ChannelOptions }
	[ActionId.PresetRecall]: { options: ChannelOptions }
	[ActionId.Reboot]: { options: Record<string, never> }
}

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
] as const satisfies DropdownChoice<ToggleState>[]

const MUTE_CHOICES = [
	{ id: 0, label: 'On' },
	{ id: 1, label: 'Muted' },
	{ id: 2, label: 'Toggle' },
] as const satisfies DropdownChoice<ToggleState>[]

const OUTPUT_LEVEL_CHOICES = getDropdownChoices(OutputLevel)
const INPUT_SENSITIVITY_CHOICES = getDropdownChoices(InputSensitivity)

/** Channel options are 1-based for the user, the device and the state arrays are 0-based. */
function getChannelIndex(options: ChannelOptions, count: number): number {
	const index = Number(options.channel) - 1
	checkValidChannel(index, count)
	return index
}

function getToggleState(requestedState: ToggleState, currentState: boolean): 0 | 1 {
	if (requestedState === 2) return currentState ? 0 : 1
	return requestedState
}

function getRelativeValue(
	value: number,
	relative: boolean,
	currentValue: number,
	min: number,
	max: number,
	isFloat = false,
): number {
	let result = isFloat ? Number(value) : Math.trunc(Number(value))
	if (relative) result += currentValue
	return rangeLimitNumber(result, min, max)
}

async function sendCommand(
	self: ModuleInstance,
	command: HttpMessage,
	signal: AbortSignal,
	onSuccess?: () => void,
): Promise<void> {
	const response = await self.httpPost(command, 1, signal)
	const msg = SetOrErrorResponseSchema.parse(response.data)
	if ('error' in msg) throw new Error(msg.error)
	// The device refuses a command with result 0 rather than an error payload
	if (msg.result === 0) throw new Error(`Device refused ${command.comhead}: ${JSON.stringify(command)}`)
	if (msg.result === 1 && msg.comhead === command.comhead && onSuccess) {
		onSuccess()
		return
	} else {
		logger.warn(`Unexpected response to ${command.comhead}: ${JSON.stringify(msg)}`)
	}
}

export function UpdateActions(self: ModuleInstance): void {
	const createNameAction = (
		entityType: 'input' | 'output' | 'preset',
		comhead: SetMessage,
		count: number,
		// A getter, not the array: Mineola replaces its whole state object when changed data arrives, and definitions
		// are only built at connect, so a captured array would go stale
		getNames: () => readonly string[],
	): CompanionActionDefinition<ActionSchema[ActionId.InputName]> => {
		const label = entityType.charAt(0).toUpperCase() + entityType.slice(1)
		return {
			name: `${label} - Name`,
			options: [
				ChannelOption(getNames(), label),
				{
					type: 'textinput',
					id: 'name',
					label: 'Name',
					default: '',
					description: '32 Characters max',
					useVariables: true,
				},
			],
			callback: async (action, context) => {
				const index = getChannelIndex(action.options, count)
				const value = String(action.options.name).substring(0, 32)
				const command: HttpMessage = { comhead: comhead }
				command.name = value
				if (entityType === 'preset') {
					command.index = index
				} else {
					command.source = index
				}
				await sendCommand(self, command, context.signal, () => {
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
			learn: (action) => {
				const index = getChannelIndex(action.options, count)
				return { name: getNames()[index] }
			},
		}
	}

	const actions: CompanionActionDefinitions<ActionSchema> = {
		/**********************/
		/*        Power       */
		/**********************/
		[ActionId.Power]: {
			name: 'Power',
			options: [
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					choices: STATE_CHOICES,
					default: STATE_CHOICES[2].id,
					allowCustom: false,
				},
			],
			callback: async (action, context) => {
				const state = getToggleState(action.options.state, self.mineola.power)
				await sendCommand(self, { comhead: 'set_power', power: state }, context.signal, () => {
					self.mineola.power = Boolean(state)
				})
			},
		},

		/**********************/
		/*    Output Master   */
		/**********************/
		[ActionId.OutputMasterMute]: {
			name: 'Output Master - Mute',
			options: [
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					choices: MUTE_CHOICES,
					default: MUTE_CHOICES[2].id,
					allowCustom: false,
				},
			],
			callback: async (action, context) => {
				const state = getToggleState(action.options.state, self.mineola.outputMasterMute)
				await sendCommand(self, { comhead: 'set_master_mute', mute: state }, context.signal, () => {
					self.mineola.outputMasterMute = Boolean(state)
				})
			},
		},

		[ActionId.OutputMasterVolume]: {
			name: 'Output Master - Volume',
			options: [
				{
					type: 'number',
					id: 'volume',
					label: 'Volume',
					default: 50,
					min: -100,
					max: 100,
					asInteger: true,
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
			callback: async (action, context) => {
				const { volume, relative } = action.options
				const value = getRelativeValue(volume, relative, self.mineola.outputMasterVolume, 0, 100)
				await sendCommand(self, { comhead: 'set_master_volume', volume: value }, context.signal, () => {
					self.mineola.outputMasterVolume = value
				})
			},
			learn: () => ({
				volume: self.mineola.outputMasterVolume,
				relative: false,
			}),
		},

		/**********************/
		/*       Output       */
		/**********************/
		[ActionId.OutputMasterMember]: {
			name: 'Output - Master Output Member',
			options: [
				ChannelOption(self.mineola.outputs.output_name, 'Output'),
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					choices: STATE_CHOICES,
					default: STATE_CHOICES[2].id,
					allowCustom: false,
				},
			],
			callback: async (action, context) => {
				const out = getChannelIndex(action.options, self.mineola.outputCount)
				const state = getToggleState(action.options.state, self.mineola.outputs.master_out_member[out])
				await sendCommand(self, { comhead: 'set_master_out_member', source: out, onoff: state }, context.signal, () => {
					self.mineola.outputMasterMember = { source: out, onoff: Boolean(state) }
				})
			},
		},

		[ActionId.OutputMute]: {
			name: 'Output - Mute',
			options: [
				ChannelOption(self.mineola.outputs.output_name, 'Output'),
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					choices: MUTE_CHOICES,
					default: MUTE_CHOICES[2].id,
					allowCustom: false,
				},
			],
			callback: async (action, context) => {
				const out = getChannelIndex(action.options, self.mineola.outputCount)
				const state = getToggleState(action.options.state, self.mineola.outputs.output_volume_mute[out])
				await sendCommand(self, { comhead: 'set_output_mute', source: out, mute: state }, context.signal, () => {
					self.mineola.outputMute = { source: out, mute: Boolean(state) }
				})
			},
		},

		[ActionId.OutputGain]: {
			name: 'Output - Gain',
			options: [
				ChannelOption(self.mineola.outputs.output_name, 'Output'),
				{
					type: 'number',
					id: 'gain',
					label: 'Gain',
					default: 0,
					min: -72,
					max: 72,
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
			callback: async (action, context) => {
				const out = getChannelIndex(action.options, self.mineola.outputCount)
				const { gain, relative } = action.options
				const value = getRelativeValue(gain, relative, self.mineola.outputs.output_gain[out], -60, 12, true)
				await sendCommand(self, { comhead: 'set_output_gain', source: out, gain: value }, context.signal, () => {
					self.mineola.outputGain = { source: out, gain: value }
				})
			},
			learn: (action) => {
				const out = getChannelIndex(action.options, self.mineola.outputCount)
				return {
					gain: self.mineola.outputs.output_gain[out],
					relative: false,
				}
			},
		},

		[ActionId.OutputDelay]: {
			name: 'Output - Delay',
			options: [
				ChannelOption(self.mineola.outputs.output_name, 'Output'),
				{
					type: 'number',
					id: 'delay',
					label: 'Delay (mS)',
					default: 0,
					min: -50,
					max: 50,
					asInteger: true,
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
			callback: async (action, context) => {
				const out = getChannelIndex(action.options, self.mineola.outputCount)
				const { delay, relative } = action.options
				const value = getRelativeValue(delay, relative, self.mineola.outputs.output_audio_delay[out], 0, 50)
				await sendCommand(self, { comhead: 'set_output_delay', source: out, delay: value }, context.signal, () => {
					self.mineola.outputDelay = { source: out, delay: value }
				})
			},
			learn: (action) => {
				const out = getChannelIndex(action.options, self.mineola.outputCount)
				return {
					delay: self.mineola.outputs.output_audio_delay[out],
					relative: false,
				}
			},
		},

		[ActionId.OutputLevel]: {
			name: 'Output - Level',
			options: [
				ChannelOption(self.mineola.outputs.output_name, 'Output'),
				{
					type: 'dropdown',
					id: 'level',
					label: 'Level',
					default: OUTPUT_LEVEL_CHOICES[0].id,
					choices: OUTPUT_LEVEL_CHOICES,
				},
			],
			callback: async (action, context) => {
				const out = getChannelIndex(action.options, self.mineola.outputCount)
				const value = Number(action.options.level)
				await sendCommand(self, { comhead: 'set_output_level', source: out, level: value }, context.signal, () => {
					self.mineola.outputLevel = { source: out, level: value }
				})
			},
			learn: (action) => {
				const out = getChannelIndex(action.options, self.mineola.outputCount)
				return {
					level: self.mineola.outputs.select_level[out],
				}
			},
		},

		[ActionId.OutputName]: createNameAction(
			'output',
			'set_output_name',
			self.mineola.outputCount,
			() => self.mineola.outputs.output_name,
		),

		/**********************/
		/*        Input       */
		/**********************/
		[ActionId.InputMute]: {
			name: 'Input - Mute',
			options: [
				ChannelOption(self.mineola.inputs.input_name, 'Input'),
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					choices: MUTE_CHOICES,
					default: MUTE_CHOICES[2].id,
					allowCustom: false,
				},
			],
			callback: async (action, context) => {
				const input = getChannelIndex(action.options, self.mineola.inputCount)
				const state = getToggleState(action.options.state, self.mineola.inputs.input_mute[input])
				await sendCommand(self, { comhead: 'set_input_mute', source: input, mute: state }, context.signal, () => {
					self.mineola.inputMute = { source: input, mute: Boolean(state) }
				})
			},
		},

		[ActionId.InputPhantom]: {
			name: 'Input - Phantom Power',
			options: [
				ChannelOption(self.mineola.inputs.input_name, 'Input'),
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					choices: STATE_CHOICES,
					default: STATE_CHOICES[2].id,
					allowCustom: false,
				},
			],
			callback: async (action, context) => {
				const input = getChannelIndex(action.options, self.mineola.inputCount)
				const state = getToggleState(action.options.state, self.mineola.inputs.input_phantom_power[input])
				await sendCommand(
					self,
					{ comhead: 'set_input_phantom_power', source: input, onoff: state },
					context.signal,
					() => {
						self.mineola.inputPhantom = { source: input, p48: Boolean(state) }
					},
				)
			},
		},

		[ActionId.InputGain]: {
			name: 'Input - Gain',
			options: [
				ChannelOption(self.mineola.inputs.input_name, 'Input'),
				{
					type: 'number',
					id: 'gain',
					label: 'Gain',
					default: 0,
					min: -24,
					max: 24,
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
			callback: async (action, context) => {
				const input = getChannelIndex(action.options, self.mineola.inputCount)
				const { gain, relative } = action.options
				const value = getRelativeValue(gain, relative, self.mineola.inputs.input_gain[input], -12, 12, true)
				await sendCommand(self, { comhead: 'set_input_gain', source: input, gain: value }, context.signal, () => {
					self.mineola.inputGain = { source: input, gain: value }
				})
			},
			learn: (action) => {
				const input = getChannelIndex(action.options, self.mineola.inputCount)
				return {
					gain: self.mineola.inputs.input_gain[input],
					relative: false,
				}
			},
		},

		[ActionId.InputSensitivity]: {
			name: 'Input - Sensitivity',
			options: [
				ChannelOption(self.mineola.inputs.input_name, 'Input'),
				{
					type: 'dropdown',
					id: 'sensitivity',
					label: 'Sensitivity',
					default: INPUT_SENSITIVITY_CHOICES[0].id,
					choices: INPUT_SENSITIVITY_CHOICES,
				},
			],
			callback: async (action, context) => {
				const input = getChannelIndex(action.options, self.mineola.inputCount)
				const value = Number(action.options.sensitivity)
				await sendCommand(
					self,
					{ comhead: 'set_input_sensitivity', source: input, sensitivity: value },
					context.signal,
					() => {
						self.mineola.inputSensitivity = { source: input, sensitivity: value }
					},
				)
			},
			learn: (action) => {
				const input = getChannelIndex(action.options, self.mineola.inputCount)
				return {
					sensitivity: self.mineola.inputs.input_sensitivity[input],
				}
			},
		},

		[ActionId.InputName]: createNameAction(
			'input',
			'set_input_name',
			self.mineola.inputCount,
			() => self.mineola.inputs.input_name,
		),

		/**********************/
		/*       Preset       */
		/**********************/
		[ActionId.PresetName]: createNameAction(
			'preset',
			'set_preset_name',
			self.mineola.presetCount,
			() => self.mineola.presets.name,
		),

		[ActionId.PresetSave]: {
			name: 'Preset - Save',
			options: [ChannelOption(self.mineola.presets.name, 'Preset')],
			callback: async (action, context) => {
				const preset = getChannelIndex(action.options, self.mineola.presetCount)
				await sendCommand(self, { comhead: 'set_save_preset', index: preset }, context.signal, () => {
					self.mineola.presetSave = preset
				})
			},
		},

		[ActionId.PresetClear]: {
			name: 'Preset - Clear',
			options: [ChannelOption(self.mineola.presets.name, 'Preset')],
			callback: async (action, context) => {
				const preset = getChannelIndex(action.options, self.mineola.presetCount)
				await sendCommand(self, { comhead: 'set_clear_preset', index: preset }, context.signal, () => {
					self.mineola.presetClear = preset
				})
			},
		},

		[ActionId.PresetRecall]: {
			name: 'Preset - Recall',
			options: [ChannelOption(self.mineola.presets.name, 'Preset')],
			callback: async (action, context) => {
				const preset = getChannelIndex(action.options, self.mineola.presetCount)
				await sendCommand(self, { comhead: 'set_recall_preset', index: preset }, context.signal, () => {
					logger.info(`Recalled preset ${preset}: ${self.mineola.presets.name[preset]}`)
				})
			},
		},

		/**********************/
		/*       System       */
		/**********************/
		[ActionId.Reboot]: {
			name: 'Reboot',
			options: [],
			callback: async (_action, context) => {
				await sendCommand(self, { comhead: 'set_system_reboot' }, context.signal, () => {
					logger.info(`Device rebooting`)
				})
			},
		},
	}

	self.setActionDefinitions(actions)
}
