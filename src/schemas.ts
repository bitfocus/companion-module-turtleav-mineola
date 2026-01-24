import * as z from 'zod'
import { SetMessage } from './types.js'

const BinaryBooleanSchema = z.union([z.literal(0), z.literal(1)]).transform((n) => n === 1)

/**********************/
/*  Message Response  */
/**********************/

export const SetResponseSchema = z.object({
	comhead: SetMessage,
	result: z.int(),
})

export type SetResponseSchema = z.infer<typeof SetResponseSchema>

export const MessageErrorSchema = z.object({
	comhead: z.string(),
	error: z.string(),
	result: z.string(),
})

export type MessageErrorSchema = z.infer<typeof MessageErrorSchema>

/**********************/
/*    Input Status    */
/**********************/

const createInputStatusSchema = <T extends 2 | 4 | 8 | 16>(size: T) => {
	const numberTuple = z.tuple(Array(size).fill(z.number()) as [z.ZodNumber, z.ZodNumber, ...z.ZodNumber[]])
	const binaryBooleanTuple = z.tuple(
		Array(size).fill(BinaryBooleanSchema) as [
			typeof BinaryBooleanSchema,
			typeof BinaryBooleanSchema,
			...(typeof BinaryBooleanSchema)[],
		],
	)
	const stringTuple = z.tuple(Array(size).fill(z.string()) as [z.ZodString, z.ZodString, ...z.ZodString[]])

	return z.object({
		power: BinaryBooleanSchema,
		input_gain: numberTuple,
		input_mute: binaryBooleanTuple,
		input_sensitivity: numberTuple,
		input_phantom_power: binaryBooleanTuple,
		input_name: stringTuple,
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
	const numberTuple = z.tuple(Array(size).fill(z.number()) as [z.ZodNumber, z.ZodNumber, ...z.ZodNumber[]])
	const binaryBooleanTuple = z.tuple(
		Array(size).fill(BinaryBooleanSchema) as [
			typeof BinaryBooleanSchema,
			typeof BinaryBooleanSchema,
			...(typeof BinaryBooleanSchema)[],
		],
	)
	const stringTuple = z.tuple(Array(size).fill(z.string()) as [z.ZodString, z.ZodString, ...z.ZodString[]])

	return z.object({
		power: BinaryBooleanSchema,
		output_master_vol_value: z.number(),
		output_master_vol_mute: BinaryBooleanSchema,
		master_out_member: binaryBooleanTuple,
		output_gain: numberTuple,
		output_volume_mute: binaryBooleanTuple,
		output_audio_delay: numberTuple,
		output_name: stringTuple,
		select_level: numberTuple,
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
	valid: z.tuple([
		BinaryBooleanSchema,
		BinaryBooleanSchema,
		BinaryBooleanSchema,
		BinaryBooleanSchema,
		BinaryBooleanSchema,
	]),
	name: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]),
	o_master_vol_value: z.number(),
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
	output_master_vol_value: z.number(),
	output_master_vol_mute: BinaryBooleanSchema,
	comhead: z.literal('get_information_status'),
	result: z.number(),
})

export type InformationStatus = z.infer<typeof InformationStatusSchema>
