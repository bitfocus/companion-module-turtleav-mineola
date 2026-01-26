import * as z from 'zod'
import { SetMessage, EqTypes } from './types.js'

const BinaryBooleanSchema = z.union([z.literal(0), z.literal(1)]).transform((n) => n === 1)

/**********************/
/*  Message Response  */
/**********************/

export const SetResponseSchema = z.object({
	comhead: z.enum(SetMessage),
	result: z.int(),
})

export type SetResponseSchema = z.infer<typeof SetResponseSchema>

export const MessageErrorSchema = z.object({
	comhead: z.string(),
	error: z.string(),
	result: z.string(),
})

export type MessageErrorSchema = z.infer<typeof MessageErrorSchema>

export const SetOrErrorResponseSchema = z.union([SetResponseSchema, MessageErrorSchema])

export type SetOrErrorResponse = z.infer<typeof SetOrErrorResponseSchema>

/**********************/
/*    Input Status    */
/**********************/

const createInputStatusSchema = <T extends 2 | 4 | 8 | 16>(size: T) => {
	const GainArray = z.array(z.number().min(-12).max(12)).length(size)
	const SensitivityArray = z.array(z.int().min(0).max(5)).length(size)
	const BinaryBooleanArray = z.array(BinaryBooleanSchema).length(size)
	const StringArray = z.array(z.string()).length(size)

	return z.object({
		power: BinaryBooleanSchema,
		input_gain: GainArray,
		input_mute: BinaryBooleanArray,
		input_sensitivity: SensitivityArray,
		input_phantom_power: BinaryBooleanArray,
		input_name: StringArray,
		comhead: z.literal('get_input_status'),
	})
}

// Create schemas for each size
export const InputStatusSchema2 = createInputStatusSchema(2)
export const InputStatusSchema4 = createInputStatusSchema(4)
export const InputStatusSchema8 = createInputStatusSchema(8)
export const InputStatusSchema16 = createInputStatusSchema(16)

// Union type that accepts any valid size
export const InputStatusSchema = z.union([
	InputStatusSchema2,
	InputStatusSchema4,
	InputStatusSchema8,
	InputStatusSchema16,
])

// Type inference
export type InputStatus = z.infer<typeof InputStatusSchema>

/**********************/
/*   Output Status    */
/**********************/

const createOutputStatusSchema = <T extends 2 | 4 | 8 | 16>(size: T) => {
	const GainArray = z.array(z.number().min(-15).max(15)).length(size)
	const DelayArray = z.array(z.int().min(0).max(50)).length(size)
	const OutputLevelArray = z.array(z.int().min(0).max(5)).length(size)
	const StringArray = z.array(z.string()).length(size)
	const binaryBooleanArray = z.array(BinaryBooleanSchema).length(size)
	return z.object({
		power: BinaryBooleanSchema,
		output_master_vol_value: z.number().int().min(0).max(100),
		output_master_vol_mute: BinaryBooleanSchema,
		master_out_member: binaryBooleanArray,
		output_gain: GainArray,
		output_volume_mute: binaryBooleanArray,
		output_audio_delay: DelayArray,
		output_name: StringArray,
		select_level: OutputLevelArray,
		comhead: z.literal('get_output_status'),
	})
}

// Create schemas for each size
export const OutputStatusSchema2 = createOutputStatusSchema(2)
export const OutputStatusSchema4 = createOutputStatusSchema(4)
export const OutputStatusSchema8 = createOutputStatusSchema(8)
export const OutputStatusSchema16 = createOutputStatusSchema(16)

// Union type that accepts any valid size
export const OutputStatusSchema = z.union([
	OutputStatusSchema2,
	OutputStatusSchema4,
	OutputStatusSchema8,
	OutputStatusSchema16,
])

// Type inference
export type OutputStatus = z.infer<typeof OutputStatusSchema>

/**********************/
/*   Preset Status    */
/**********************/

export const PresetStatusSchema = z.object({
	power: BinaryBooleanSchema,
	valid: z.array(BinaryBooleanSchema).length(5),
	name: z.array(z.string()).length(5),
	o_master_vol_value: z.int().min(0).max(100),
	o_master_vol_mute: BinaryBooleanSchema,
	comhead: z.literal('get_preset_status'),
})

export type PresetStatus = z.infer<typeof PresetStatusSchema>

/**********************/
/* Information Status */
/**********************/

export const InformationStatusSchema = z.object({
	power: BinaryBooleanSchema,
	model_name: z.string(),
	version: z.string(),
	mcu_version: z.string(),
	depsdk: z.string(),
	ip_hostname: z.string(),
	mac_address: z.string(),
	secondary_mac_address: z.string(),
	ip_address: z.string(),
	subnet_mask: z.string(),
	gateway: z.string(),
	static_ip_address: z.string(),
	static_subnet_mask: z.string(),
	static_gateway: z.string(),
	secondary_ip_address: z.string(),
	secondary_subnet_mask: z.string(),
	secondary_gateway: z.string(),
	secondary_static_ip_address: z.string(),
	secondary_static_subnet_mask: z.string(),
	secondary_static_gateway: z.string(),
	def_hostname: z.string(),
	output_master_vol_value: z.int().min(0).max(100),
	output_master_vol_mute: BinaryBooleanSchema,
	comhead: z.literal('get_information_status'),
	result: z.int(),
})

export type InformationStatus = z.infer<typeof InformationStatusSchema>

/**********************/
/*   ParaEQ Status    */
/**********************/

const PEQBandSchema = z.object({
	id: z.int().min(0).max(7),
	frequency: z.int().min(20).max(20000),
	gain: z.number().min(-15).max(15),
	type: z.enum(EqTypes),
	quality: z.number().min(0.02).max(16),
	bypass: BinaryBooleanSchema,
})

export const PEQStatusSchema = z.object({
	power: BinaryBooleanSchema,
	chn: z.int(),
	preset: z.int(),
	stereo: BinaryBooleanSchema,
	flat: z.array(PEQBandSchema).length(8),
	custom1: z.array(PEQBandSchema).length(8),
	custom2: z.array(PEQBandSchema).length(8),
	comhead: z.literal('get_peq_status'),
})

export type PEQStatus = z.infer<typeof PEQStatusSchema>
export type PEQBand = z.infer<typeof PEQBandSchema>
