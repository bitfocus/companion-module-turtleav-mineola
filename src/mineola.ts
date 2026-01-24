import { isEqual } from 'es-toolkit'
import { InputStatusSchema, OutputStatusSchema, PresetStatusSchema, InformationStatusSchema } from './schemas.js'
import type { InputStatus, OutputStatus, PresetStatus, InformationStatus } from './schemas.js'
import { AxiosResponse } from 'axios'
import EventEmitter from 'events'

export interface MineolaEvents {
	inputs: []
	outputs: []
	presets: []
	information: []
	power: []
	outputMaster: []
}

export class Mineola extends EventEmitter<MineolaEvents> {
	#inputs!: InputStatus
	#outputs!: OutputStatus
	#presets!: PresetStatus
	#information!: InformationStatus

	private constructor(inputs: InputStatus, outputs: OutputStatus, presets: PresetStatus, info: InformationStatus) {
		super()
		this.#inputs = inputs
		this.#outputs = outputs
		this.#presets = presets
		this.#information = info
	}

	public static createMineola(
		ins: AxiosResponse<any, any>,
		outs: AxiosResponse<any, any>,
		presets: AxiosResponse<any, any>,
		info: AxiosResponse<any, any>,
	): Mineola {
		const inputStatus = InputStatusSchema.parse(ins.data)
		const outputStatus = OutputStatusSchema.parse(outs.data)
		const presetStatus = PresetStatusSchema.parse(presets.data)
		const infoStatus = InformationStatusSchema.parse(info.data)

		return new Mineola(inputStatus, outputStatus, presetStatus, infoStatus)
	}

	public get inputs(): Readonly<InputStatus> {
		return this.#inputs
	}

	public get outputs(): Readonly<OutputStatus> {
		return this.#outputs
	}

	public get presets(): Readonly<PresetStatus> {
		return this.#presets
	}

	public get info(): Readonly<InformationStatus> {
		return this.#information
	}

	public set inputs(inputs: AxiosResponse<any, any>) {
		const ins = InputStatusSchema.parse(inputs.data)
		if (isEqual(this.#inputs, ins)) return
		this.#inputs = ins
		this.emit('inputs')
		if (this.#outputs.power === ins.power) return
		this.#outputs.power = this.#inputs.power
		this.#information.power = this.#inputs.power
		this.#presets.power = this.#inputs.power
		this.emit('power')
	}

	public set outputs(outputs: AxiosResponse<any, any>) {
		const outs = OutputStatusSchema.parse(outputs.data)
		if (isEqual(this.#outputs, outs)) return
		this.#outputs = outs
		this.emit('inputs')
		if (this.#inputs.power !== outs.power) {
			this.#inputs.power = this.#outputs.power
			this.#presets.power = this.#outputs.power
			this.#information.power = this.#outputs.power
			this.emit('power')
		}
		if (
			this.#presets.o_master_vol_mute !== outs.output_master_vol_mute ||
			this.#presets.o_master_vol_value !== outs.output_master_vol_value
		) {
			this.#presets.o_master_vol_mute = this.#outputs.output_master_vol_mute
			this.#information.output_master_vol_mute = this.#outputs.output_master_vol_mute
			this.#presets.o_master_vol_value = this.#outputs.output_master_vol_value
			this.#information.output_master_vol_value = this.#outputs.output_master_vol_value
			this.emit('outputMaster')
		}
	}

	public set presets(preset: AxiosResponse<any, any>) {
		const presets = PresetStatusSchema.parse(preset.data)
		if (isEqual(this.#presets, presets)) return
		this.#presets = presets
		this.emit('presets')
		if (presets.power !== this.#inputs.power) {
			this.#inputs.power = presets.power
			this.#outputs.power = presets.power
			this.#information.power = presets.power
			this.emit('power')
		}
		if (
			this.#outputs.output_master_vol_mute !== presets.o_master_vol_mute ||
			this.#outputs.output_master_vol_value !== presets.o_master_vol_value
		) {
			this.#outputs.output_master_vol_mute = presets.o_master_vol_mute
			this.#information.output_master_vol_mute = presets.o_master_vol_mute
			this.#outputs.output_master_vol_value = presets.o_master_vol_value
			this.#information.output_master_vol_value = presets.o_master_vol_value
			this.emit('outputMaster')
		}
	}

	public set info(info: AxiosResponse<any, any>) {
		const infomation = InformationStatusSchema.parse(info.data)
		if (isEqual(this.#information, infomation)) return
		this.#information = infomation
		this.emit('information')
		if (infomation.power !== this.#inputs.power) {
			this.#inputs.power = infomation.power
			this.#outputs.power = infomation.power
			this.#presets.power = infomation.power
			this.emit('power')
		}
		if (
			this.#outputs.output_master_vol_mute !== infomation.output_master_vol_mute ||
			this.#outputs.output_master_vol_value !== infomation.output_master_vol_value
		) {
			this.#outputs.output_master_vol_mute = infomation.output_master_vol_mute
			this.#presets.o_master_vol_mute = infomation.output_master_vol_mute
			this.#outputs.output_master_vol_value = infomation.output_master_vol_value
			this.#presets.o_master_vol_value = infomation.output_master_vol_value
			this.emit('outputMaster')
		}
	}

	get inputCount(): number {
		return this.#inputs.input_name.length
	}

	get outputCount(): number {
		return this.#outputs.output_name.length
	}

	get presetCount(): number {
		return this.#presets.name.length
	}
}
