import { browser } from '$app/environment'
import { init, register, locale, getLocaleFromNavigator } from 'svelte-i18n'

register('en', () => import('./en.json'))
register('fr', () => import('./fr.json'))

const savedLocale = browser ? localStorage.getItem('locale') : null
const rawLocale =
  savedLocale ?? (browser ? (getLocaleFromNavigator() ?? 'en') : 'en')
const initialLocale = rawLocale.startsWith('fr') ? 'fr' : 'en'

init({ fallbackLocale: 'en', initialLocale })

export function setLocale(lang: 'en' | 'fr') {
  locale.set(lang)
  if (browser) localStorage.setItem('locale', lang)
}
