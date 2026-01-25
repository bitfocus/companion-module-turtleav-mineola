import { isEqual } from 'es-toolkit'
import { InputStatusSchema, OutputStatusSchema, PresetStatusSchema, InformationStatusSchema } from './schemas.js'
import type { InputStatus, OutputStatus, PresetStatus, InformationStatus } from './schemas.js'
import { AxiosResponse } from 'axios'
import EventEmitter from 'events'
import { DropdownChoice } from '@companion-module/base'

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
	#power: boolean = false
	#outputMaster = {
		volume: 0,
		mute: false,
	}

	private constructor(inputs: InputStatus, outputs: OutputStatus, presets: PresetStatus, info: InformationStatus) {
		super()
		this.#inputs = inputs
		this.#outputs = outputs
		this.#presets = presets
		this.#information = info
		this.power = info.power
		this.outputMasterMute = info.output_master_vol_mute
		this.outputMasterVolume = info.output_master_vol_value
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
		this.power = ins.power
		if (isEqual(this.#inputs, ins)) return
		this.#inputs = ins
		this.emit('inputs')
	}

	public set outputs(outputs: AxiosResponse<any, any>) {
		const outs = OutputStatusSchema.parse(outputs.data)
		this.power = outs.power
		this.outputMasterMute = outs.output_master_vol_mute
		this.outputMasterVolume = outs.output_master_vol_value
		if (isEqual(this.#outputs, outs)) return
		this.#outputs = outs
		this.emit('inputs')
	}

	public set presets(preset: AxiosResponse<any, any>) {
		const presets = PresetStatusSchema.parse(preset.data)
		this.power = presets.power
		this.outputMasterMute = presets.o_master_vol_mute
		this.outputMasterVolume = presets.o_master_vol_value
		if (isEqual(this.#presets, presets)) return
		this.#presets = presets
		this.emit('presets')
	}

	public set info(info: AxiosResponse<any, any>) {
		const infomation = InformationStatusSchema.parse(info.data)
		this.power = infomation.power
		this.outputMasterMute = infomation.output_master_vol_mute
		this.outputMasterVolume = infomation.output_master_vol_value
		if (isEqual(this.#information, infomation)) return
		this.#information = infomation
		this.emit('information')
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

	get power(): boolean {
		return this.#power
	}

	set power(state: boolean) {
		if (this.#power == state) return
		this.#power = state
		this.emit('power')
	}

	get outputMasterMute(): boolean {
		return this.#outputMaster.mute
	}

	set outputMasterMute(state: boolean) {
		if (this.#outputMaster.mute == state) return
		this.#outputMaster.mute = state
		this.emit('outputMaster')
	}

	get outputMasterVolume(): number {
		return this.#outputMaster.volume
	}

	set outputMasterVolume(value: number) {
		if (this.#outputMaster.volume == value) return
		this.#outputMaster.volume = value
		this.emit('outputMaster')
	}

	get inputChoices(): DropdownChoice[] {
		const choices: DropdownChoice[] = []
		this.#inputs.input_name.forEach((value, index) => {
			choices.push({ id: index, label: value })
		})
		return choices
	}

	get outputChoices(): DropdownChoice[] {
		const choices: DropdownChoice[] = []
		this.#outputs.output_name.forEach((value, index) => {
			choices.push({ id: index, label: value })
		})
		return choices
	}

	set outputMasterMember(value: { source: number; onoff: boolean }) {
		if (this.#outputs.master_out_member[value.source] == undefined) throw new Error('Output out of range')
		if (this.#outputs.master_out_member[value.source] === value.onoff) return
		this.#outputs.master_out_member[value.source] = value.onoff
		this.emit('outputs')
	}
}
