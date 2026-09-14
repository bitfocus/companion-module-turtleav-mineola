import {
	combineRgb,
	type CompanionBooleanFeedbackDefinition,
	type CompanionFeedbackDefinitions,
	type CompanionFeedbackInfo,
	type CompanionValueFeedbackDefinition,
	type JsonValue,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { MineolaEvents } from './mineola.js'
import { ChannelOption } from './options.js'
import { InputSensitivity, OutputLevel } from './types.js'

/**
 * Feedback ids. The values are the ids saved against every button using the feedback, so they must never change —
 * they predate this enum, which is why two of them carry typos.
 */
export enum FeedbackId {
	Power = 'power',
	OutputMasterMute = 'outputMasterMute',
	OutputMasterVolume = 'outputMasterVolume',
	InputMute = 'inputMute',
	InputP48 = 'inputP48',
	InputGain = 'inputGain',
	InputSensitivity = 'inputSensitivity',
	InputName = 'inputName',
	InputSignalLevel = 'inputSignalLevel',
	OutputMute = 'outputMute',
	OutputMasterOutMember = 'outputMasterOutMember',
	OutputGain = 'outputGain',
	OutputDelay = 'outputDelay',
	OutputName = 'outputName',
	OutputLevel = 'outputlLevel',
	OutputSignalLevel = 'outputSignalLevel',
	PresetValid = 'presetValid',
	PresetName = 'presetName',
	InfoModel = 'infoModel',
	InfoVersion = 'infoVersion',
	InfoMcuVersion = 'infoMcuVersion',
	InfoDepSdk = 'infodepsdk',
	InfoHostName = 'infoHostName',
	InfoMacPrimary = 'infoMacPri',
	InfoMacSecondary = 'infoMacSec',
	InfoIpPrimary = 'infoIpPri',
	InfoIpSecondary = 'infoIpSec',
}

type NoOptions = Record<string, never>
type ChannelOptions = { channel: number }
type BooleanFeedback<TOptions> = { type: 'boolean'; options: TOptions }
type ValueFeedback<TOptions> = { type: 'value'; options: TOptions }

export type FeedbackSchema = {
	[FeedbackId.Power]: BooleanFeedback<NoOptions>
	[FeedbackId.OutputMasterMute]: BooleanFeedback<NoOptions>
	[FeedbackId.OutputMasterVolume]: ValueFeedback<NoOptions>
	[FeedbackId.InputMute]: BooleanFeedback<ChannelOptions>
	[FeedbackId.InputP48]: BooleanFeedback<ChannelOptions>
	[FeedbackId.InputGain]: ValueFeedback<ChannelOptions>
	[FeedbackId.InputSensitivity]: ValueFeedback<ChannelOptions>
	[FeedbackId.InputName]: ValueFeedback<ChannelOptions>
	[FeedbackId.InputSignalLevel]: ValueFeedback<ChannelOptions>
	[FeedbackId.OutputMute]: BooleanFeedback<ChannelOptions>
	[FeedbackId.OutputMasterOutMember]: BooleanFeedback<ChannelOptions>
	[FeedbackId.OutputGain]: ValueFeedback<ChannelOptions>
	[FeedbackId.OutputDelay]: ValueFeedback<ChannelOptions>
	[FeedbackId.OutputName]: ValueFeedback<ChannelOptions>
	[FeedbackId.OutputLevel]: ValueFeedback<ChannelOptions>
	[FeedbackId.OutputSignalLevel]: ValueFeedback<ChannelOptions>
	[FeedbackId.PresetValid]: BooleanFeedback<ChannelOptions>
	[FeedbackId.PresetName]: ValueFeedback<ChannelOptions>
	[FeedbackId.InfoModel]: ValueFeedback<NoOptions>
	[FeedbackId.InfoVersion]: ValueFeedback<NoOptions>
	[FeedbackId.InfoMcuVersion]: ValueFeedback<NoOptions>
	[FeedbackId.InfoDepSdk]: ValueFeedback<NoOptions>
	[FeedbackId.InfoHostName]: ValueFeedback<NoOptions>
	[FeedbackId.InfoMacPrimary]: ValueFeedback<NoOptions>
	[FeedbackId.InfoMacSecondary]: ValueFeedback<NoOptions>
	[FeedbackId.InfoIpPrimary]: ValueFeedback<NoOptions>
	[FeedbackId.InfoIpSecondary]: ValueFeedback<NoOptions>
}

type SubscriptionKey = keyof MineolaEvents
type ChannelType = 'Input' | 'Output' | 'Preset'

const defaultStyle = {
	bgcolor: combineRgb(255, 0, 0),
	color: combineRgb(0, 0, 0),
}

/**
 * Registers the feedback against the data it reads. Polling only fetches data something is subscribed to.
 * API 2.x removed the feedback `subscribe` hook, so this runs from inside `callback` — a feedback being evaluated
 * is one in use, and re-registering on every check means it can't drift out of the set while still on a button.
 */
function feedbackSubscribe(self: ModuleInstance, key: SubscriptionKey, feedback: CompanionFeedbackInfo): void {
	self.feedbackSubscriptions[key].add(feedback.id)
}

const feedbackUnsubscribe =
	(self: ModuleInstance, key: SubscriptionKey) =>
	(feedback: CompanionFeedbackInfo): void => {
		self.feedbackSubscriptions[key].delete(feedback.id)
	}

/** Validates a 1-based channel option and returns the 0-based index into the state arrays. */
function getChannelIndex(options: ChannelOptions, name: ChannelType, count: number): number {
	const channel = Number(options.channel)
	if (Number.isNaN(channel)) throw new Error(`${name} is a NaN`)
	if (channel < 1) throw new Error(`${name} is a out of range (below 1): ${channel}`)
	if (channel > count) throw new Error(`${name} is a out of range (above ${count}): ${channel}`)
	return channel - 1
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const simpleBoolean = (
		name: string,
		key: SubscriptionKey,
		getValue: () => boolean,
	): CompanionBooleanFeedbackDefinition<NoOptions> => ({
		type: 'boolean',
		name,
		defaultStyle,
		options: [],
		callback: (feedback) => {
			feedbackSubscribe(self, key, feedback)
			return getValue()
		},
		unsubscribe: feedbackUnsubscribe(self, key),
	})

	const simpleValue = (
		name: string,
		key: SubscriptionKey,
		getValue: () => JsonValue,
	): CompanionValueFeedbackDefinition<NoOptions> => ({
		type: 'value',
		name,
		options: [],
		callback: (feedback) => {
			feedbackSubscribe(self, key, feedback)
			return getValue()
		},
		unsubscribe: feedbackUnsubscribe(self, key),
	})

	const channelBoolean = (
		name: string,
		channelType: ChannelType,
		count: number,
		key: SubscriptionKey,
		getValue: (index: number) => boolean,
	): CompanionBooleanFeedbackDefinition<ChannelOptions> => ({
		type: 'boolean',
		name,
		defaultStyle,
		options: [ChannelOption(count, channelType)],
		callback: (feedback) => {
			// Subscribe before validating, so a feedback with a bad channel still keeps its data polled
			feedbackSubscribe(self, key, feedback)
			return getValue(getChannelIndex(feedback.options, channelType, count))
		},
		unsubscribe: feedbackUnsubscribe(self, key),
	})

	const channelValue = (
		name: string,
		channelType: ChannelType,
		count: number,
		key: SubscriptionKey,
		getValue: (index: number) => JsonValue,
	): CompanionValueFeedbackDefinition<ChannelOptions> => ({
		type: 'value',
		name,
		options: [ChannelOption(count, channelType)],
		callback: (feedback) => {
			feedbackSubscribe(self, key, feedback)
			return getValue(getChannelIndex(feedback.options, channelType, count))
		},
		unsubscribe: feedbackUnsubscribe(self, key),
	})

	const { inputCount, outputCount, presetCount } = self.mineola

	const feedbacks: CompanionFeedbackDefinitions<FeedbackSchema> = {
		// Power & Output Master
		[FeedbackId.Power]: simpleBoolean('Power', 'power', () => self.mineola.power),
		[FeedbackId.OutputMasterMute]: simpleBoolean(
			'Output Master - Mute',
			'outputMaster',
			() => self.mineola.outputMasterMute,
		),
		[FeedbackId.OutputMasterVolume]: simpleValue(
			'Output Master - Volume',
			'outputMaster',
			() => self.mineola.outputMasterVolume,
		),

		// Input
		[FeedbackId.InputMute]: channelBoolean(
			'Input - Mute',
			'Input',
			inputCount,
			'inputs',
			(i) => self.mineola.inputs.input_mute[i],
		),
		[FeedbackId.InputP48]: channelBoolean(
			'Input - Phantom Power',
			'Input',
			inputCount,
			'inputs',
			(i) => self.mineola.inputs.input_phantom_power[i],
		),
		[FeedbackId.InputGain]: channelValue(
			'Input - Gain',
			'Input',
			inputCount,
			'inputs',
			(i) => self.mineola.inputs.input_gain[i],
		),
		[FeedbackId.InputSensitivity]: channelValue(
			'Input - Sensitivity',
			'Input',
			inputCount,
			'inputs',
			(i) => InputSensitivity[self.mineola.inputs.input_sensitivity[i]],
		),
		[FeedbackId.InputName]: channelValue(
			'Input - Name',
			'Input',
			inputCount,
			'inputs',
			(i) => self.mineola.inputs.input_name[i],
		),
		[FeedbackId.InputSignalLevel]: channelValue(
			'Input - Signal Level',
			'Input',
			inputCount,
			'levels',
			(i) => Math.round((self.mineola.levelsInput[i] ?? -200) * 100) / 100, // Round to 2 decimals
		),

		// Output
		[FeedbackId.OutputMute]: channelBoolean(
			'Output - Mute',
			'Output',
			outputCount,
			'outputs',
			(i) => self.mineola.outputs.output_volume_mute[i],
		),
		[FeedbackId.OutputMasterOutMember]: channelBoolean(
			'Output - Master Output Member',
			'Output',
			outputCount,
			'outputs',
			(i) => self.mineola.outputs.master_out_member[i],
		),
		[FeedbackId.OutputGain]: channelValue(
			'Output - Gain',
			'Output',
			outputCount,
			'outputs',
			(i) => self.mineola.outputs.output_gain[i],
		),
		[FeedbackId.OutputDelay]: channelValue(
			'Output - Delay',
			'Output',
			outputCount,
			'outputs',
			(i) => self.mineola.outputs.output_audio_delay[i],
		),
		[FeedbackId.OutputName]: channelValue(
			'Output - Name',
			'Output',
			outputCount,
			'outputs',
			(i) => self.mineola.outputs.output_name[i],
		),
		[FeedbackId.OutputLevel]: channelValue(
			'Output - Output Level',
			'Output',
			outputCount,
			'outputs',
			(i) => OutputLevel[self.mineola.outputs.select_level[i]],
		),
		[FeedbackId.OutputSignalLevel]: channelValue(
			'Output - Signal Level',
			'Output',
			outputCount,
			'levels',
			(i) => Math.round((self.mineola.levelsOutput[i] ?? -200) * 100) / 100, // Round to 2 decimals
		),

		// Preset
		[FeedbackId.PresetValid]: channelBoolean(
			'Preset - Valid',
			'Preset',
			presetCount,
			'presets',
			(i) => self.mineola.presets.valid[i],
		),
		[FeedbackId.PresetName]: channelValue(
			'Preset - Name',
			'Preset',
			presetCount,
			'presets',
			(i) => self.mineola.presets.name[i],
		),

		// Information
		[FeedbackId.InfoModel]: simpleValue('Information - Model Name', 'information', () => self.mineola.info.model_name),
		[FeedbackId.InfoVersion]: simpleValue('Information - Version', 'information', () => self.mineola.info.version),
		[FeedbackId.InfoMcuVersion]: simpleValue(
			'Information - MCU Version',
			'information',
			() => self.mineola.info.mcu_version,
		),
		[FeedbackId.InfoDepSdk]: simpleValue('Information - DEP SDK', 'information', () => self.mineola.info.depsdk),
		[FeedbackId.InfoHostName]: simpleValue(
			'Information - Hostname',
			'information',
			() => self.mineola.info.ip_hostname,
		),
		[FeedbackId.InfoMacPrimary]: simpleValue(
			'Information - MAC Address Primary',
			'information',
			() => self.mineola.info.mac_address,
		),
		[FeedbackId.InfoMacSecondary]: simpleValue(
			'Information - MAC Address Secondary',
			'information',
			() => self.mineola.info.secondary_mac_address,
		),
		[FeedbackId.InfoIpPrimary]: simpleValue(
			'Information - IP Address Primary',
			'information',
			() => self.mineola.info.ip_address,
		),
		[FeedbackId.InfoIpSecondary]: simpleValue(
			'Information - IP Address Secondary',
			'information',
			() => self.mineola.info.secondary_ip_address,
		),
	}

	self.setFeedbackDefinitions(feedbacks)
}
