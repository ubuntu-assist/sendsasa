import { browser } from '$app/environment'
import { init, register, locale, getLocaleFromNavigator } from 'svelte-i18n'

register('en', () => import('./en.json'))
register('fr', () => import('./fr.json'))

// Always initialise with 'en' so the client-side hydration matches the
// prerendered HTML (which is built with 'en'). The user's preferred locale
// is applied after hydration via applyUserLocale() in +layout.svelte onMount.
init({ fallbackLocale: 'en', initialLocale: 'en' })

export function setLocale(lang: 'en' | 'fr') {
  locale.set(lang)
  if (browser) localStorage.setItem('locale', lang)
}

export function applyUserLocale() {
  if (!browser) return
  const saved = localStorage.getItem('locale')
  const nav = getLocaleFromNavigator() ?? 'en'
  const preferred = (saved ?? nav).startsWith('fr') ? 'fr' : 'en'
  locale.set(preferred)
}
