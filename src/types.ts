export type HttpMessage = Record<string, string | number> & { comhead: ComHeadMessageTypes }

export const GetMessage = [
	'get_output_status',
	'get_input_status',
	'get_preset_status',
	'get_information_status',
	'get_peq_status',
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
	'set_peq_reset',
	'set_peq_preset',
	'set_peq_bypass',
	'set_peq',
] as const

export type SetMessage = (typeof SetMessage)[number]

export type ComHeadMessageTypes = GetMessage | SetMessage

export const OutputLevel = ['+20dBu', '+14dBu', '+4dBu', '0dBV', '-18dBV'] as const
export type OutputLevel = (typeof OutputLevel)[number]

export const InputSensitivity = ['+24dBu', '+14dBu', '+4dBu', '0dBV', '-18dBV', '-35dBV'] as const
export type InputSensitivity = (typeof InputSensitivity)[number]

export const EqTypes = ['PARAMETRIC', 'HIGHPASS', 'LOWPASS', 'HIGHSHELF', 'LOWSHELF'] as const
export type EqTypes = (typeof EqTypes)[number]

/*
{"comhead":"set_save_preset","index":0}
{"comhead":"set_recall_preset","index":0}
{"comhead":"set_clear_preset","index":0}
{"comhead":"set_preset_name","index":0,"name":"Hello"}

{"comhead":"set_output_name","source":0,"name":"XLR OUT 1A"}

{"comhead":"set_output_gain","source":0,"gain":-60}
{"comhead":"set_output_gain","source":0,"gain":12}
{"comhead":"set_output_gain","source":0,"gain":9.5}
{"comhead":"set_output_gain","source":0,"gain":7.1}

{"comhead":"set_output_level","source":0,"level":4}
level 4 - 18dBv
level 3 - 0dBV
level 2 = +4dBu
level 1 - +14dBu
level 0 - +20dBu

{"comhead":"set_output_delay","source":0,"delay":0}
{"comhead":"set_output_delay","source":0,"delay":50}
{"comhead":"set_output_mute","source":0,"mute":1}

{"comhead":"set_input_gain","source":0,"gain":-12}
{"comhead":"set_input_gain","source":0,"gain":2.3}
{"comhead":"set_input_gain","source":0,"gain":12}
{"comhead":"set_input_phantom_power","source":0,"onoff":1}
{"comhead":"set_input_mute","source":0,"mute":1}
{"comhead":"set_input_sensitivity","source":0,"sensitivity":5}
sensitivity 5 - -35dBv
sensitivity 4 - -18dBv
sensitivity 3 - 0dBv
sensitivity 2 - +4dBu
sensitivity 1 - +14dBu
sensitivity 0 = +24dBu

{"comhead":"get_peq_status"}
{"comhead":"set_peq_reset","preset":2,"chn":0}
{"comhead":"set_peq_preset","preset":1,"chn":0}
{"comhead":"set_peq_preset","preset":2,"chn":0}
{"comhead":"set_peq_bypass","chn":0,"id":0,"bypass":1}
{"comhead":"set_peq","chn":0,"preset":2,"id":0,"gain":0,"type":"LOWPASS","quality":1.41,"bypass":1,"frequency":32}
{"comhead":"set_peq_bypass","chn":0,"id":1,"bypass":0}
{"comhead":"set_peq_bypass","chn":0,"id":1,"bypass":1}
{"comhead":"set_peq","chn":0,"preset":1,"id":0,"gain":0.4,"type":"HIGH_SHELF","quality":0.7,"bypass":1,"frequency":54}
Frequency range 20 - 200000
{"comhead":"set_peq","chn":0,"preset":1,"id":7,"gain":12.3,"type":"PARAMETRIC","quality":1.41,"bypass":1,"frequency":20000}
{"comhead":"set_peq","chn":0,"preset":1,"id":7,"gain":12.3,"type":"PARAMETRIC","quality":1.41,"bypass":1,"frequency":20}
Gain range -15 to 15
{"comhead":"set_peq","chn":0,"preset":1,"id":0,"gain":-15,"type":"HIGH_SHELF","quality":0.7,"bypass":1,"frequency":54}
{"comhead":"set_peq","chn":0,"preset":1,"id":0,"gain":15,"type":"HIGH_SHELF","quality":0.7,"bypass":1,"frequency":54}
Q range 0.02 to 16
{"comhead":"set_peq","chn":0,"preset":1,"id":1,"gain":11.2,"type":"PARAMETRIC","quality":0.02,"bypass":1,"frequency":77}
{"comhead":"set_peq","chn":0,"preset":1,"id":1,"gain":11.2,"type":"PARAMETRIC","quality":16,"bypass":1,"frequency":77}
*/
