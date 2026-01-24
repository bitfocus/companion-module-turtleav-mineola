export type HttpMessage = Record<string, string | number> & { comhead: ComHeadMessageTypes }

export const GetMessage = [
	'get_output_status',
	'get_input_status',
	'get_preset_status',
	'get_information_status',
] as const

export type GetMessage = (typeof GetMessage)[number]

export const SetMessage = ['set_master_mute', 'set_master_out_member', 'set_master_volume', 'set_power'] as const

export type SetMessage = (typeof SetMessage)[number]

export type ComHeadMessageTypes = GetMessage | SetMessage
