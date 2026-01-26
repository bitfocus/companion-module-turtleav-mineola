import { type CompanionInputFieldTextInput, Regex } from '@companion-module/base'

export const ChannelOption = (max: number, label = 'Channel'): CompanionInputFieldTextInput => {
	return {
		type: 'textinput',
		id: 'channel',
		label: label,
		description: `${label} 1 to ${max}`,
		default: '1',
		useVariables: { local: true },
		regex: Regex.SOMETHING,
	}
}
