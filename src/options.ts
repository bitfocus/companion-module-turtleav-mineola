import type { CompanionInputFieldTextInput } from '@companion-module/base'

export const ChannelOption = (max: number): CompanionInputFieldTextInput => {
	return {
		type: 'textinput',
		id: 'channel',
		label: 'Channel',
		description: `Channel 1 to ${max}`,
		default: '1',
		useVariables: { local: true },
	}
}
