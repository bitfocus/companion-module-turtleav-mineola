import { describe, expect, it, vi } from 'vitest'
import type {
	CompanionActionDefinitions,
	CompanionActionEvent,
	CompanionActionLearnContext,
} from '@companion-module/base'
import { ActionId, UpdateActions, type ActionSchema } from '../actions.js'
import type ModuleInstance from '../main.js'

/**
 * Mineola replaces its whole inputs / outputs / presets object when a poll or websocket message brings changed
 * data (see #updateInputs in mineola.ts), while definitions are only built once at connect. So anything a
 * definition reads must be looked up at call time, not captured when the definition is built.
 */
function fakeInstance() {
	const mineola = {
		inputCount: 2,
		outputCount: 2,
		presetCount: 2,
		inputs: { input_name: ['In 1', 'In 2'] },
		outputs: { output_name: ['Out 1', 'Out 2'] },
		presets: { name: ['Preset 1', 'Preset 2'] },
	}
	const setActionDefinitions = vi.fn<(defs: CompanionActionDefinitions<ActionSchema>) => void>()
	const self = { mineola, setActionDefinitions } as unknown as ModuleInstance
	UpdateActions(self)
	return { mineola, defs: setActionDefinitions.mock.calls[0][0] }
}

type FakeMineola = ReturnType<typeof fakeInstance>['mineola']
type NameActionId = ActionId.InputName | ActionId.OutputName | ActionId.PresetName

async function learnName(defs: CompanionActionDefinitions<ActionSchema>, id: NameActionId, channel: number) {
	const learn = defs[id] ? defs[id].learn : undefined
	if (!learn) throw new Error(`${id} has no learn`)
	const event: CompanionActionEvent<ActionSchema[NameActionId]['options']> = {
		id: 'action-1',
		controlId: 'bank-1',
		actionId: id,
		surfaceId: undefined,
		options: { channel, name: '' },
	}
	return await learn(event, {} as CompanionActionLearnContext)
}

describe('name action learn', () => {
	const cases: { id: NameActionId; replace: (m: FakeMineola) => void; expected: string }[] = [
		{ id: ActionId.InputName, replace: (m) => (m.inputs = { input_name: ['Kick', 'Snare'] }), expected: 'Snare' },
		{ id: ActionId.OutputName, replace: (m) => (m.outputs = { output_name: ['PA L', 'PA R'] }), expected: 'PA R' },
		{ id: ActionId.PresetName, replace: (m) => (m.presets = { name: ['Show', 'Rehearsal'] }), expected: 'Rehearsal' },
	]

	it.each(cases)('$id returns the current name after the device state object is replaced', async (c) => {
		const { mineola, defs } = fakeInstance()
		c.replace(mineola)

		expect(await learnName(defs, c.id, 2)).toEqual({ name: c.expected })
	})

	it('reads the 1-based channel', async () => {
		const { defs } = fakeInstance()
		expect(await learnName(defs, ActionId.InputName, 1)).toEqual({ name: 'In 1' })
	})
})

describe('dropdown defaults', () => {
	// Defaults reference their choices list rather than repeating the id, and this holds them to it
	it('every dropdown default is one of its own choices', () => {
		const { defs } = fakeInstance()
		let checked = 0
		for (const [id, def] of Object.entries(defs)) {
			if (!def) continue
			for (const option of def.options) {
				if (option.type !== 'dropdown') continue
				expect(
					option.choices.map((choice) => choice.id),
					`${id}.${option.id}`,
				).toContain(option.default)
				checked++
			}
		}
		expect(checked).toBeGreaterThan(0)
	})
})
