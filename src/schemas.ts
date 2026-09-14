import * as z from 'zod'
import { SetMessage, EqTypes } from './types.js'

// Schemas that are parsed directly are exported wrapped in z.compile(), so zod generates a specialised
// parser once at load rather than walking the schema on every parse. Compile here, at module scope —
// never at a parse site, which would regenerate the parser on every call.
//
// Composite schemas (the unions below) are built from the uncompiled bases and compiled once as a whole,
// rather than composed from the compiled exports.

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

export const SetOrErrorResponseSchema = z.compile(z.union([SetResponseSchema, MessageErrorSchema]))

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

// Uncompiled bases for each size, used to build the unions
const inputStatus2 = createInputStatusSchema(2)
const inputStatus4 = createInputStatusSchema(4)
const inputStatus8 = createInputStatusSchema(8)
const inputStatus16 = createInputStatusSchema(16)

export const InputStatusSchema2 = z.compile(inputStatus2)
export const InputStatusSchema4 = z.compile(inputStatus4)
export const InputStatusSchema8 = z.compile(inputStatus8)
export const InputStatusSchema16 = z.compile(inputStatus16)

// Union type that accepts any valid size
export const InputStatusSchema = z.compile(z.union([inputStatus2, inputStatus4, inputStatus8, inputStatus16]))

// Type inference
export type InputStatus = z.infer<typeof InputStatusSchema>

/**********************/
/*   Output Status    */
/**********************/

const createOutputStatusSchema = <T extends 2 | 4 | 8 | 16>(size: T) => {
	const GainArray = z.array(z.number().min(-60).max(15)).length(size)
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

// Uncompiled bases for each size, used to build the unions
const outputStatus2 = createOutputStatusSchema(2)
const outputStatus4 = createOutputStatusSchema(4)
const outputStatus8 = createOutputStatusSchema(8)
const outputStatus16 = createOutputStatusSchema(16)

export const OutputStatusSchema2 = z.compile(outputStatus2)
export const OutputStatusSchema4 = z.compile(outputStatus4)
export const OutputStatusSchema8 = z.compile(outputStatus8)
export const OutputStatusSchema16 = z.compile(outputStatus16)

// Union type that accepts any valid size
export const OutputStatusSchema = z.compile(z.union([outputStatus2, outputStatus4, outputStatus8, outputStatus16]))

// Type inference
export type OutputStatus = z.infer<typeof OutputStatusSchema>

/**********************/
/*   Preset Status    */
/**********************/

const presetStatus = z.object({
	power: BinaryBooleanSchema,
	valid: z.array(BinaryBooleanSchema).length(5),
	name: z.array(z.string()).length(5),
	o_master_vol_value: z.int().min(0).max(100),
	o_master_vol_mute: BinaryBooleanSchema,
	comhead: z.literal('get_preset_status'),
})

export const PresetStatusSchema = z.compile(presetStatus)

export type PresetStatus = z.infer<typeof PresetStatusSchema>

/**********************/
/* Information Status */
/**********************/

const informationStatus = z.object({
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

export const InformationStatusSchema = z.compile(informationStatus)

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

/**********************/
/*     Dsp Status     */
/**********************/

const dspStatus = z.object({
	power: BinaryBooleanSchema,
	output_master_vol_value: z.number().int().min(0).max(100),
	output_master_vol_mute: BinaryBooleanSchema,
	comhead: z.literal('get_dsp_status'),
})

export const DSPStatusSchema = z.compile(dspStatus)

export type DSPStatus = z.infer<typeof DSPStatusSchema>

/**********************/
/*   System Status    */
/**********************/

export const SystemStatusSchema = z.object({
	power: BinaryBooleanSchema,
	output_master_vol_value: z.number().int().min(0).max(100),
	output_master_vol_mute: BinaryBooleanSchema,
	macaddress: z.string(),
	standby_mode: z.int(),
	auto_standby_time: z.int(),
	comhead: z.literal('get_system_status'),
})

export type SystemStatus = z.infer<typeof SystemStatusSchema>

/**********************/
/*   Network Status    */
/**********************/

export const NetworkStatusSchema = z.object({
	power: BinaryBooleanSchema,
	ip_mode: z.number(),
	tcpip_port: z.number(),
	telnet_port: z.number(),
	ip_address: z.string(),
	subnet_mask: z.string(),
	dnsserver: z.string(),
	gateway: z.string(),
	static_ip_address: z.string(),
	static_subnet_mask: z.string(),
	static_gateway: z.string(),
	secondary_ip_mode: z.number(),
	secondary_ip_address: z.string(),
	secondary_subnet_mask: z.string(),
	secondary_gateway: z.string(),
	secondary_static_ip_address: z.string(),
	secondary_static_subnet_mask: z.string(),
	secondary_static_gateway: z.string(),
	macaddress: z.string(),
	domain_name: z.string(),
	output_master_vol_value: z.int().min(0).max(100),
	output_master_vol_mute: BinaryBooleanSchema,
	comhead: z.literal('get_network'),
	result: z.literal(1),
})

export type NetworkStatus = z.infer<typeof NetworkStatusSchema>

/**********************/
/*       Levels       */
/* Only on websocket  */
/**********************/

export const LevelStatusSchema = z.object({
	input_level: z.array(z.number().min(-200).max(0)),
	output_level: z.array(z.number().min(-200).max(0)),
	comhead: z.literal('get_level'),
})

export type LevelStatus = z.infer<typeof LevelStatusSchema>

export const WebSocketMessageSchema2 = z.compile(
	z.discriminatedUnion('comhead', [
		LevelStatusSchema,
		presetStatus,
		informationStatus,
		PEQStatusSchema,
		dspStatus,
		SystemStatusSchema,
		NetworkStatusSchema,
		inputStatus2,
		outputStatus2,
	]),
)

export type WebSocketMessage2 = z.infer<typeof WebSocketMessageSchema2>

export const WebSocketMessageSchema4 = z.compile(
	z.discriminatedUnion('comhead', [
		LevelStatusSchema,
		presetStatus,
		informationStatus,
		PEQStatusSchema,
		dspStatus,
		SystemStatusSchema,
		NetworkStatusSchema,
		inputStatus4,
		outputStatus4,
	]),
)

export type WebSocketMessage4 = z.infer<typeof WebSocketMessageSchema4>

export const WebSocketMessageSchema8 = z.compile(
	z.discriminatedUnion('comhead', [
		LevelStatusSchema,
		presetStatus,
		informationStatus,
		PEQStatusSchema,
		dspStatus,
		SystemStatusSchema,
		NetworkStatusSchema,
		inputStatus8,
		outputStatus8,
	]),
)

export type WebSocketMessage8 = z.infer<typeof WebSocketMessageSchema8>

export const WebSocketMessageSchema16 = z.compile(
	z.discriminatedUnion('comhead', [
		LevelStatusSchema,
		presetStatus,
		informationStatus,
		PEQStatusSchema,
		dspStatus,
		SystemStatusSchema,
		NetworkStatusSchema,
		inputStatus16,
		outputStatus16,
	]),
)

export type WebSocketMessage16 = z.infer<typeof WebSocketMessageSchema16>
