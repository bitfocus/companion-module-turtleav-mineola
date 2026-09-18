import { describe, expect, it, vi } from 'vitest'
import type {
	CompanionGraphicsCompositeElementDefinitions,
	CompanionPresetDefinitions,
	CompanionPresetSection,
} from '@companion-module/base'
import { UpdatePresets, PresetId, CHANNEL_VARIABLE } from '../presets.js'
import {
	UpdateCompositeElements,
	CompositeElementId,
	METER_FLOOR_DB,
	METER_CEILING_DB,
	METER_PADDING,
	METER_TRACK_AMOUNT,
	type CompositeElementSchema,
} from '../composites.js'
import { ActionId, MUTE_CHOICES } from '../actions.js'
import { FeedbackId } from '../feedbacks.js'
import type ModuleInstance from '../main.js'
import type { ModuleTypes } from '../main.js'
import { createMineola2x2 } from './fixtures.js'

// Built against the captured 2x2 device state: inputs "Ch 1a" / "XLR IN 2", outputs "XLR OUT 1" / "XLR OUT 2"
function build() {
	const setPresetDefinitions =
		vi.fn<
			(structure: CompanionPresetSection<ModuleTypes>[], presets: CompanionPresetDefinitions<ModuleTypes>) => void
		>()
	const setCompositeElementDefinitions =
		vi.fn<(defs: CompanionGraphicsCompositeElementDefinitions<CompositeElementSchema>) => void>()
	const self = {
		mineola: createMineola2x2(),
		setPresetDefinitions,
		setCompositeElementDefinitions,
	} as unknown as ModuleInstance
	UpdatePresets(self)
	UpdateCompositeElements(self)
	const [structure, presets] = setPresetDefinitions.mock.calls[0]
	const composites = setCompositeElementDefinitions.mock.calls[0][0]
	return { structure, presets, composites }
}

const CHANNEL = { isExpression: true, value: `$(local:${CHANNEL_VARIABLE})` }
const PRESET_IDS = [PresetId.InputChannel, PresetId.OutputChannel]

describe('channel presets', () => {
	it('offers Inputs and Outputs groups, one preset per channel', () => {
		const { structure } = build()

		expect(structure).toHaveLength(1)
		expect(structure[0].definitions).toEqual([
			{
				id: 'inputs',
				type: 'template',
				name: 'Inputs',
				presetId: PresetId.InputChannel,
				templateVariableName: 'channel',
				templateValues: [
					{ name: 'Input 1: Ch 1a', value: 1 },
					{ name: 'Input 2: XLR IN 2', value: 2 },
				],
			},
			{
				id: 'outputs',
				type: 'template',
				name: 'Outputs',
				presetId: PresetId.OutputChannel,
				templateVariableName: 'channel',
				templateValues: [
					{ name: 'Output 1: XLR OUT 1', value: 1 },
					{ name: 'Output 2: XLR OUT 2', value: 2 },
				],
			},
		])
	})

	it.each([
		{
			presetId: PresetId.InputChannel,
			name: FeedbackId.InputName,
			level: FeedbackId.InputSignalLevel,
			mute: FeedbackId.InputMute,
			toggleMute: ActionId.InputMute,
		},
		{
			presetId: PresetId.OutputChannel,
			name: FeedbackId.OutputName,
			level: FeedbackId.OutputSignalLevel,
			mute: FeedbackId.OutputMute,
			toggleMute: ActionId.OutputMute,
		},
	])('$presetId: name, meter, red on mute, press toggles mute', (ids) => {
		const { presets } = build()

		expect(presets[ids.presetId]).toMatchObject({
			type: 'layered',
			localVariables: [
				{ variableType: 'simple', variableName: 'channel', startupValue: 1 },
				{ variableType: 'feedback', variableName: 'name', feedbackId: ids.name, options: { channel: CHANNEL } },
				{ variableType: 'feedback', variableName: 'level', feedbackId: ids.level, options: { channel: CHANNEL } },
			],
			elements: [
				{ type: 'box', id: 'background', color: 0x000000 },
				{ type: 'text', id: 'name', text: '$(local:name)', color: 0xffffff },
				{
					type: 'composite',
					id: 'meter',
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
					styleOverrides: [
						{ elementId: 'background', elementProperty: 'color', override: { isExpression: false, value: 0xff0000 } },
					],
				},
			],
			steps: [
				{
					down: [{ actionId: ids.toggleMute, options: { channel: CHANNEL, state: MUTE_CHOICES[2].id } }],
					up: [],
				},
			],
		})
	})

	/**
	 * Companion's layered preset converter keeps only style overrides whose value is an ExpressionOrValue, then drops
	 * any feedback left with none (companion/lib/Instance/Connection/Thread/PresetsLayered.ts). The base types accept
	 * a bare value, so a bare colour compiled, and the mute feedback silently vanished from the placed button.
	 */
	it('wraps every style override value, or Companion drops the feedback', () => {
		const { presets } = build()
		let checked = 0
		for (const id of PRESET_IDS) {
			const preset = presets[id]
			if (preset?.type !== 'layered') throw new Error(`${id} is not a layered preset`)
			for (const feedback of preset.feedbacks) {
				for (const { override } of feedback.styleOverrides) {
					expect(override).toEqual({ isExpression: expect.any(Boolean), value: expect.anything() })
					checked++
				}
			}
		}
		expect(checked).toBe(PRESET_IDS.length)
	})

	it('toggles, rather than sets, the mute', () => {
		expect(MUTE_CHOICES[2].label).toBe('Toggle')
	})
})

describe('signal meter composite', () => {
	function meter() {
		const { composites } = build()
		const definition = composites[CompositeElementId.Meter]
		if (!definition) throw new Error('meter composite missing')
		return definition
	}

	it('is horizontal along the bottom edge by default', () => {
		const definition = meter()

		expect(definition.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'position', default: 'bottom' }),
				expect.objectContaining({ id: 'padding', default: METER_PADDING }),
			]),
		)
		expect(definition.elements[0]).toMatchObject({
			type: 'gauge',
			orientation: {
				isExpression: true,
				value: "($(options:position) == 'left' || $(options:position) == 'right') ? 'vertical' : 'horizontal'",
			},
		})
	})

	it('runs from -60 to 0 dB, fed the level directly', () => {
		// Companion maps both the value and the stops through min..max and clamps the value to the track, so a
		// silent -200 draws an empty bar
		expect([METER_FLOOR_DB, METER_CEILING_DB]).toEqual([-60, 0])
		expect(meter().elements[0]).toMatchObject({
			min: -60,
			max: 0,
			value: { isExpression: true, value: '$(options:level)' },
		})
	})

	/**
	 * trackAmount is how much of its colour the unfilled track keeps: at 100 it matches the fill, so a silent meter
	 * looked full scale. Companion's own default is 70.
	 */
	it('dims the unfilled track, so an empty meter reads as empty', () => {
		expect(METER_TRACK_AMOUNT).toBeLessThan(50)
		expect(meter().elements[0]).toMatchObject({ trackStyle: 'dimmed', trackAmount: METER_TRACK_AMOUNT })
	})

	it('shades dark green to green at -40, yellow at -20, amber at -12 and red at -6 dB', () => {
		// Every stop blends into the next; the last, red, is solid from -6 to 0 dB as nothing follows it
		expect(meter().elements[0]).toMatchObject({
			stops: [
				{ value: -60, color: 0x006400, gradient: true },
				{ value: -40, color: 0x00cc00, gradient: true },
				{ value: -20, color: 0xffff00, gradient: true },
				{ value: -12, color: 0xffbf00, gradient: true },
				{ value: -6, color: 0xff0000, gradient: true },
			],
		})
	})

	it('is referenced by the presets under its own id', () => {
		const { presets } = build()
		for (const id of PRESET_IDS) {
			expect(JSON.stringify(presets[id])).toContain(`"elementId":"${CompositeElementId.Meter}"`)
		}
	})
})
