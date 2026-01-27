import { isEqual } from 'es-toolkit'
import {
	InputStatusSchema,
	InputStatusSchema2,
	InputStatusSchema4,
	InputStatusSchema8,
	InputStatusSchema16,
	OutputStatusSchema,
	OutputStatusSchema2,
	OutputStatusSchema4,
	OutputStatusSchema8,
	OutputStatusSchema16,
	PresetStatusSchema,
	InformationStatusSchema,
	DSPStatusSchema,
	WebSocketMessageSchema2,
	WebSocketMessageSchema4,
	WebSocketMessageSchema8,
	WebSocketMessageSchema16,
} from './schemas.js'
import type { InputStatus, OutputStatus, PresetStatus, InformationStatus, LevelStatus } from './schemas.js'
import { AxiosResponse } from 'axios'
import type { WebSocket } from 'ws'
import EventEmitter from 'events'
import { DropdownChoice } from '@companion-module/base'

export interface MineolaEvents {
	inputs: []
	outputs: []
	presets: []
	information: []
	power: []
	outputMaster: []
	levels: []
}

export class Mineola extends EventEmitter<MineolaEvents> {
	#inputs!: InputStatus
	#outputs!: OutputStatus
	#presets!: PresetStatus
	#information!: InformationStatus
	#levels: LevelStatus = {
		input_level: [] as number[],
		output_level: [] as number[],
		comhead: 'get_level',
	}
	#power: boolean = false
	#outputMaster = {
		volume: 0,
		mute: false,
	}
	#websocketParser:
		| typeof WebSocketMessageSchema2
		| typeof WebSocketMessageSchema4
		| typeof WebSocketMessageSchema8
		| typeof WebSocketMessageSchema16 = WebSocketMessageSchema2
	#inputParser:
		| typeof InputStatusSchema2
		| typeof InputStatusSchema4
		| typeof InputStatusSchema8
		| typeof InputStatusSchema16 = InputStatusSchema2
	#outputParser:
		| typeof OutputStatusSchema2
		| typeof OutputStatusSchema4
		| typeof OutputStatusSchema8
		| typeof OutputStatusSchema16 = OutputStatusSchema2

	private constructor(inputs: InputStatus, outputs: OutputStatus, presets: PresetStatus, info: InformationStatus) {
		super()
		switch (info.model_name) {
			case 'TAV-MINEOLA22XLR':
				this.#websocketParser = WebSocketMessageSchema2
				this.#inputParser = InputStatusSchema2
				this.#outputParser = OutputStatusSchema2
				break
			case 'TAV-MINEOLA44XLR':
				this.#websocketParser = WebSocketMessageSchema4
				this.#inputParser = InputStatusSchema4
				this.#outputParser = OutputStatusSchema4
				break
			case 'TAV-MINEOLA88XLR':
				this.#websocketParser = WebSocketMessageSchema8
				this.#inputParser = InputStatusSchema8
				this.#outputParser = OutputStatusSchema8
				break
			case 'TAV-MINEOLA1616XLR':
				this.#websocketParser = WebSocketMessageSchema16
				this.#inputParser = InputStatusSchema16
				this.#outputParser = OutputStatusSchema16
				break
			default:
				throw new Error('Unrecognised device model, can not initalize')
		}
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

	public set WebSocketMessage(msg: WebSocket.MessageEvent) {
		const data = typeof msg.data == 'string' ? JSON.parse(msg.data) : msg.data
		console.log(typeof data, data)
		if (typeof data !== 'object' || Object.keys(data).length == 0) return
		const result = this.#websocketParser.safeParse(data)
		if (result.success) {
			const status = result.data

			switch (status.comhead) {
				case 'get_input_status':
					this.#updateInputs(status)
					break

				case 'get_output_status':
					this.#updateOutputs(status)
					break

				case 'get_preset_status':
					this.#updatePresets(status)
					break

				case 'get_information_status':
					this.#updateInformation(status)
					break

				case 'get_dsp_status':
					this.power = status.power
					this.outputMasterMute = status.output_master_vol_mute
					this.outputMasterVolume = status.output_master_vol_value
					break

				case 'get_level':
					console.log(`updating levels`, status)
					this.#updatelevels(status)
					break

				case 'get_peq_status':
				case 'get_system_status':
				case 'get_network':
					break
			}
		} else {
			console.error('Validation failed:', result.error)
		}
	}

	// Private methods that accept already-parsed data
	#updateInputs(ins: InputStatus): void {
		this.power = ins.power
		if (isEqual(this.#inputs, ins)) return
		this.#inputs = ins
		this.emit('inputs')
	}

	#updateOutputs(outs: OutputStatus): void {
		this.power = outs.power
		this.outputMasterMute = outs.output_master_vol_mute
		this.outputMasterVolume = outs.output_master_vol_value
		if (isEqual(this.#outputs, outs)) return
		this.#outputs = outs
		this.emit('outputs')
	}

	#updatePresets(presets: PresetStatus): void {
		this.power = presets.power
		this.outputMasterMute = presets.o_master_vol_mute
		this.outputMasterVolume = presets.o_master_vol_value
		if (isEqual(this.#presets, presets)) return
		this.#presets = presets
		this.emit('presets')
	}

	#updateInformation(info: InformationStatus): void {
		this.power = info.power
		this.outputMasterMute = info.output_master_vol_mute
		this.outputMasterVolume = info.output_master_vol_value
		if (isEqual(this.#information, info)) return
		this.#information = info
		this.emit('information')
	}

	#updatelevels(levels: LevelStatus) {
		console.log(`Update Mineola levels`, levels)
		this.#levels = levels
		this.emit('levels')
	}

	// Public setters for HTTP responses
	public set inputs(inputs: AxiosResponse<any, any>) {
		const ins = this.#inputParser.parse(inputs.data)
		this.#updateInputs(ins)
	}

	public set outputs(outputs: AxiosResponse<any, any>) {
		const outs = this.#outputParser.parse(outputs.data)
		this.#updateOutputs(outs)
	}

	public set presets(preset: AxiosResponse<any, any>) {
		const presets = PresetStatusSchema.parse(preset.data)
		this.#updatePresets(presets)
	}

	public set info(info: AxiosResponse<any, any>) {
		const information = InformationStatusSchema.parse(info.data)
		this.#updateInformation(information)
	}

	public set dsp(status: AxiosResponse<any, any>) {
		const dsp = DSPStatusSchema.parse(status.data)
		this.outputMasterMute = dsp.output_master_vol_mute
		this.outputMasterVolume = dsp.output_master_vol_value
		this.power = dsp.power
	}

	// Public getters

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

	get outputMasterMute(): boolean {
		return this.#outputMaster.mute
	}

	get outputMasterVolume(): number {
		return this.#outputMaster.volume
	}

	public get levelsInput(): Readonly<number[]> {
		return this.#levels.input_level
	}

	public get levelsOutput(): Readonly<number[]> {
		return this.#levels.output_level
	}

	// Getters for dropdowns

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

	// Public setters

	set power(state: boolean) {
		if (this.#power == state) return
		this.#power = state
		this.emit('power')
	}

	set outputMasterMute(state: boolean) {
		if (this.#outputMaster.mute == state) return
		this.#outputMaster.mute = state
		this.emit('outputMaster')
	}

	set outputMasterVolume(value: number) {
		if (this.#outputMaster.volume == value) return
		this.#outputMaster.volume = value
		this.emit('outputMaster')
	}

	set outputMasterMember(value: { source: number; onoff: boolean }) {
		if (this.#outputs.master_out_member[value.source] == undefined) throw new Error('Output out of range')
		if (this.#outputs.master_out_member[value.source] === value.onoff) return
		this.#outputs.master_out_member[value.source] = value.onoff
		this.emit('outputs')
	}

	set outputGain(value: { source: number; gain: number }) {
		if (this.#outputs.output_gain[value.source] == undefined) throw new Error('Output out of range')
		if (this.#outputs.output_gain[value.source] == value.gain) return
		this.#outputs.output_gain[value.source] = value.gain
		this.emit('outputs')
	}

	set outputLevel(value: { source: number; level: number }) {
		if (this.#outputs.select_level[value.source] == undefined) throw new Error('Output out of range')
		if (this.#outputs.select_level[value.source] == value.level) return
		this.#outputs.select_level[value.source] = value.level
		this.emit('outputs')
	}

	set outputDelay(value: { source: number; delay: number }) {
		if (this.#outputs.output_audio_delay[value.source] == undefined) throw new Error('Output out of range')
		if (this.#outputs.output_audio_delay[value.source] == value.delay) return
		this.#outputs.output_audio_delay[value.source] = value.delay
		this.emit('outputs')
	}

	set outputMute(value: { source: number; mute: boolean }) {
		if (this.#outputs.output_volume_mute[value.source] == undefined) throw new Error('Output out of range')
		if (this.#outputs.output_volume_mute[value.source] == value.mute) return
		this.#outputs.output_volume_mute[value.source] = value.mute
		this.emit('outputs')
	}

	set outputName(value: { source: number; name: string }) {
		if (this.#outputs.output_name[value.source] == undefined) throw new Error('Output out of range')
		if (this.#outputs.output_name[value.source] == value.name) return
		this.#outputs.output_name[value.source] = value.name
		this.emit('outputs')
	}

	set presetName(value: { index: number; name: string }) {
		if (this.#presets.name[value.index] == undefined) throw new Error('Preset out of range')
		if (this.#presets.name[value.index] == value.name) return
		this.#presets.name[value.index] = value.name
		this.emit('presets')
	}
	set presetClear(index: number) {
		if (this.#presets.valid[index] == undefined) throw new Error('Preset out of range')
		if (this.#presets.valid[index] == false) return
		this.#presets.valid[index] = false
		this.emit('presets')
	}

	set presetSave(index: number) {
		if (this.#presets.valid[index] == undefined) throw new Error('Preset out of range')
		if (this.#presets.valid[index] == true) return
		this.#presets.valid[index] = true
		this.emit('presets')
	}

	set inputName(value: { source: number; name: string }) {
		if (this.#inputs.input_name[value.source] == undefined) throw new Error('Input out of range')
		if (this.#inputs.input_name[value.source] == value.name) return
		this.#inputs.input_name[value.source] = value.name
		this.emit('inputs')
	}

	set inputGain(value: { source: number; gain: number }) {
		if (this.#inputs.input_gain[value.source] == undefined) throw new Error('Input out of range')
		if (this.#inputs.input_gain[value.source] == value.gain) return
		this.#inputs.input_gain[value.source] = value.gain
		this.emit('inputs')
	}

	set inputSensitivity(value: { source: number; sensitivity: number }) {
		if (this.#inputs.input_sensitivity[value.source] == undefined) throw new Error('Input out of range')
		if (this.#inputs.input_sensitivity[value.source] == value.sensitivity) return
		this.#inputs.input_sensitivity[value.source] = value.sensitivity
		this.emit('inputs')
	}

	set inputMute(value: { source: number; mute: boolean }) {
		if (this.#inputs.input_mute[value.source] == undefined) throw new Error('Input out of range')
		if (this.#inputs.input_mute[value.source] == value.mute) return
		this.#inputs.input_mute[value.source] = value.mute
		this.emit('inputs')
	}

	set inputPhantom(value: { source: number; p48: boolean }) {
		if (this.#inputs.input_phantom_power[value.source] == undefined) throw new Error('Input out of range')
		if (this.#inputs.input_phantom_power[value.source] == value.p48) return
		this.#inputs.input_phantom_power[value.source] = value.p48
		this.emit('inputs')
	}
}
