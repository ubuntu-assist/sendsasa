<script lang="ts">
  import { onMount } from 'svelte'
  import { applyUserLocale } from '$lib/i18n'
  import Preloader from '$lib/components/Preloader.svelte'
  import Navbar from '$lib/components/Navbar.svelte'
  import Footer from '$lib/components/Footer.svelte'
  import BackToTop from '$lib/components/BackToTop.svelte'
  import Scripts from '$lib/components/Scripts.svelte'

  // Apply user's preferred locale after hydration so it doesn't conflict
  // with the prerendered 'en' HTML (prevents Svelte hydration mismatch).
  onMount(() => {
    applyUserLocale()
  })
</script>

<svelte:head>
  <title>SendSasa — A bank inside WhatsApp</title>
  <meta
    name="description"
    content="Send money home in 60 seconds via WhatsApp. No app, no bank account needed. Powered by mobile money."
  />
</svelte:head>

<Preloader />

<div class="fixed-top unset-for-mobile">
  <Navbar />
</div>

<slot />

<Footer />
<BackToTop />
<Scripts />
