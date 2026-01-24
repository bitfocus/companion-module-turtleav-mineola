import { InstanceStatus } from '@companion-module/base'
import { isAxiosError, AxiosError } from 'axios'
import { ZodError } from 'zod'
import type { ModuleInstance } from './main.js'

export function handleError(err: unknown, instance: ModuleInstance): void {
	if (isAxiosError(err)) {
		handleAxiosError(err, instance)
	} else if (err instanceof ZodError) {
		handleZodError(err, instance)
	} else {
		handleUnknownError(err, instance)
	}
}

function handleAxiosError(err: AxiosError, instance: ModuleInstance): void {
	instance.debug(err)

	if (err.response) {
		// Server responded with error status (4xx, 5xx)
		handleHttpError(err, instance)
	} else if (err.request) {
		// Request sent but no response received (network/timeout issues)
		handleNetworkError(err, instance)
	} else {
		// Error during request setup
		instance.statusManager.updateStatus(InstanceStatus.UnknownError)
		instance.log('error', `Request setup error: ${err.message}`)
	}
}

function handleHttpError(err: AxiosError, instance: ModuleInstance): void {
	const status = err.response?.status

	// Set status based on HTTP response code
	if (status && status >= 500) {
		instance.statusManager.updateStatus(InstanceStatus.UnknownError)
		instance.log('error', `Server error ${status}: ${err.message}`)
	} else if (status === 401 || status === 403) {
		instance.statusManager.updateStatus(InstanceStatus.AuthenticationFailure)
		instance.log('error', `Authentication error ${status}: Check credentials`)
	} else if (status === 404) {
		instance.statusManager.updateStatus(InstanceStatus.UnknownWarning)
		instance.log('error', `Not found ${status}: Endpoint may have changed`)
	} else if (status === 429) {
		instance.statusManager.updateStatus(InstanceStatus.UnknownWarning)
		instance.log('error', `Rate limited ${status}: Too many requests`)
	} else {
		instance.statusManager.updateStatus(InstanceStatus.UnknownWarning)
		instance.log('error', `HTTP ${status}: ${err.message}`)
	}

	// Log response data if useful
	if (err.response?.data && typeof err.response.data === 'string') {
		instance.log('error', `Response: ${err.response.data}`)
	}
}

function handleNetworkError(err: AxiosError, instance: ModuleInstance): void {
	const code = err.code

	switch (code) {
		case 'ECONNREFUSED':
			instance.statusManager.updateStatus(InstanceStatus.ConnectionFailure)
			instance.log('error', 'Connection refused: Device may be offline or unreachable')
			break

		case 'ETIMEDOUT':
		case 'ECONNABORTED':
			instance.statusManager.updateStatus(InstanceStatus.ConnectionFailure)
			instance.log('error', `Request timed out: Device not responding (${code})`)
			break

		case 'ENOTFOUND':
		case 'EAI_AGAIN':
			instance.statusManager.updateStatus(InstanceStatus.ConnectionFailure)
			instance.log('error', `DNS resolution failed: Cannot find device hostname (${code})`)
			break

		case 'ENETUNREACH':
		case 'EHOSTUNREACH':
			instance.statusManager.updateStatus(InstanceStatus.ConnectionFailure)
			instance.log('error', `Network unreachable: Check network connectivity (${code})`)
			break

		case 'ECONNRESET':
			instance.statusManager.updateStatus(InstanceStatus.ConnectionFailure)
			instance.log('error', 'Connection reset: Device closed connection unexpectedly')
			break

		case 'EPIPE':
			instance.statusManager.updateStatus(InstanceStatus.ConnectionFailure)
			instance.log('error', 'Broken pipe: Connection lost during transmission')
			break

		case 'ECANCELED':
			// Request was cancelled (e.g., by AbortController)
			instance.log('warn', 'Request cancelled')
			// Don't change status for cancellations
			break

		case 'ERR_NETWORK':
			// Generic network error (often seen in browsers)
			instance.statusManager.updateStatus(InstanceStatus.ConnectionFailure)
			instance.log('error', 'Network error: Check device connection')
			break

		case 'ERR_BAD_REQUEST':
			// Request was malformed
			instance.statusManager.updateStatus(InstanceStatus.UnknownError)
			instance.log('error', `Bad request: ${err.message}`)
			break

		case 'ERR_BAD_RESPONSE':
			// Response was malformed
			instance.statusManager.updateStatus(InstanceStatus.UnknownWarning)
			instance.log('error', `Invalid response from device: ${err.message}`)
			break

		default:
			// Unknown network error
			instance.statusManager.updateStatus(InstanceStatus.ConnectionFailure)
			instance.log('error', `Network error${code ? ` (${code})` : ''}: ${err.message}`)
			break
	}

	// Additional context
	if (err.config?.url) {
		instance.log('debug', `Failed URL: ${err.config.url}`)
	}
}

function handleZodError(err: ZodError, instance: ModuleInstance): void {
	instance.debug(err)

	// Format Zod errors more readably
	const formattedErrors = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n  ')

	instance.log('warn', `Invalid data returned:\n  ${formattedErrors}`)
}

function handleUnknownError(err: unknown, instance: ModuleInstance): void {
	instance.statusManager.updateStatus(InstanceStatus.UnknownError)

	// Safely stringify unknown errors
	const errorMessage =
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		err instanceof Error ? err.message : typeof err == 'object' ? JSON.stringify(err) : String(err)

	instance.log('error', `Unknown error: ${errorMessage}`)

	// Log stack trace if available
	if (err instanceof Error && err.stack) {
		instance.debug(err.stack)
	}
}
