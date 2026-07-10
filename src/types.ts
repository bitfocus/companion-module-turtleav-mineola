export type HttpMessage = Record<string, string | number> & { comhead: ComHeadMessageTypes }

export const GetMessage = [
	'get_output_status',
	'get_input_status',
	'get_preset_status',
	'get_information_status',
	'get_peq_status',
	'get_level', // Only supported on websocket
	'get_system_status',
	'get_dsp_status',
	'get_network',
	'export_data',
] as const

export type GetMessage = (typeof GetMessage)[number]

export const SetMessage = [
	'set_master_mute',
	'set_master_out_member',
	'set_master_volume',
	'set_power',
	'set_save_preset',
	'set_recall_preset',
	'set_clear_preset',
	'set_preset_name',
	'set_output_name',
	'set_output_gain',
	'set_output_level',
	'set_output_delay',
	'set_output_mute',
	'set_input_gain',
	'set_input_phantom_power',
	'set_input_mute',
	'set_input_sensitivity',
	'set_input_name',
	'set_peq_reset',
	'set_peq_preset',
	'set_peq_bypass',
	'set_peq',
	'set_standby_mode',
	'set_auto_standby_time',
	'set_login_password',
	'set_logout',
	'set_login',
	'set_system_reboot',
] as const

export type SetMessage = (typeof SetMessage)[number]

export type ComHeadMessageTypes = GetMessage | SetMessage

export const OutputLevel = ['+20dBu', '+14dBu', '+4dBu', '0dBV', '-18dBV'] as const
export type OutputLevel = (typeof OutputLevel)[number]

export const InputSensitivity = ['+24dBu', '+14dBu', '+4dBu', '0dBV', '-18dBV', '-35dBV'] as const
export type InputSensitivity = (typeof InputSensitivity)[number]

export const EqTypes = ['PARAMETRIC', 'HIGHPASS', 'LOWPASS', 'HIGH_SHELF', 'LOW_SHELF'] as const
export type EqTypes = (typeof EqTypes)[number]
