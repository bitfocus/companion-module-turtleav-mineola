import { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { SetOrErrorResponseSchema } from './schemas.js'

function rangeLimitNumber(value: number, min = 0, max = 100): number {
	if (Number.isNaN(value)) throw new Error('Value is a NaN')
	if (value < min) return min
	if (value > max) return max
	return value
}

export function UpdateActions(self: ModuleInstance): void {
	const actions: CompanionActionDefinitions = {}
	actions.power = {
		name: 'Power',
		options: [
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: [
					{ id: 0, label: 'Off' },
					{ id: 1, label: 'On' },
					{ id: 2, label: 'Toggle' },
				],
				default: 2,
				allowCustom: false,
			},
		],
		callback: async (action, _context) => {
			let state = Number(action.options.state ?? 2)
			if (state == 2) state = 1 - Number(self.mineola.power)
			const response = await self.httpPost({ comhead: 'set_power', power: state })
			const msg = SetOrErrorResponseSchema.parse(response.data)
			if ('error' in msg) throw new Error(msg.error)
			if (msg.result == 1 && msg.comhead == 'set_power') self.mineola.power = Boolean(state)
		},
	}
	actions.outputMasterMute = {
		name: 'Output Master - Mute',
		options: [
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: [
					{ id: 0, label: 'On' },
					{ id: 1, label: 'Muted' },
					{ id: 2, label: 'Toggle' },
				],
				default: 2,
				allowCustom: false,
			},
		],
		callback: async (action, _context) => {
			let state = Number(action.options.state ?? 2)
			if (state == 2) state = 1 - Number(self.mineola.outputMasterMute)
			const response = await self.httpPost({ comhead: 'set_master_mute', mute: state })
			const msg = SetOrErrorResponseSchema.parse(response.data)
			if ('error' in msg) throw new Error(msg.error)
			if (msg.result == 1 && msg.comhead == 'set_master_mute') self.mineola.outputMasterMute = Boolean(state)
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
		callback: async (action, _context) => {
			let value = Number.parseInt(action.options.volume?.toString() ?? '')
			if (action.options.relative) value += self.mineola.outputMasterVolume
			value = rangeLimitNumber(value, 0, 100)
			const response = await self.httpPost({ comhead: 'set_master_volume', volume: value })
			const msg = SetOrErrorResponseSchema.parse(response.data)
			if ('error' in msg) throw new Error(msg.error)
			if (msg.result == 1 && msg.comhead == 'set_master_volume') self.mineola.outputMasterVolume = value
		},
	}
	actions.outputMasterMute = {
		name: 'Output - Master Output Member',
		options: [
			{
				type: 'dropdown',
				id: 'output',
				label: 'Output',
				choices: self.mineola.outputChoices,
				default: self.mineola.outputChoices[0].id ?? 'No valid outputs',
			},
			{
				type: 'dropdown',
				id: 'state',
				label: 'State',
				choices: [
					{ id: 0, label: 'Off' },
					{ id: 1, label: 'On' },
					{ id: 2, label: 'Toggle' },
				],
				default: 2,
				allowCustom: false,
			},
		],
		callback: async (action, _context) => {
			const out = Number(action.options.output)
			let state = Number(action.options.state ?? 2)
			if (state == 2) state = 1 - Number(self.mineola.outputs.master_out_member[out])
			const response = await self.httpPost({ comhead: 'set_master_out_member', source: out, onoff: state })
			const msg = SetOrErrorResponseSchema.parse(response.data)
			if ('error' in msg) throw new Error(msg.error)
			if (msg.result == 1 && msg.comhead == 'set_master_out_member')
				self.mineola.outputMasterMember = { source: out, onoff: Boolean(state) }
		},
	}
	self.setActionDefinitions(actions)
}
