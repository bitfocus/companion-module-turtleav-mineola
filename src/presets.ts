import {
	combineRgb,
	type CompanionLayeredButtonPresetDefinition,
	type CompanionPresetDefinitions,
	type CompanionPresetSection,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleTypes } from './main.js'
import { ActionId, MUTE_CHOICES } from './actions.js'
import { FeedbackId } from './feedbacks.js'
import { CompositeElementId, METER_PADDING, METER_THICKNESS } from './composites.js'

export enum PresetId {
	InputChannel = 'input_channel',
	OutputChannel = 'output_channel',
}

const colors = {
	white: combineRgb(255, 255, 255),
	black: combineRgb(0, 0, 0),
	red: combineRgb(255, 0, 0),
}

/** The local variable each channel preset is templated over, taking the values 1 to the channel count */
export const CHANNEL_VARIABLE = 'channel'
const CHANNEL = { isExpression: true, value: `$(local:${CHANNEL_VARIABLE})` } as const

/** Element ids, referenced by the mute feedback's style override */
const ELEMENT = { background: 'background', name: 'name', meter: 'meter' } as const

type ChannelKind = 'input' | 'output'

const CHANNEL_IDS = {
	input: {
		label: 'Input',
		presetId: PresetId.InputChannel,
		name: FeedbackId.InputName,
		level: FeedbackId.InputSignalLevel,
		mute: FeedbackId.InputMute,
		toggleMute: ActionId.InputMute,
	},
	output: {
		label: 'Output',
		presetId: PresetId.OutputChannel,
		name: FeedbackId.OutputName,
		level: FeedbackId.OutputSignalLevel,
		mute: FeedbackId.OutputMute,
		toggleMute: ActionId.OutputMute,
	},
} as const

/**
 * One input or output: its name on a black background, a signal meter along the bottom edge, red while muted, and a
 * press toggles the mute. Name and level come from value feedbacks into local variables, so the button tracks the
 * channel named by its own `channel` variable.
 */
function channelPreset(kind: ChannelKind): CompanionLayeredButtonPresetDefinition<ModuleTypes> {
	const ids = CHANNEL_IDS[kind]
	return {
		type: 'layered',
		name: `${ids.label} Channel`,
		keywords: [ids.label, 'mute', 'meter', 'level', 'name'],
		localVariables: [
			{ variableType: 'simple', variableName: CHANNEL_VARIABLE, startupValue: 1 },
			{ variableType: 'feedback', variableName: 'name', feedbackId: ids.name, options: { channel: CHANNEL } },
			{ variableType: 'feedback', variableName: 'level', feedbackId: ids.level, options: { channel: CHANNEL } },
		],
		elements: [
			{
				type: 'box',
				id: ELEMENT.background,
				name: 'Background',
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				color: colors.black,
			},
			{
				type: 'text',
				id: ELEMENT.name,
				name: 'Name',
				x: 0,
				y: 0,
				width: 100,
				// Stops above the meter, so a long name never runs under the bar
				height: 100 - METER_PADDING - METER_THICKNESS,
				text: '$(local:name)',
				fontsize: 22,
				fontsizeAllowShrink: true,
				color: colors.white,
				halign: 'center',
				valign: 'center',
			},
			{
				type: 'composite',
				id: ELEMENT.meter,
				name: 'Signal Meter',
				elementId: CompositeElementId.Meter,
				options: {
					level: { isExpression: true, value: '$(local:level)' },
					position: 'bottom',
					padding: METER_PADDING,
				},
			},
		],
		feedbacks: [
			{
				feedbackId: ids.mute,
				options: { channel: CHANNEL },
				// Wrapped, not a bare colour: Companion drops overrides that are not an ExpressionOrValue, and a feedback left
				// with none is dropped entirely, even though the base types accept the bare value
				styleOverrides: [
					{
						elementId: ELEMENT.background,
						elementProperty: 'color',
						override: { isExpression: false, value: colors.red },
					},
				],
			},
		],
		steps: [
			{
				down: [{ actionId: ids.toggleMute, options: { channel: CHANNEL, state: MUTE_CHOICES[2].id } }],
				up: [],
			},
		],
	}
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleTypes> = {
		[PresetId.InputChannel]: channelPreset('input'),
		[PresetId.OutputChannel]: channelPreset('output'),
	}

	const templateValues = (label: string, names: readonly string[]) =>
		names.map((name, index) => ({ name: `${label} ${index + 1}: ${name}`, value: index + 1 }))

	const structure: CompanionPresetSection<ModuleTypes>[] = [
		{
			id: 'channels',
			name: 'Channels',
			definitions: [
				{
					id: 'inputs',
					type: 'template',
					name: 'Inputs',
					presetId: PresetId.InputChannel,
					templateVariableName: CHANNEL_VARIABLE,
					templateValues: templateValues('Input', self.mineola.inputs.input_name),
				},
				{
					id: 'outputs',
					type: 'template',
					name: 'Outputs',
					presetId: PresetId.OutputChannel,
					templateVariableName: CHANNEL_VARIABLE,
					templateValues: templateValues('Output', self.mineola.outputs.output_name),
				},
			],
		},
	]

	self.setPresetDefinitions(structure, presets)
}
