import { describe, expect, it, vi } from 'vitest'
import type {
	CompanionMigrationAction,
	CompanionMigrationFeedback,
	CompanionStaticUpgradeProps,
	CompanionUpgradeContext,
} from '@companion-module/base'
import { UpgradeScripts, numericActionOptionsApi2, numericFeedbackOptionsApi2 } from '../upgrades.js'
import { ActionId, UpdateActions } from '../actions.js'
import { FeedbackId, UpdateFeedbacks } from '../feedbacks.js'
import type ModuleInstance from '../main.js'
import type { ModuleConfig } from '../config.js'

/**
 * Upgrade scripts are order-sensitive: a stored upgrade index records how far a configuration has been migrated,
 * so scripts may only ever be appended. Pin the index rather than taking the last entry, so appending a script
 * can't silently retarget this suite.
 */
const API2_NUMERIC_SCRIPT_INDEX = 0
const EXPECTED_SCRIPT_COUNT = 1

// Options reach upgrade scripts already wrapped as ExpressionOrValue — Companion does that before running them
const v = (value: unknown) => ({ isExpression: false, value })

function action(actionId: string, options: Record<string, unknown>): CompanionMigrationAction {
	return {
		id: `action-${actionId}`,
		controlId: 'bank-1',
		actionId,
		options: options as CompanionMigrationAction['options'],
	}
}

function feedback(feedbackId: string, options: Record<string, unknown>): CompanionMigrationFeedback {
	return {
		id: `feedback-${feedbackId}`,
		controlId: 'bank-1',
		feedbackId,
		options: options as CompanionMigrationFeedback['options'],
	}
}

function run(actions: CompanionMigrationAction[], feedbacks: CompanionMigrationFeedback[] = []) {
	return UpgradeScripts[API2_NUMERIC_SCRIPT_INDEX]({} as CompanionUpgradeContext<ModuleConfig>, {
		config: null,
		secrets: null,
		actions,
		feedbacks,
	} satisfies CompanionStaticUpgradeProps<ModuleConfig, undefined>)
}

describe('API 2.0 numeric option upgrade script', () => {
	it('sits at the index this suite targets', () => {
		// Appending a script is fine — bump EXPECTED_SCRIPT_COUNT. Never insert, reorder or remove one.
		expect(UpgradeScripts).toHaveLength(EXPECTED_SCRIPT_COUNT)
	})

	it('converts a stored channel string to a number', () => {
		const existing = action(ActionId.OutputMute, { channel: v('3'), state: v(2) })
		const result = run([existing])

		expect(result.updatedActions).toEqual([existing])
		expect(existing.options.channel).toEqual({ isExpression: false, value: 3 })
	})

	it('converts volume, gain and delay, keeping sign and decimals', () => {
		const volume = action(ActionId.OutputMasterVolume, { volume: v('-5'), relative: v(true) })
		const inputGain = action(ActionId.InputGain, { channel: v('2'), gain: v('1.5'), relative: v(false) })
		const delay = action(ActionId.OutputDelay, { channel: v('16'), delay: v('25'), relative: v(false) })
		run([volume, inputGain, delay])

		expect(volume.options.volume).toEqual({ isExpression: false, value: -5 })
		expect(inputGain.options.gain).toEqual({ isExpression: false, value: 1.5 })
		expect(inputGain.options.channel).toEqual({ isExpression: false, value: 2 })
		expect(delay.options.delay).toEqual({ isExpression: false, value: 25 })
	})

	it('turns a variable into an expression', () => {
		const existing = action(ActionId.InputMute, { channel: v('$(internal:custom_ch)'), state: v(1) })
		run([existing])

		expect(existing.options.channel).toEqual({ isExpression: true, value: '$(internal:custom_ch)' })
	})

	it('wraps mixed text and variables in parseVariables', () => {
		const existing = action(ActionId.OutputGain, { channel: v('1'), gain: v('-$(internal:g)'), relative: v(true) })
		run([existing])

		expect(existing.options.gain).toEqual({ isExpression: true, value: 'parseVariables("-$(internal:g)")' })
	})

	it('leaves non-numeric options alone, including a name that looks like a number', () => {
		const existing = action(ActionId.InputName, { channel: v('1'), name: v('12') })
		run([existing])

		expect(existing.options.name).toEqual(v('12'))
		expect(existing.options.channel).toEqual({ isExpression: false, value: 1 })
	})

	it('does not report actions it had nothing to convert', () => {
		const power = action(ActionId.Power, { state: v(2) })
		const alreadyNumber = action(ActionId.PresetRecall, { channel: v(4) })
		const alreadyExpression = action(ActionId.PresetSave, { channel: { isExpression: true, value: '1 + 1' } })
		const missingOption = action(ActionId.PresetClear, {})
		const result = run([power, alreadyNumber, alreadyExpression, missingOption])

		expect(result.updatedActions).toEqual([])
		expect(alreadyExpression.options.channel).toEqual({ isExpression: true, value: '1 + 1' })
	})

	it('converts feedback channels, and skips feedbacks without one', () => {
		const channelFeedback = feedback(FeedbackId.OutputLevel, { channel: v('8') })
		const infoFeedback = feedback(FeedbackId.InfoModel, {})
		const result = run([], [channelFeedback, infoFeedback])

		expect(result.updatedFeedbacks).toEqual([channelFeedback])
		expect(channelFeedback.options.channel).toEqual({ isExpression: false, value: 8 })
		expect(result.updatedConfig).toBeNull()
	})
})

type DefinitionLike = { options: { id: string; type: string; choices?: { id: unknown }[] }[] } | undefined

/** Enough of the instance for the definition builders, which only read counts and state arrays up front. */
function fakeInstance() {
	const names = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`)
	const setActionDefinitions = vi.fn<(defs: Record<string, DefinitionLike>) => void>()
	const setFeedbackDefinitions = vi.fn<(defs: Record<string, DefinitionLike>) => void>()
	const self = {
		mineola: {
			inputCount: 4,
			outputCount: 4,
			presetCount: 5,
			inputs: { input_name: names('In', 4) },
			outputs: { output_name: names('Out', 4) },
			presets: { name: names('Preset', 5) },
		},
		setActionDefinitions,
		setFeedbackDefinitions,
	} as unknown as ModuleInstance
	return { self, setActionDefinitions, setFeedbackDefinitions }
}

describe('upgrade maps match the current definitions', () => {
	const { self, setActionDefinitions, setFeedbackDefinitions } = fakeInstance()
	UpdateActions(self)
	UpdateFeedbacks(self)
	const actionDefs = setActionDefinitions.mock.calls[0][0]
	const feedbackDefs = setFeedbackDefinitions.mock.calls[0][0]

	// The script stores numbers, so each converted option must still hold a number: a number field, or a dropdown
	// whose choice ids are numbers (channel became one after the migration, keeping the same 1-based values)
	const numericOptionIds = (def: DefinitionLike) =>
		def?.options
			.filter(
				(o) =>
					o.type === 'number' ||
					(o.type === 'dropdown' && o.choices !== undefined && o.choices.every((c) => typeof c.id === 'number')),
			)
			.map((o) => o.id)

	it('defines every action and feedback id in the enums', () => {
		expect(Object.keys(actionDefs).sort()).toEqual(Object.values(ActionId).sort())
		expect(Object.keys(feedbackDefs).sort()).toEqual(Object.values(FeedbackId).sort())
	})

	it.each(Object.entries(numericActionOptionsApi2))('action %s: converted options hold numbers', (id, keys) => {
		expect(numericOptionIds(actionDefs[id])).toEqual(expect.arrayContaining(keys))
	})

	it.each(Object.entries(numericFeedbackOptionsApi2))('feedback %s: converted options hold numbers', (id, keys) => {
		expect(numericOptionIds(feedbackDefs[id])).toEqual(expect.arrayContaining(keys))
	})
})
