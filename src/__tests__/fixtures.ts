import type { AxiosResponse } from 'axios'
import { Mineola } from '../mineola.js'

/**
 * Captured from a TAV-MINEOLA22XLR (firmware V1.10.10, MCU V2.0.0) on 2026-09-18, over HTTP on a dev bench.
 * Device state as taken: powered off, input 1 renamed "Ch 1a" with +2.8dB gain, input 2 at +7.9dB and sensitivity
 * 5, output 1 at level 0 with 31ms delay, output 2 at level 4, preset 1 renamed "Hello" and no presets stored.
 *
 * Each builder returns a fresh copy, since Mineola mutates its state in place.
 */

type Payload = Record<string, unknown>

export const response = (data: object): AxiosResponse => ({ data }) as AxiosResponse

export const inputStatus2x2 = (): Payload => ({
	power: 0,
	input_gain: [2.8, 7.9],
	input_mute: [0, 0],
	input_sensitivity: [0, 5],
	input_phantom_power: [0, 0],
	input_name: ['Ch 1a', 'XLR IN 2'],
	comhead: 'get_input_status',
})

export const outputStatus2x2 = (): Payload => ({
	power: 0,
	output_master_vol_value: 50,
	output_master_vol_mute: 0,
	master_out_member: [0, 0],
	output_gain: [0, 0],
	output_volume_mute: [0, 0],
	output_audio_delay: [31, 0],
	output_name: ['XLR OUT 1', 'XLR OUT 2'],
	select_level: [0, 4],
	comhead: 'get_output_status',
})

export const presetStatus = (): Payload => ({
	power: 0,
	valid: [0, 0, 0, 0, 0],
	name: ['Hello', 'Preset 2', 'Preset 3', 'Preset 4', 'Preset 5'],
	o_master_vol_value: 50,
	o_master_vol_mute: 0,
	comhead: 'get_preset_status',
})

export const informationStatus2x2 = (): Payload => ({
	power: 0,
	model_name: 'TAV-MINEOLA22XLR',
	version: 'V1.10.10',
	mcu_version: 'V2.0.0',
	depsdk: 'V1.3.3.5_20250807',
	ip_hostname: 'TAV-MINEOLA22XLR',
	mac_address: '00:1C:D5:0C:09:0A',
	secondary_mac_address: 'c8:a3:62:61:e8:4d',
	ip_address: '169.254.208.57',
	subnet_mask: '255.255.0.0',
	gateway: '169.254.0.1',
	static_ip_address: '192.168.0.200',
	static_subnet_mask: '255.255.255.0',
	static_gateway: '192.168.0.1',
	secondary_ip_address: '',
	secondary_subnet_mask: '',
	secondary_gateway: '',
	secondary_static_ip_address: '192.168.1.200',
	secondary_static_subnet_mask: '255.255.255.0',
	secondary_static_gateway: '192.168.1.1',
	def_hostname: 'TAV-MINEOLA22XLR',
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
