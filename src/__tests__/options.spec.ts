import { describe, expect, it } from 'vitest'
import { ChannelOption } from '../options.js'

describe('ChannelOption', () => {
	it('is a dropdown of 1-based channel numbers labelled "#: Name"', () => {
		expect(ChannelOption(['Kick', 'Snare'], 'Input')).toEqual({
			type: 'dropdown',
			id: 'channel',
			label: 'Input',
			default: 1,
			allowCustom: false,
			choices: [
				{ id: 1, label: '1: Kick' },
				{ id: 2, label: '2: Snare' },
			],
		})
	})

	it('offers one choice per name', () => {
		const names = Array.from({ length: 16 }, (_, i) => `Out ${i + 1}`)
		const option = ChannelOption(names, 'Output')

		expect(option.choices).toHaveLength(16)
		expect(option.choices[15]).toEqual({ id: 16, label: '16: Out 16' })
	})
})
