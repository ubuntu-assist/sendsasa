<script lang="ts">
  import { page } from '$app/stores'
  import { _, locale } from 'svelte-i18n'
  import { setLocale } from '$lib/i18n'
  $: path = $page.url.pathname
  $: currentLocale = $locale
</script>

<nav class="navbar navbar-expand-xl navbar-dark bg-dark-div" id="navbar">
  <div class="container mw-1690">
    <!-- Logo -->
    <a class="navbar-brand me-100" href="/">
      <img
        src="/assets/images/logo-white.png"
        class="main-logo"
        alt="SendSasa"
        style="height: 38px; width: auto;"
      />
      <img
        src="/assets/images/sendsasa-logo.png"
        class="white-logo d-none"
        alt="SendSasa"
        style="height: 38px; width: auto;"
      />
    </a>

    <!-- Desktop nav links (hidden below xl) -->
    <div class="collapse navbar-collapse" id="navbarSupportedContent">
      <ul class="navbar-nav">
        <li class="nav-item">
          <a class="nav-link {path === '/' ? 'active' : ''}" href="/"
            >{$_('nav.home')}</a
          >
        </li>
        <li class="nav-item">
          <a
            class="nav-link {path.startsWith('/features') ? 'active' : ''}"
            href="/features">{$_('nav.features')}</a
          >
        </li>
      </ul>
    </div>

    <!-- Right-side controls (always visible) -->
    <div class="others-options d-flex align-items-center gap-3">
      <!-- Language switcher -->
      <div class="dropdown language">
        <button
          class="btn bg-transparent border-0 gap-10 d-flex align-items-center p-0 text-white dropdown-toggle"
          type="button"
          data-bs-toggle="dropdown"
          aria-expanded="false"
        >
          <img
            src={currentLocale === 'fr'
              ? '/assets/images/france.png'
              : '/assets/images/united-kingdom.png'}
            alt={currentLocale === 'fr' ? 'france' : 'united-kingdom'}
            style="width:22px;height:22px;object-fit:cover;border-radius:50%;border:2px solid rgba(255,255,255,0.6);"
          />
          <span class="d-none d-sm-inline">
            {currentLocale === 'fr' ? $_('nav.lang_fr') : $_('nav.lang_en')}
          </span>
        </button>
        <ul class="dropdown-menu dropdown-menu-end">
          <li>
            <button
              class="dropdown-item d-flex align-items-center gap-10 fs-15 fw-normal py-2"
              on:click={() => setLocale('en')}
            >
              <img
                src="/assets/images/uk.png"
                alt="uk"
                style="width:20px;height:20px;object-fit:cover;border-radius:50%;"
              />
              {$_('nav.lang_en')}
            </button>
          </li>
          <li>
            <button
              class="dropdown-item d-flex align-items-center gap-10 fs-15 fw-normal py-2"
              on:click={() => setLocale('fr')}
            >
              <img
                src="/assets/images/france.png"
                alt="france"
                style="width:20px;height:20px;object-fit:cover;border-radius:50%;"
              />
              {$_('nav.lang_fr')}
            </button>
          </li>
        </ul>
      </div>

      <!-- CTA — hidden on mobile (lives in offcanvas instead) -->
      <a
        href="https://api.whatsapp.com/send/?phone=14694079616&text=Hello&type=phone_number&app_absent=0"
        target="_blank"
        rel="noopener noreferrer"
        class="default-btn active d-none d-xl-inline-flex align-items-center gap-10"
      >
        {$_('nav.get_in_touch')}
      </a>

      <!-- Burger — hidden on xl+ -->
      <a
        class="navbar-toggler d-xl-none"
        data-bs-toggle="offcanvas"
        href="#offcanvasMobile"
        role="button"
        aria-controls="offcanvasMobile"
        aria-label="Open menu"
      >
        <span class="burger-menu">
          <span class="top-bar"></span>
          <span class="middle-bar"></span>
          <span class="bottom-bar"></span>
        </span>
      </a>
    </div>
  </div>
</nav>

<!-- Mobile Offcanvas -->
<div
  class="mobile-navbar offcanvas offcanvas-end border-0"
  tabindex="-1"
  id="offcanvasMobile"
>
  <div class="offcanvas-header">
    <a href="/" class="logo d-inline-block">
      <img
        src="/assets/images/sendsasa-logo.png"
        alt="SendSasa"
        style="height:36px;width:auto;"
      />
    </a>
    <button
      type="button"
      class="btn-close opacity-1"
      data-bs-dismiss="offcanvas"
      aria-label="Close"
    >
      <i class="ti ti-x"></i>
    </button>
  </div>

  <div class="offcanvas-body d-flex flex-column">
    <!-- Nav links -->
    <ul class="mobile-menu mb-4">
      <li
        class="mobile-menu-list {path === '/'
          ? 'active'
          : ''} without-icon border-bottom"
      >
        <a href="/" class="nav-link" data-bs-dismiss="offcanvas"
          >{$_('nav.home')}</a
        >
      </li>
      <li
        class="mobile-menu-list {path.startsWith('/features')
          ? 'active'
          : ''} without-icon border-bottom"
      >
        <a href="/features" class="nav-link" data-bs-dismiss="offcanvas"
          >{$_('nav.features')}</a
        >
      </li>
    </ul>

    <!-- Language switcher -->
    <div class="d-flex gap-3 mb-4 px-1">
      <button
        class="lang-btn d-flex align-items-center gap-2 {currentLocale === 'en'
          ? 'lang-active'
          : ''}"
        on:click={() => setLocale('en')}
      >
        <img
          src="/assets/images/uk.png"
          alt="uk"
          style="width:20px;height:20px;object-fit:cover;border-radius:50%;"
        />
        {$_('nav.lang_en')}
      </button>
      <button
        class="lang-btn d-flex align-items-center gap-2 {currentLocale === 'fr'
          ? 'lang-active'
          : ''}"
        on:click={() => setLocale('fr')}
      >
        <img
          src="/assets/images/france.png"
          alt="france"
          style="width:20px;height:20px;object-fit:cover;border-radius:50%;"
        />
        {$_('nav.lang_fr')}
      </button>
    </div>

    <!-- CTA -->
    <div
      class="mt-auto pt-3"
      style="border-top: 1px solid rgba(255,255,255,.15);"
    >
      <a
        href="https://api.whatsapp.com/send/?phone=14694079616&text=Hello&type=phone_number&app_absent=0"
        target="_blank"
        rel="noopener noreferrer"
        class="default-btn active w-100 text-center"
        data-bs-dismiss="offcanvas"
      >
        {$_('nav.get_in_touch')}
      </a>
    </div>
  </div>
</div>

<style>
  /* ── Blue navbar (default) ── */
  :global(#navbar .navbar-nav .nav-item .nav-link) {
    color: #fff !important;
  }
  :global(#navbar .navbar-nav .nav-item .nav-link.active),
  :global(#navbar .navbar-nav .nav-item:hover .nav-link) {
    color: #ffbb00 !important;
  }
  :global(#navbar .navbar-nav .nav-item .nav-link::before) {
    background-color: #ffbb00;
  }
  :global(#navbar .dropdown.language button img) {
    filter: none !important;
  }

  /* ── Sticky (white) navbar ── */
  :global(#navbar.sticky) {
    background-color: #fff !important;
  }
  :global(#navbar.sticky .main-logo) {
    display: none !important;
  }
  :global(#navbar.sticky .white-logo) {
    display: inline-block !important;
  }
  :global(#navbar.sticky .navbar-nav .nav-item .nav-link) {
    color: #121212 !important;
  }
  :global(#navbar.sticky .navbar-nav .nav-item .nav-link.active),
  :global(#navbar.sticky .navbar-nav .nav-item:hover .nav-link) {
    color: #0b47cc !important;
  }
  :global(#navbar.sticky .dropdown.language button) {
    color: #121212 !important;
  }
  :global(#navbar.sticky .dropdown.language button img) {
    filter: none !important;
  }

  /* ── Mobile offcanvas language buttons ── */
  :global(.lang-btn) {
    background: transparent;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    color: #555;
    font-size: 0.9rem;
    padding: 6px 14px;
    transition: all 0.2s ease;
  }
  :global(.lang-btn:hover) {
    border-color: #0b47cc;
    color: #0b47cc;
  }
  :global(.lang-btn.lang-active) {
    border-color: #0b47cc;
    color: #0b47cc;
    background: rgba(11, 71, 204, 0.06);
  }
</style>
