import type { DropdownChoice } from '@companion-module/base'

export function getDropdownChoices<T extends readonly string[]>(items: T): DropdownChoice<number>[] {
	return items.map((item, index) => ({
		id: index,
		label: item,
	}))
}
