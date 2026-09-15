import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	InstanceStatus,
	type CompanionActionCallbackContext,
	type CompanionActionDefinitions,
	type CompanionActionEvent,
} from '@companion-module/base'
import type { AxiosResponse } from 'axios'
import type { WebSocket } from 'ws'
import { handleError } from '../errors.js'
import { Mineola } from '../mineola.js'
import { StatusManager } from '../status.js'
import { ActionId, UpdateActions, type ActionSchema } from '../actions.js'
import type ModuleInstance from '../main.js'

/**
 * Every file outside main.ts logs through its own createModuleLogger, so its lines carry a source name in
 * Companion's log. These pin the source each file uses, that nothing is routed back through instance.log,
 * and that verbose-only detail stays behind the connection's Verbose Logs setting.
 */

const captured: { scope: string; level: string; text: string }[] = []

// Hoisted above the imports by vitest, so the modules capture this factory's loggers when they load
vi.mock('@companion-module/base', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@companion-module/base')>()
	const record = (scope: string, level: string) => (text: string) => {
		captured.push({ scope, level, text })
	}
	return {
		...actual,
		createModuleLogger: (scope = '') => ({
			debug: record(scope, 'debug'),
			info: record(scope, 'info'),
			warn: record(scope, 'warn'),
			error: record(scope, 'error'),
		}),
	}
})

beforeEach(() => {
	captured.length = 0
})

const entries = (scope: string, level?: string) =>
	captured.filter((e) => e.scope === scope && (level === undefined || e.level === level))

describe('Errors logger', () => {
	const instance = (verbose: boolean) => {
		const log = vi.fn()
		const self = { verbose, log, statusManager: { updateStatus: vi.fn() } } as unknown as ModuleInstance
		return { self, log }
	}

	it('logs under Errors, not through the instance', () => {
		const { self, log } = instance(false)
		handleError(new Error('boom'), self)

		expect(entries('Error Handler', 'error').map((e) => e.text)).toEqual(['Unknown error: boom'])
		expect(log).not.toHaveBeenCalled()
	})

	it('only logs the stack trace when verbose', () => {
		handleError(new Error('quiet'), instance(false).self)
		expect(entries('Error Handler', 'debug')).toEqual([])

		handleError(new Error('loud'), instance(true).self)
		expect(entries('Error Handler', 'debug')).toHaveLength(1)
		expect(entries('Error Handler', 'debug')[0].text).toContain('Error: loud')
	})
})

describe('Status logger', () => {
	it('warns under Status when updated after destroy', () => {
		const parent = { updateStatus: vi.fn(), log: vi.fn() }
		const manager = new StatusManager(parent as unknown as ConstructorParameters<typeof StatusManager>[0])
		manager.destroy()
		manager.updateStatus(InstanceStatus.Ok, 'too late')

		expect(entries('Status', 'warn')).toHaveLength(1)
		expect(entries('Status', 'warn')[0].text).toContain("Module destroyed. Can't update status")
		expect(parent.log).not.toHaveBeenCalled()
	})
})

describe('Actions logger', () => {
	it('logs the reboot under Actions', async () => {
		const setActionDefinitions = vi.fn<(defs: CompanionActionDefinitions<ActionSchema>) => void>()
		const log = vi.fn()
		const self = {
			mineola: {
				inputCount: 2,
				outputCount: 2,
				presetCount: 2,
				inputs: { input_name: ['In 1', 'In 2'] },
				outputs: { output_name: ['Out 1', 'Out 2'] },
				presets: { name: ['Preset 1', 'Preset 2'] },
			},
			setActionDefinitions,
			log,
			httpPost: vi.fn().mockResolvedValue({ data: { comhead: 'set_system_reboot', result: 1 } }),
		} as unknown as ModuleInstance
		UpdateActions(self)
		const reboot = setActionDefinitions.mock.calls[0][0][ActionId.Reboot]
		if (!reboot) throw new Error('reboot action missing')

		const event: CompanionActionEvent<Record<string, never>> = {
			id: 'action-1',
			controlId: 'bank-1',
			actionId: ActionId.Reboot,
			surfaceId: undefined,
			options: {},
		}
		await reboot.callback(event, { signal: new AbortController().signal } as CompanionActionCallbackContext)

		expect(entries('Actions', 'info').map((e) => e.text)).toEqual(['Device rebooting'])
		expect(log).not.toHaveBeenCalled()
	})
})

describe('Device logger', () => {
	// Synthetic 2x2 state — this pins logging, not the protocol, so no device capture is needed
	const response = (data: object) => ({ data }) as AxiosResponse
	const pair = [0, 0]
	const createMineola = (verbose: boolean) =>
		Mineola.createMineola(
			response({
				power: 1,
				input_gain: pair,
				input_mute: pair,
				input_sensitivity: pair,
				input_phantom_power: pair,
				input_name: ['In 1', 'In 2'],
				comhead: 'get_input_status',
			}),
			response({
				power: 1,
				output_master_vol_value: 50,
				output_master_vol_mute: 0,
				master_out_member: pair,
				output_gain: pair,
				output_volume_mute: pair,
				output_audio_delay: pair,
				output_name: ['Out 1', 'Out 2'],
				select_level: pair,
				comhead: 'get_output_status',
			}),
			response({
				power: 1,
				valid: [0, 0, 0, 0, 0],
				name: ['', '', '', '', ''],
				o_master_vol_value: 50,
				o_master_vol_mute: 0,
				comhead: 'get_preset_status',
			}),
			response({
				power: 1,
				model_name: 'TAV-MINEOLA22XLR',
				...Object.fromEntries(
					[
						'version',
						'mcu_version',
						'depsdk',
						'ip_hostname',
						'mac_address',
						'secondary_mac_address',
						'ip_address',
						'subnet_mask',
						'gateway',
						'static_ip_address',
						'static_subnet_mask',
						'static_gateway',
						'secondary_ip_address',
						'secondary_subnet_mask',
						'secondary_gateway',
						'secondary_static_ip_address',
						'secondary_static_subnet_mask',
						'secondary_static_gateway',
						'def_hostname',
					].map((key) => [key, 'x']),
				),
				output_master_vol_value: 50,
				output_master_vol_mute: 0,
				comhead: 'get_information_status',
				result: 1,
			}),
			() => verbose,
			vi.fn(),
		)
	const levels = { data: JSON.stringify({ input_level: [-20, -30], output_level: [-10, -15], comhead: 'get_level' }) }

	it('logs websocket messages under Device only when verbose', () => {
		createMineola(false).WebSocketMessage = levels as WebSocket.MessageEvent
		expect(entries('Device')).toEqual([])

		createMineola(true).WebSocketMessage = levels as WebSocket.MessageEvent
		expect(entries('Device', 'debug').length).toBeGreaterThan(0)
		expect(entries('Device').every((e) => e.level === 'debug')).toBe(true)
	})
})
