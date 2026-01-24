import * as z from 'zod'

interface MieneolaModelProps {
	name: string
	inputs: number
	outputs: number
	presets: number
}

//New model and their capabilites must be defined here

const MineolaModels = {
	XLR22: {
		name: 'XLR22',
		inputs: 2,
		outputs: 2,
		presets: 5,
	},
	XLR44: {
		name: 'XLR44',
		inputs: 4,
		outputs: 4,
		presets: 5,
	},
	XLR88: {
		name: 'XLR88',
		inputs: 8,
		outputs: 8,
		presets: 5,
	},
	XLR1616: {
		name: 'XLR1616',
		inputs: 8,
		outputs: 8,
		presets: 5,
	},
} as const satisfies Record<string, MieneolaModelProps>

const MineolaInput = z.object({
	name: z.string().max(32),
	sensitivity: z.string(),
	gain: z.number(),
	p48: z.boolean(),
	mute: z.boolean(),
})

export type MineolaInput = z.infer<typeof MineolaInput>

export const MineolaOutput = z.object({
	name: z.string().max(32),
	volume: z.number(),
	mute: z.boolean(),
	delay: z.int().min(0).max(50),
	gain: z.string(),
})

export type MineolaOutput = z.infer<typeof MineolaOutput>

export const MineolaPreset = z.object({
	name: z.string().max(32),
})

export type MineolaPreset = z.infer<typeof MineolaPreset>

const DefaultInput = {
	name: '',
	sensitivity: '',
	gain: 0,
	p48: false,
	mute: false,
} as const satisfies MineolaInput

const DefaultOutput = {
	name: '',
	gain: '',
	mute: false,
	volume: 0,
	delay: 0,
} as const satisfies MineolaOutput

const DefaultPreset = {
	name: '',
} as const satisfies MineolaPreset

function isCompleteObject<T extends object>(obj: Partial<T>): obj is T {
	return Object.values(obj).every((value) => value !== undefined)
}

interface IoCount {
	inputs: 2 | 4 | 8 | 16
	outputs: 2 | 4 | 8 | 16
	presets: 5
}

export class Mineola {
	#inputs = new Map<number, MineolaInput>()
	#outputs = new Map<number, MineolaOutput>()
	#presets = new Map<number, MineolaPreset>()
	#ioCount!: IoCount

	private constructor(model: IoCount) {
		this.#ioCount = model
	}

	public static createMineolaFromModelName(name: string): Mineola {
		const model = MineolaModels[name as keyof typeof MineolaModels]

		if (!model) {
			throw new Error(`Unknown device type: ${name}`)
		}

		return new Mineola({ inputs: model.inputs, outputs: model.outputs, presets: model.presets })
	}

	private updateOrCreate<T extends object>(
		map: Map<number, T>,
		key: number,
		parameters: Partial<T>,
		defaultValue: T,
	): void {
		const currentVal = map.get(key)
		if (currentVal) {
			map.set(key, { ...currentVal, ...parameters })
		} else if (isCompleteObject(parameters)) {
			map.set(key, parameters)
		} else {
			map.set(key, { ...defaultValue, ...parameters })
		}
	}

	public get inputs(): Readonly<Map<number, MineolaInput>> {
		return this.#inputs
	}

	public get outputs(): Readonly<Map<number, MineolaOutput>> {
		return this.#outputs
	}

	public get presets(): Readonly<Map<number, MineolaPreset>> {
		return this.#presets
	}

	public set input(input: { channel: number; parameters: Partial<MineolaInput> }) {
		const ChannelInputSchema = z.object({
			channel: z.int().min(1).max(this.#ioCount.inputs),
			parameters: MineolaInput.partial(),
		})
		const validated = ChannelInputSchema.parse(input)
		this.updateOrCreate(this.#inputs, validated.channel, validated.parameters, DefaultInput)
	}

	public set output(output: { channel: number; parameters: Partial<MineolaOutput> }) {
		const ChannelOutputSchema = z.object({
			channel: z.int().min(1).max(this.#ioCount.outputs),
			parameters: MineolaOutput.partial(),
		})
		const validated = ChannelOutputSchema.parse(output)
		this.updateOrCreate(this.#outputs, validated.channel, validated.parameters, DefaultOutput)
	}

	public set preset(preset: { number: number; parameters: Partial<MineolaPreset> }) {
		const PresetSchema = z.object({
			number: z.int().min(1).max(this.#ioCount.presets),
			parameters: MineolaPreset.partial(),
		})
		const validated = PresetSchema.parse(preset)
		this.updateOrCreate(this.#presets, validated.number, validated.parameters, DefaultPreset)
	}
}
