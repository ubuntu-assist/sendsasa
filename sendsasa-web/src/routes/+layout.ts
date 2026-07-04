import '$lib/i18n'
import { waitLocale } from 'svelte-i18n'
import type { LayoutLoad } from './$types'

export const prerender = true
export const trailingSlash = 'never'

export const load: LayoutLoad = async () => {
  await waitLocale()
}
