import {
	combineRgb,
	type CompanionFeedbackInfo,
	type CompanionFeedbackContext,
	type CompanionBooleanFeedbackDefinition,
	type CompanionFeedbackDefinition,
	type CompanionValueFeedbackDefinition,
} from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { MineolaEvents } from './mineola.js'
import { ChannelOption } from './options.js'
import { InputSensitivity, OutputLevel } from './types.js'

const defaultStyle = {
	bgcolor: combineRgb(255, 0, 0),
	color: combineRgb(0, 0, 0),
}

const feedbackSubscribe =
	(instance: ModuleInstance, types: Array<keyof typeof instance.feedbackSubscriptions>) =>
	(feedback: CompanionFeedbackInfo, _context: CompanionFeedbackContext): void => {
		types.forEach((type) => {
			instance.feedbackSubscriptions[type].add(feedback.id)
		})
	}

const feedbackUnsubscribe =
	(instance: ModuleInstance, types: Array<keyof typeof instance.feedbackSubscriptions>) =>
	(feedback: CompanionFeedbackInfo, _context: CompanionFeedbackContext): void => {
		types.forEach((type) => {
			instance.feedbackSubscriptions[type].delete(feedback.id)
		})
	}

const checkValidNumber = (value: number, name = 'channel', max = 8, min = 1): void => {
	if (Number.isNaN(value)) throw new Error(`${name} is a NaN`)
	if (value < min) throw new Error(`${name} is a out of range (below ${min}): ${value}`)
	if (value > max) throw new Error(`${name} is a out of range (above ${max}): ${value}`)
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const feedbacks: Record<string, CompanionFeedbackDefinition> = {}

	// Factory for simple value feedbacks without channels
	// Option 1: Function overloads
	function createSimpleFeedback(
		name: string,
		subscriptionKey: keyof MineolaEvents,
		getValue: () => boolean,
		type: 'boolean',
	): CompanionBooleanFeedbackDefinition

	function createSimpleFeedback(
		name: string,
		subscriptionKey: keyof MineolaEvents,
		getValue: () => any,
		type?: 'value',
	): CompanionValueFeedbackDefinition

	function createSimpleFeedback(
		name: string,
		subscriptionKey: keyof MineolaEvents,
		getValue: () => any,
		type: 'boolean' | 'value' = 'value',
	): CompanionFeedbackDefinition {
		const base = {
			name,
			type,
			options: [],
			callback: getValue,
			subscribe: feedbackSubscribe(self, [subscriptionKey]),
			unsubscribe: feedbackUnsubscribe(self, [subscriptionKey]),
		}

		if (type === 'boolean') {
			return { ...base, type: 'boolean' as const, defaultStyle }
		}
		return { ...base, type: 'value' as const }
	}

	// Do the same for createChannelFeedback
	function createChannelFeedback(
		name: string,
		channelType: 'Input' | 'Output' | 'Preset',
		count: number,
		subscriptionKey: keyof MineolaEvents,
		getValue: (chan: number) => boolean,
		type: 'boolean',
	): CompanionBooleanFeedbackDefinition

	function createChannelFeedback(
		name: string,
		channelType: 'Input' | 'Output' | 'Preset',
		count: number,
		subscriptionKey: keyof MineolaEvents,
		getValue: (chan: number) => any,
		type?: 'value',
	): CompanionValueFeedbackDefinition

	function createChannelFeedback(
		name: string,
		channelType: 'Input' | 'Output' | 'Preset',
		count: number,
		subscriptionKey: keyof MineolaEvents,
		getValue: (chan: number) => any,
		type: 'boolean' | 'value' = 'value',
	): CompanionFeedbackDefinition {
		const base = {
			name,
			type,
			options: [ChannelOption(count)],
			callback: (event: CompanionFeedbackInfo) => {
				const chan = Number.parseInt(event.options.channel?.toString() ?? '')
				checkValidNumber(chan, channelType, count)
				return getValue(chan)
			},
			subscribe: feedbackSubscribe(self, [subscriptionKey]),
			unsubscribe: feedbackUnsubscribe(self, [subscriptionKey]),
		}

		if (type === 'boolean') {
			return { ...base, type: 'boolean' as const, defaultStyle }
		}
		return { ...base, type: 'value' as const }
	}

	// Power & Output Master
	feedbacks.power = createSimpleFeedback('Power', 'power', () => self.mineola.power, 'boolean')
	feedbacks.outputMasterMute = createSimpleFeedback(
		'Output Master - Mute',
		'outputMaster',
		() => self.mineola.outputMasterMute,
		'boolean',
	)
	feedbacks.outputMasterVolume = createSimpleFeedback(
		'Output Master - Volume',
		'outputMaster',
		() => self.mineola.outputMasterVolume,
	)

	// Input feedbacks
	feedbacks.inputMute = createChannelFeedback(
		'Input - Mute',
		'Input',
		self.mineola.inputCount,
		'inputs',
		(chan) => self.mineola.inputs.input_mute[chan - 1],
		'boolean',
	)
	feedbacks.inputP48 = createChannelFeedback(
		'Input - Phantom Power',
		'Input',
		self.mineola.inputCount,
		'inputs',
		(chan) => self.mineola.inputs.input_phantom_power[chan - 1],
		'boolean',
	)
	feedbacks.inputGain = createChannelFeedback(
		'Input - Gain',
		'Input',
		self.mineola.inputCount,
		'inputs',
		(chan) => self.mineola.inputs.input_gain[chan - 1],
	)
	feedbacks.inputSensitivity = createChannelFeedback(
		'Input - Sensitivity',
		'Input',
		self.mineola.inputCount,
		'inputs',
		(chan) => InputSensitivity[self.mineola.inputs.input_sensitivity[chan - 1]],
	)
	feedbacks.inputName = createChannelFeedback(
		'Input - Name',
		'Input',
		self.mineola.inputCount,
		'inputs',
		(chan) => self.mineola.inputs.input_name[chan - 1],
	)

	// Output feedbacks
	feedbacks.outputMute = createChannelFeedback(
		'Output - Mute',
		'Output',
		self.mineola.outputCount,
		'outputs',
		(chan) => self.mineola.outputs.output_volume_mute[chan - 1],
		'boolean',
	)
	feedbacks.outputMasterOutMember = createChannelFeedback(
		'Output - Master Output Member',
		'Output',
		self.mineola.outputCount,
		'outputs',
		(chan) => self.mineola.outputs.master_out_member[chan - 1],
		'boolean',
	)
	feedbacks.outputGain = createChannelFeedback(
		'Output - Gain',
		'Output',
		self.mineola.outputCount,
		'outputs',
		(chan) => self.mineola.outputs.output_gain[chan - 1],
	)
	feedbacks.outputDelay = createChannelFeedback(
		'Output - Delay',
		'Output',
		self.mineola.outputCount,
		'outputs',
		(chan) => self.mineola.outputs.output_audio_delay[chan - 1],
	)
	feedbacks.outputName = createChannelFeedback(
		'Output - Name',
		'Output',
		self.mineola.outputCount,
		'outputs',
		(chan) => self.mineola.outputs.output_name[chan - 1],
	)
	feedbacks.outputLevel = createChannelFeedback(
		'Output - Level',
		'Output',
		self.mineola.outputCount,
		'outputs',
		(chan) => OutputLevel[self.mineola.outputs.select_level[chan - 1]],
	)

	// Preset feedbacks
	feedbacks.presetValid = createChannelFeedback(
		'Preset - Valid',
		'Preset',
		self.mineola.presetCount,
		'presets',
		(chan) => self.mineola.presets.valid[chan - 1],
		'boolean',
	)
	feedbacks.presetName = createChannelFeedback(
		'Preset - Name',
		'Preset',
		self.mineola.presetCount,
		'presets',
		(chan) => self.mineola.presets.name[chan - 1],
	)

	// Information feedbacks
	feedbacks.infoModel = createSimpleFeedback(
		'Information - Model Name',
		'information',
		() => self.mineola.info.model_name,
	)
	feedbacks.infoVersion = createSimpleFeedback('Information - Version', 'information', () => self.mineola.info.version)
	feedbacks.infoMcuVersion = createSimpleFeedback(
		'Information - MCU Version',
		'information',
		() => self.mineola.info.mcu_version,
	)
	feedbacks.infodepsdk = createSimpleFeedback('Information - DEP SDK', 'information', () => self.mineola.info.depsdk)
	feedbacks.infoHostName = createSimpleFeedback(
		'Information - Hostname',
		'information',
		() => self.mineola.info.ip_hostname,
	)
	feedbacks.infoMacPri = createSimpleFeedback(
		'Information - MAC Address Primary',
		'information',
		() => self.mineola.info.mac_address,
	)
	feedbacks.infoMacSec = createSimpleFeedback(
		'Information - MAC Address Secondary',
		'information',
		() => self.mineola.info.secondary_mac_address,
	)

	self.setFeedbackDefinitions(feedbacks)
}
