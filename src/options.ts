import type { CompanionInputFieldNumber } from '@companion-module/base'

/**
 * 1-based channel selector. Was a `textinput` before API 2.0 — UpgradeScripts[0] converts saved values.
 * Variables and expressions are handled by Companion's expression mode, so no regex or `useVariables` is needed.
 */
export const ChannelOption = (max: number, label = 'Channel'): CompanionInputFieldNumber<'channel'> => {
	return {
		type: 'number',
		id: 'channel',
		label: label,
		description: `${label} 1 to ${max}`,
		default: 1,
		min: 1,
		max: max,
		asInteger: true,
	}
}
