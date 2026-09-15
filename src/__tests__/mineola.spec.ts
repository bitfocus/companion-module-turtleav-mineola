import { describe, expect, it, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { createMineola2x2, inputStatus2x2, outputStatus2x2, presetStatus, response } from './fixtures.js'

/**
 * channelNames tells the module its channel dropdowns ("1: Kick") are out of date. It must fire for every way a
 * name can change — a poll, a websocket push, or the module's own rename action — and must not fire for other
 * state changes, which arrive every 250ms and would otherwise rebuild every definition constantly.
 */
describe('channelNames event', () => {
	it('fires when a polled input status renames a channel', () => {
		const mineola = createMineola2x2()
		const onNames = vi.fn()
		mineola.on('channelNames', onNames)

		mineola.inputs = response({ ...inputStatus2x2(), input_name: ['Kick', 'In 2'] })

		expect(onNames).toHaveBeenCalledTimes(1)
		expect(mineola.inputs.input_name).toEqual(['Kick', 'In 2'])
	})

	it('fires when a polled output status renames a channel', () => {
		const mineola = createMineola2x2()
		const onNames = vi.fn()
		mineola.on('channelNames', onNames)

		mineola.outputs = response({ ...outputStatus2x2(), output_name: ['Out 1', 'PA R'] })

		expect(onNames).toHaveBeenCalledTimes(1)
	})

	it('fires when a polled preset status renames a preset', () => {
		const mineola = createMineola2x2()
		const onNames = vi.fn()
		mineola.on('channelNames', onNames)

		mineola.presets = response({ ...presetStatus(), name: ['Show', 'Rehearsal', 'Service', '', ''] })

		expect(onNames).toHaveBeenCalledTimes(1)
	})

	it('fires when a websocket push renames a channel', () => {
		const mineola = createMineola2x2()
		const onNames = vi.fn()
		mineola.on('channelNames', onNames)

		mineola.WebSocketMessage = {
			data: JSON.stringify({ ...outputStatus2x2(), output_name: ['PA L', 'Out 2'] }),
		} as WebSocket.MessageEvent

		expect(onNames).toHaveBeenCalledTimes(1)
	})

	it('does not fire when other state changes but the names do not', () => {
		const mineola = createMineola2x2()
		const onNames = vi.fn()
		const onInputs = vi.fn()
		mineola.on('channelNames', onNames)
		mineola.on('inputs', onInputs)

		mineola.inputs = response({ ...inputStatus2x2(), input_gain: [3, 0] })
		mineola.inputs = response({ ...inputStatus2x2(), input_gain: [3, 0] })

		expect(onInputs).toHaveBeenCalledTimes(1)
		expect(onNames).not.toHaveBeenCalled()
	})

	it('fires for renames made by the module itself, and not for a no-op rename', () => {
		const mineola = createMineola2x2()
		const onNames = vi.fn()
		mineola.on('channelNames', onNames)

		mineola.inputName = { source: 0, name: 'Kick' }
		mineola.outputName = { source: 1, name: 'PA R' }
		mineola.presetName = { index: 2, name: 'Service' }
		mineola.inputName = { source: 0, name: 'Kick' }

		expect(onNames).toHaveBeenCalledTimes(3)
	})
})
