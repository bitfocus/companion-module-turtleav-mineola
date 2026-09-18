import {
	combineRgb,
	type CompanionGraphicsCompositeElementDefinitions,
	type DropdownChoice,
} from '@companion-module/base'
import type ModuleInstance from './main.js'

/**
 * Composite graphics elements this module offers for layered buttons. The meter is modelled on the `vumeter`
 * composite in companion-module-glensound-divine, with the same bar thickness, end inset and edge padding, so
 * meters from the two modules line up on a page.
 */
export enum CompositeElementId {
	Meter = 'meter',
}

export const MeterPosition = ['left', 'right', 'top', 'bottom'] as const
export type MeterPosition = (typeof MeterPosition)[number]

const POSITION_CHOICES = [
	{ id: 'left', label: 'Left' },
	{ id: 'right', label: 'Right' },
	{ id: 'top', label: 'Top' },
	{ id: 'bottom', label: 'Bottom' },
] as const satisfies DropdownChoice<MeterPosition>[]

export type CompositeElementSchema = {
	[CompositeElementId.Meter]: { options: { level: number; position: MeterPosition; padding: number } }
}

/** Percentage of the button taken up by the short axis of the bar */
export const METER_THICKNESS = 8
/** Percentage inset at each end of the bar's long axis */
const METER_INSET = 6
const METER_LENGTH = 100 - METER_INSET * 2
/** Default distance of the bar from the edge of the button, as a percentage */
export const METER_PADDING = 2

/**
 * The dB span of the bar. Companion maps the value and the colour stops through the gauge's min..max and clamps
 * the value to the track, so the device's -200 for silence draws an empty bar.
 */
export const METER_FLOOR_DB = -60
export const METER_CEILING_DB = 0

/**
 * How much of its colour the unfilled part of the bar keeps, 0 - 100. At 100 it matches the fill and a silent
 * meter looks full scale; Companion's own default is 70.
 */
export const METER_TRACK_AMOUNT = 20

/**
 * Colour stops, each the level at which its colour is reached. Every stop is a gradient, so the gauge blends each
 * colour into the next; the last, red, has nothing to blend into and runs solid from -6 dB to the top of the bar.
 */
export const METER_STOPS = [
	{ db: METER_FLOOR_DB, color: combineRgb(0, 100, 0) }, // dark green
	{ db: -40, color: combineRgb(0, 204, 0) }, // green
	{ db: -20, color: combineRgb(255, 255, 0) }, // yellow
	{ db: -12, color: combineRgb(255, 191, 0) }, // amber
	{ db: -6, color: combineRgb(255, 0, 0) }, // red
] as const

const POSITION = `$(options:position)`
const PADDING = `$(options:padding)`
const IS_VERTICAL = `(${POSITION} == 'left' || ${POSITION} == 'right')`

export function UpdateCompositeElements(self: ModuleInstance): void {
	const compositeElements: CompanionGraphicsCompositeElementDefinitions<CompositeElementSchema> = {
		[CompositeElementId.Meter]: {
			type: 'composite',
			name: 'Signal Meter',
			description: `A bargraph meter for a signal level from ${METER_FLOOR_DB} to ${METER_CEILING_DB} dB. Feed it a level, e.g. a local variable driven by the Signal Level feedback`,
			options: [
				{
					type: 'number',
					label: 'Level (dB)',
					id: 'level',
					tooltip: 'Set this to a signal level, e.g. $(local:level)',
					min: -200,
					max: 0,
					default: -200,
				},
				{
					type: 'dropdown',
					label: 'Position',
					id: 'position',
					choices: POSITION_CHOICES,
					default: POSITION_CHOICES[3].id,
				},
				{
					type: 'number',
					label: 'Padding',
					id: 'padding',
					tooltip: 'Distance from the edge of the button, as a percentage',
					min: 0,
					max: 40,
					default: METER_PADDING,
				},
			],
			elements: [
				{
					type: 'gauge',
					name: 'Meter',
					x: {
						isExpression: true,
						value: `${POSITION} == 'left' ? ${PADDING} : (${POSITION} == 'right' ? 100 - ${PADDING} - ${METER_THICKNESS} : ${METER_INSET})`,
					},
					y: {
						isExpression: true,
						value: `${POSITION} == 'top' ? ${PADDING} : (${POSITION} == 'bottom' ? 100 - ${PADDING} - ${METER_THICKNESS} : ${METER_INSET})`,
					},
					width: { isExpression: true, value: `${IS_VERTICAL} ? ${METER_THICKNESS} : ${METER_LENGTH}` },
					height: { isExpression: true, value: `${IS_VERTICAL} ? ${METER_LENGTH} : ${METER_THICKNESS}` },
					orientation: { isExpression: true, value: `${IS_VERTICAL} ? 'vertical' : 'horizontal'` },
					min: METER_FLOOR_DB,
					max: METER_CEILING_DB,
					value: { isExpression: true, value: '$(options:level)' },
					fillEnabled: true,
					multiColour: true,
					trackStyle: 'dimmed',
					trackAmount: METER_TRACK_AMOUNT,
					stops: METER_STOPS.map((stop) => ({ value: stop.db, color: stop.color, gradient: true })),
				},
			],
		},
	}

	self.setCompositeElementDefinitions(compositeElements)
}
