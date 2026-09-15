import type { AxiosResponse } from 'axios'
import { Mineola } from '../mineola.js'

/**
 * Synthetic 2x2 Mineola state, in the shape the schemas accept. Not a device capture — use these for module
 * behaviour (events, logging, definitions), not for pinning the wire protocol.
 * Each builder returns fresh arrays, since Mineola mutates its state in place.
 */

export const response = (data: object): AxiosResponse => ({ data }) as AxiosResponse

type Payload = Record<string, unknown>

export const inputStatus2x2 = (): Payload => ({
	power: 1,
	input_gain: [0, 0],
	input_mute: [0, 0],
	input_sensitivity: [0, 0],
	input_phantom_power: [0, 0],
	input_name: ['In 1', 'In 2'],
	comhead: 'get_input_status',
})

export const outputStatus2x2 = (): Payload => ({
	power: 1,
	output_master_vol_value: 50,
	output_master_vol_mute: 0,
	master_out_member: [0, 0],
	output_gain: [0, 0],
	output_volume_mute: [0, 0],
	output_audio_delay: [0, 0],
	output_name: ['Out 1', 'Out 2'],
	select_level: [0, 0],
	comhead: 'get_output_status',
})

export const presetStatus = (): Payload => ({
	power: 1,
	valid: [1, 1, 0, 0, 0],
	name: ['Show', 'Rehearsal', '', '', ''],
	o_master_vol_value: 50,
	o_master_vol_mute: 0,
	comhead: 'get_preset_status',
})

export const informationStatus2x2 = (): Payload => ({
	power: 1,
	model_name: 'TAV-MINEOLA22XLR',
	...Object.fromEntries(
		[
			'version',
			'mcu_version',
			'depsdk',
			'ip_hostname',
			'mac_address',
			'secondary_mac_address',
			'ip_address',
			'subnet_mask',
			'gateway',
			'static_ip_address',
			'static_subnet_mask',
			'static_gateway',
			'secondary_ip_address',
			'secondary_subnet_mask',
			'secondary_gateway',
			'secondary_static_ip_address',
			'secondary_static_subnet_mask',
			'secondary_static_gateway',
			'def_hostname',
		].map((key) => [key, 'x']),
	),
	output_master_vol_value: 50,
	output_master_vol_mute: 0,
	comhead: 'get_information_status',
	result: 1,
})

export function createMineola2x2(isVerbose = () => false, onError: (err: unknown) => void = () => {}): Mineola {
	return Mineola.createMineola(
		response(inputStatus2x2()),
		response(outputStatus2x2()),
		response(presetStatus()),
		response(informationStatus2x2()),
		isVerbose,
		onError,
	)
}
