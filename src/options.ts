import { type CompanionInputFieldTextInput } from '@companion-module/base'

export const ChannelOption = (max: number, label = 'Channel'): CompanionInputFieldTextInput => {
	return {
		type: 'textinput',
		id: 'channel',
		label: label,
		description: `${label} 1 to ${max}`,
		default: '1',
		useVariables: { local: true },
		regex: '/^([1-9]\\d?|\\$\\(.{3,}\\))$/', // Accept a 1 or two digit number between 1 and 99 or some companion variable(s)
	}
}
