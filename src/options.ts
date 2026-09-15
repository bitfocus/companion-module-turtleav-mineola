import type { CompanionInputFieldDropdown } from '@companion-module/base'

/**
 * 1-based channel selector, labelled "#: Name" from the device's current names.
 *
 * The ids are the same 1-based numbers the option has stored since UpgradeScripts[0], so saved buttons still match.
 * Because the labels carry names, the definitions must be rebuilt when a name changes — Mineola emits
 * `channelNames` for that, and the instance rebuilds on it.
 */
export const ChannelOption = (
	names: readonly string[],
	label = 'Channel',
): CompanionInputFieldDropdown<'channel', number> => {
	return {
		type: 'dropdown',
		id: 'channel',
		label: label,
		// Channel 1. A literal because the choices are built from device names at runtime, so there is no fixed entry to reference
		default: 1,
		allowCustom: false,
		choices: names.map((name, index) => ({ id: index + 1, label: `${index + 1}: ${name}` })),
	}
}
