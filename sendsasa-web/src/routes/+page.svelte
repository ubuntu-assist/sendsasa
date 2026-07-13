<script lang="ts">
  import { _ } from 'svelte-i18n'
  import { onMount } from 'svelte'

  interface Provider {
    id: string
    name: string
    flag: string
    currency: string
  }

  const providers: Provider[] = [
    {
      id: 'mtn_cm',
      name: 'MTN MoMo',
      flag: '/assets/images/flags/cameroon.png',
      currency: 'XAF',
    },
    {
      id: 'orange_cm',
      name: 'Orange Money',
      flag: '/assets/images/flags/cameroon.png',
      currency: 'XAF',
    },
    {
      id: 'mpesa_ke',
      name: 'M-Pesa',
      flag: '/assets/images/flags/kenya.png',
      currency: 'KES',
    },
    {
      id: 'mtn_ng',
      name: 'MTN MoMo Nigeria',
      flag: '/assets/images/flags/nigeria.png',
      currency: 'NGN',
    },
    {
      id: 'mtn_gh',
      name: 'MTN MoMo Ghana',
      flag: '/assets/images/flags/ghana.png',
      currency: 'GHS',
    },
    {
      id: 'wave_ci',
      name: "Wave Côte d'Ivoire",
      flag: '/assets/images/flags/ivory-coast.png',
      currency: 'XOF',
    },
  ]

  // Approximate exchange rates to XAF
  const toXAF: Record<string, number> = {
    XAF: 1,
    XOF: 1,
    KES: 4.72,
    NGN: 0.41,
    GHS: 43.5,
  }

  let sendProvider = providers[0]
  let receiveProvider = providers[0]
  let sendAmount = 19352

  $: sendXAF = Math.round(sendAmount * toXAF[sendProvider.currency])
  $: fee = Math.max(100, Math.min(2000, Math.round(sendXAF * 0.01)))
  $: receiveXAF = sendXAF - fee
  $: recipientGets = Math.round(receiveXAF / toXAF[receiveProvider.currency])

  function fmt(n: number) {
    return Math.round(n).toLocaleString('fr-FR')
  }

  let videoLoaded = false

  onMount(() => {
    const el = document.getElementById('pricingOffcanvas')
    el?.addEventListener('shown.bs.offcanvas', () => {
      el.querySelector<HTMLInputElement>('input:not([readonly])')?.focus()
    })
  })
</script>

<svelte:head>
  <title>{$_('home.meta_title')}</title>
  <meta name="description" content={$_('home.meta_desc')} />
</svelte:head>

<!-- Banner Area -->
<div
  class="banner-area bg-img ptb-120"
  style="background-image: url('/assets/images/banner-bg.jpeg')"
>
  <div class="container mw-1690 position-relative z-1">
    <div
      class="row align-items-center g-4"
    >
      <div class="col-xl-2 col-sm-6 order-3 order-xl-1">
        <div class="fun-fact-single-item">
          <h2>60<span>s</span></h2>
          <p class="text-secondary" style="white-space: nowrap;">
            {$_('home.hero.stat_transfer')}
          </p>
        </div>
        <div class="fun-fact-single-item">
          <h2>1<span>%</span></h2>
          <p class="text-secondary" style="white-space: nowrap;">
            {$_('home.hero.stat_fee')}
          </p>
        </div>
        <div class="fun-fact-single-item">
          <h2>500<span>M+</span></h2>
          <p class="text-secondary" style="white-space: nowrap;">
            {$_('home.hero.stat_users')}
          </p>
        </div>
      </div>
      <div class="col-xl-6 col-sm-6 order-2 order-xl-2">
        <div class="overflow-hidden py-3 text-center">
          <div
            class="banner-img transform-unset reveal"
            style="max-width:83%;margin:0 auto;"
          >
            <picture>
              <source srcset="/assets/images/banner-img.webp" type="image/webp" />
              <img
                src="/assets/images/banner-img.png"
                alt="SendSasa app on WhatsApp"
                fetchpriority="high"
                loading="eager"
                width="528"
                height="620"
                style="max-width:100%;height:auto;display:block;margin:0 auto;"
              />
            </picture>
          </div>
        </div>
      </div>
      <div class="col-xl-4 order-1 order-xl-3">
        <div class="banner-content">
          <span class="top-title">{$_('home.hero.badge')}</span>
          <h1>
            {$_('home.hero.headline')}
            <span class="under-line">{$_('home.hero.headline_highlight')}</span>
          </h1>
          <p class="text-secondary">
            {$_('home.hero.body')}
          </p>

          <div class="d-flex flex-wrap align-items-center gap-30 banner-btn">
            <a href="/contact" class="default-btn"
              >{$_('home.hero.cta_primary')}</a
            >
            <a
              href="https://api.whatsapp.com/send/?phone=14694079616&text=Hello&type=phone_number&app_absent=0"
              target="_blank"
              rel="noopener noreferrer"
              class="d-flex align-items-center text-decoration-none play gap-12"
            >
              <img src="/assets/images/play-circle.svg" alt="WhatsApp" loading="lazy" width="48" height="48" />
              <span class="text-secondary">{$_('home.hero.cta_secondary')}</span
              >
            </a>
          </div>
        </div>
      </div>
    </div>

    <img
      src="/assets/images/shape1.png"
      class="shape1 d-none d-lg-inline-block"
      alt="shape"
    />
    <img
      src="/assets/images/shape2.png"
      class="shape2 d-none d-lg-inline-block"
      alt="shape"
    />
    <img
      src="/assets/images/shape3.png"
      class="shape3 d-none d-lg-inline-block"
      alt="shape"
    />
  </div>
  <span class="transfer d-none d-lg-inline-block" id="text">Send Money</span>
</div>
<!-- End Banner Area -->

<!-- Partner Area -->
<div class="partner-area bg-dark-div ptb-120">
  <div class="container mw-1690">
    <div class="row g-4">
      <div class="col-lg-3">
        <span
          class="partner-title text-center text-lg-start d-block"
          data-cue="slideInLeft"
          data-duration="900"
        >
          {$_('home.partners.label')}
        </span>
      </div>
      <div class="col-lg-9">
        <div class="swiper partner-slide text-center text-lg-end">
          <div class="swiper-wrapper align-items-center">
            <div class="swiper-slide">
              <img src="/assets/images/xrpl-commons.svg" alt="XRPL Commons" height="40" width="120" style="height:40px;width:auto;" loading="lazy" />
            </div>
            <div class="swiper-slide">
              <img src="/assets/images/pawapay.svg" alt="PawaPay" height="40" width="120" style="height:40px;width:auto;" loading="lazy" />
            </div>
            <div class="swiper-slide">
              <img src="/assets/images/onafriq-logo.webp" alt="Onafriq" height="40" width="120" style="height:40px;width:auto;" loading="lazy" />
            </div>
            <div class="swiper-slide">
              <picture>
                <source srcset="/assets/images/ayahq.webp" type="image/webp" />
                <img src="/assets/images/ayahq.png" alt="AyahQ" width="137" height="40" style="height:40px;width:auto;" loading="lazy" />
              </picture>
            </div>
            <div class="swiper-slide">
              <img src="/assets/images/circle.png" alt="Circle" width="157" height="40" style="height:40px;width:auto;" loading="lazy" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- End Partner Area -->

<!-- Features Area -->
<div class="features-area bg-dark-div pb-120">
  <div class="container mw-1690">
    <div class="row g-4 mb-50" data-cue="slideInUp" data-duration="900">
      <div class="col-lg-3">
        <span class="top-title two">{$_('home.features.badge')}</span>
      </div>
      <div class="col-lg-6">
        <h2 class="main-title text-white mx-auto text-xl-center">
          {$_('home.features.title')}
          <span class="under-line">{$_('home.features.title_highlight')}</span>
          {$_('home.features.title_suffix')}
        </h2>
      </div>
      <div class="col-lg-3">
        <div class="d-flex justify-content-lg-end">
          <a href="/features" class="default-btn shadow"
            >{$_('home.features.all_features')}</a
          >
        </div>
      </div>
    </div>

    <div
      class="row g-4 justify-content-lg-between justify-content-center"
      data-cues="slideInUp"
      data-duration="900"
    >
      <div class="col-lg-4 col-md-6">
        <div class="features-single-item d-flex flex-column h-100">
          <div class="mb-4">
            <div class="d-flex align-items-center gap-25 mb-4">
              <div class="flex-shrink-0">
                <div class="icon">
                  <img
                    src="/assets/images/feature-icon1.png"
                    alt="send money"
                    width="35"
                    height="35"
                    loading="lazy"
                  />
                </div>
              </div>
              <div class="flex-grow-1">
                <h3 class="mb-0">{$_('home.features.send_money.title')}</h3>
              </div>
            </div>
            <p>{$_('home.features.send_money.desc')}</p>
          </div>
          <div
            class="mt-auto text-center"
            style="height:380px;display:flex;align-items:flex-end;justify-content:center;"
          >
            <picture>
              <source srcset="/assets/images/feature1.webp" type="image/webp" />
              <img
                src="/assets/images/feature1.png"
                alt="send money feature"
                width="347"
                height="325"
                style="max-height:380px;width:auto;max-width:100%;object-fit:contain;"
                loading="lazy"
              />
            </picture>
          </div>
          <img
            src="/assets/images/shape16.png"
            class="position-absolute bottom-0 end-0 p-5 m-3 d-none d-xxl-inline-block"
            alt="shape"
            loading="lazy"
            width="120"
            height="120"
          />
        </div>
      </div>
      <div class="col-lg-4 col-md-6">
        <div class="features-single-item d-flex flex-column h-100">
          <div class="mb-4">
            <div class="d-flex align-items-center gap-25 mb-4">
              <div class="flex-shrink-0">
                <div class="icon">
                  <img src="/assets/images/feature-icon2.png" alt="payday" width="35" height="35" loading="lazy" />
                </div>
              </div>
              <div class="flex-grow-1">
                <h3 class="mb-0">{$_('home.features.payday.title')}</h3>
              </div>
            </div>
            <p>{$_('home.features.payday.desc')}</p>
          </div>
          <div
            class="mt-auto text-center"
            style="height:380px;display:flex;align-items:flex-end;justify-content:center;"
          >
            <picture>
              <source srcset="/assets/images/feature2.webp" type="image/webp" />
              <img
                src="/assets/images/feature2.png"
                alt="payday feature"
                width="277"
                height="380"
                style="max-height:380px;width:auto;max-width:100%;object-fit:contain;"
                loading="lazy"
              />
            </picture>
          </div>
        </div>
      </div>
      <div class="col-lg-4 col-md-6">
        <div class="features-single-item d-flex flex-column h-100">
          <div class="mb-4">
            <div class="d-flex align-items-center gap-25 mb-4">
              <div class="flex-shrink-0">
                <div class="icon">
                  <img src="/assets/images/feature-icon3.png" alt="safipay" width="35" height="35" loading="lazy" />
                </div>
              </div>
              <div class="flex-grow-1">
                <h3 class="mb-0">{$_('home.features.safipay.title')}</h3>
              </div>
            </div>
            <p>{$_('home.features.safipay.desc')}</p>
          </div>
          <div
            class="mt-auto text-center"
            style="height:380px;display:flex;align-items:flex-end;justify-content:center;"
          >
            <picture>
              <source srcset="/assets/images/feature3.webp" type="image/webp" />
              <img
                src="/assets/images/feature3.png"
                alt="safipay feature"
                width="356"
                height="380"
                style="max-height:380px;width:auto;max-width:100%;object-fit:contain;"
                loading="lazy"
              />
            </picture>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- End Features Area -->

<!-- About Us Area -->
<div class="about-us-area ptb-120">
  <div class="container mw-1690">
    <div class="row g-4 mb-50" data-cues="slideInUp" data-duration="900">
      <div class="col-lg-3">
        <span class="top-title">{$_('home.about.badge')}</span>
      </div>
      <div class="col-lg-6">
        <h2 class="main-title mx-lg-auto">
          {$_('home.about.title')}
          <span class="under-line">{$_('home.about.title_highlight')}</span>
          {$_('home.about.title_suffix')}
        </h2>
      </div>
      <div class="col-lg-3">
        <div class="d-flex justify-content-lg-end">
          <a href="/about" class="default-btn">{$_('home.about.learn_more')}</a>
        </div>
      </div>
    </div>

    <div class="row g-4" data-cues="slideInUp" data-duration="900">
      <div class="col-xl-3">
        <ul
          class="nav nav-tabs d-block border-0 about-tabs"
          id="myTab"
          role="tablist"
        >
          <li class="nav-item" role="presentation">
            <button
              class="nav-link d-flex justify-content-between align-items-center active"
              id="send-tab"
              data-bs-toggle="tab"
              data-bs-target="#send-tab-pane"
              type="button"
              role="tab"
              aria-controls="send-tab-pane"
              aria-selected="true"
            >
              <span>{$_('home.about.tab_send')}</span>
              <i class="ti ti-arrow-up-right"></i>
            </button>
          </li>
          <li class="nav-item" role="presentation">
            <button
              class="nav-link d-flex justify-content-between align-items-center"
              id="escrow-tab"
              data-bs-toggle="tab"
              data-bs-target="#escrow-tab-pane"
              type="button"
              role="tab"
              aria-controls="escrow-tab-pane"
              aria-selected="false"
            >
              <span>{$_('home.about.tab_escrow')}</span>
              <i class="ti ti-arrow-up-right"></i>
            </button>
          </li>
          <li class="nav-item" role="presentation">
            <button
              class="nav-link d-flex justify-content-between align-items-center"
              id="payroll-tab"
              data-bs-toggle="tab"
              data-bs-target="#payroll-tab-pane"
              type="button"
              role="tab"
              aria-controls="payroll-tab-pane"
              aria-selected="false"
            >
              <span>{$_('home.about.tab_payroll')}</span>
              <i class="ti ti-arrow-up-right"></i>
            </button>
          </li>
          <li class="nav-item" role="presentation">
            <button
              class="nav-link d-flex justify-content-between align-items-center"
              id="invoice-tab"
              data-bs-toggle="tab"
              data-bs-target="#invoice-tab-pane"
              type="button"
              role="tab"
              aria-controls="invoice-tab-pane"
              aria-selected="false"
            >
              <span>{$_('home.about.tab_invoice')}</span>
              <i class="ti ti-arrow-up-right"></i>
            </button>
          </li>
        </ul>
      </div>
      <div class="col-xl-9">
        <div class="tab-content" id="myTabContent">
          <div
            class="tab-pane fade show active"
            id="send-tab-pane"
            role="tabpanel"
            aria-labelledby="send-tab"
            tabindex="0"
          >
            <div class="row g-4">
              <div class="col-lg-4">
                <div class="about-img-wrap h-100">
                  <picture>
                    <source srcset="/assets/images/about-img.webp" type="image/webp" />
                    <img
                      src="/assets/images/about-img.jpeg"
                      class="ukiyo"
                      alt="sending money"
                      width="1155"
                      height="1470"
                      style="width:100%;height:100%;object-fit:cover;border-radius:30px;"
                      loading="lazy"
                    />
                  </picture>
                </div>
              </div>
              <div class="col-lg-8">
                <div class="about-content position-relative z-1">
                  <h3>{$_('home.about.send.title')}</h3>
                  <p>{$_('home.about.send.body')}</p>
                  <ul class="p-0 mb-0 list-unstyled">
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.send.check1')}</span
                      >
                    </li>
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.send.check2')}</span
                      >
                    </li>
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.send.check3')}</span
                      >
                    </li>
                  </ul>
                  <img
                    src="/assets/images/shape4.png"
                    class="position-absolute bottom-0 end-0 for-about-shape d-none d-lg-inline-block transform-unset"
                    alt="shape"
                    loading="lazy"
                    width="120"
                    height="120"
                  />
                </div>
              </div>
            </div>
          </div>
          <div
            class="tab-pane fade"
            id="escrow-tab-pane"
            role="tabpanel"
            aria-labelledby="escrow-tab"
            tabindex="0"
          >
            <div class="row g-4">
              <div class="col-lg-8">
                <div class="about-content">
                  <h3>{$_('home.about.escrow.title')}</h3>
                  <p>{$_('home.about.escrow.body')}</p>
                  <ul class="p-0 mb-0 list-unstyled">
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.escrow.check1')}</span
                      >
                    </li>
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.escrow.check2')}</span
                      >
                    </li>
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.escrow.check3')}</span
                      >
                    </li>
                  </ul>
                </div>
              </div>
              <div class="col-lg-4">
                <div class="about-img-wrap h-100">
                  <picture>
                    <source srcset="/assets/images/about-img.webp" type="image/webp" />
                    <img
                      src="/assets/images/about-img.jpeg"
                      alt="trustlock escrow"
                      width="1155"
                      height="1470"
                      style="width:100%;height:100%;object-fit:cover;border-radius:30px;"
                      loading="lazy"
                    />
                  </picture>
                </div>
              </div>
            </div>
          </div>
          <div
            class="tab-pane fade"
            id="payroll-tab-pane"
            role="tabpanel"
            aria-labelledby="payroll-tab"
            tabindex="0"
          >
            <div class="row g-4">
              <div class="col-lg-4">
                <div class="about-img-wrap h-100">
                  <picture>
                    <source srcset="/assets/images/about-img.webp" type="image/webp" />
                    <img
                      src="/assets/images/about-img.jpeg"
                      alt="payday payroll"
                      width="1155"
                      height="1470"
                      style="width:100%;height:100%;object-fit:cover;border-radius:30px;"
                      loading="lazy"
                    />
                  </picture>
                </div>
              </div>
              <div class="col-lg-8">
                <div class="about-content">
                  <h3>{$_('home.about.payroll.title')}</h3>
                  <p>{$_('home.about.payroll.body')}</p>
                  <ul class="p-0 mb-0 list-unstyled">
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.payroll.check1')}</span
                      >
                    </li>
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.payroll.check2')}</span
                      >
                    </li>
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.payroll.check3')}</span
                      >
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div
            class="tab-pane fade"
            id="invoice-tab-pane"
            role="tabpanel"
            aria-labelledby="invoice-tab"
            tabindex="0"
          >
            <div class="row g-4">
              <div class="col-lg-8">
                <div class="about-content">
                  <h3>{$_('home.about.invoice.title')}</h3>
                  <p>{$_('home.about.invoice.body')}</p>
                  <ul class="p-0 mb-0 list-unstyled">
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.invoice.check1')}</span
                      >
                    </li>
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.invoice.check2')}</span
                      >
                    </li>
                    <li>
                      <span class="d-inline-flex align-items-center gap-12"
                        ><img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                        {$_('home.about.invoice.check3')}</span
                      >
                    </li>
                  </ul>
                </div>
              </div>
              <div class="col-lg-4">
                <div class="about-img-wrap h-100">
                  <picture>
                    <source srcset="/assets/images/about-img.webp" type="image/webp" />
                    <img
                      src="/assets/images/about-img.jpeg"
                      alt="safipay invoicing"
                      width="1155"
                      height="1470"
                      style="width:100%;height:100%;object-fit:cover;border-radius:30px;"
                      loading="lazy"
                    />
                  </picture>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- End About Us Area -->

<!-- Working Process Area -->
<div class="working-process-area pb-120">
  <div class="container mw-1690">
    <div class="row g-4 mb-50" data-cues="slideInUp" data-duration="900">
      <div class="col-lg-3">
        <span class="top-title">{$_('home.how_it_works.badge')}</span>
      </div>
      <div class="col-lg-6">
        <h2 class="main-title mx-lg-auto mw-455">
          {$_('home.how_it_works.title')}
          <span class="under-line"
            >{$_('home.how_it_works.title_highlight')}</span
          >
          {$_('home.how_it_works.title_suffix')}
        </h2>
      </div>
      <div class="col-lg-3">
        <div class="d-flex justify-content-lg-end">
          <p>{$_('home.how_it_works.body')}</p>
        </div>
      </div>
    </div>

    <div class="row g-4" data-cues="slideInUp" data-duration="900">
      <div class="col-xxl-3 col-md-6">
        <div class="working-process-single-item">
          <div class="icon">
            <div class="d-flex justify-content-between align-items-center">
              <img src="/assets/images/process1.png" alt="step 1" width="68" height="68" loading="lazy" />
              <span class="step">{$_('home.how_it_works.step1.label')}</span>
            </div>
          </div>
          <h3>{$_('home.how_it_works.step1.title')}</h3>
          <p>{$_('home.how_it_works.step1.body')}</p>
        </div>
      </div>
      <div class="col-xxl-3 col-md-6">
        <div class="working-process-single-item">
          <div class="icon">
            <div class="d-flex justify-content-between align-items-center">
              <img src="/assets/images/process2.png" alt="step 2" width="68" height="68" loading="lazy" />
              <span class="step">{$_('home.how_it_works.step2.label')}</span>
            </div>
          </div>
          <h3>{$_('home.how_it_works.step2.title')}</h3>
          <p>{$_('home.how_it_works.step2.body')}</p>
        </div>
      </div>
      <div class="col-xxl-3 col-md-6">
        <div class="working-process-single-item">
          <div class="icon">
            <div class="d-flex justify-content-between align-items-center">
              <img src="/assets/images/process3.png" alt="step 3" width="68" height="68" loading="lazy" />
              <span class="step">{$_('home.how_it_works.step3.label')}</span>
            </div>
          </div>
          <h3>{$_('home.how_it_works.step3.title')}</h3>
          <p>{$_('home.how_it_works.step3.body')}</p>
        </div>
      </div>
      <div class="col-xxl-3 col-md-6">
        <div
          class="bg-img h-100 working-process-video position-relative"
          style="background-image: url(/assets/images/try-now.jpeg);"
        >
          <div class="position-absolute top-50 start-50 translate-middle">
            <div>
              <a
                href="https://api.whatsapp.com/send/?phone=14694079616&text=Hello&type=phone_number&app_absent=0"
                target="_blank"
                rel="noopener noreferrer"
                class="video-btn mx-auto"
                style="background-color: #25D366;"
              >
                <i class="ti ti-brand-whatsapp text-white"></i>
              </a>
              <span class="text-white d-block mt-2"
                >{$_('home.how_it_works.try_now')}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- End Working Process Area -->

<!-- Why Choose Us Area -->
<div
  class="why-choose-us-area bg-img ptb-120 overflow-hidden"
  style="background-image: url('/assets/images/why-choose-bg.jpeg')"
>
  <div class="container mw-1690">
    <div class="row g-4">
      <div class="col-xl-6">
        <div
          class="why-choose-content"
          data-cues="slideInUp"
          data-duration="900"
        >
          <span class="top-title">{$_('home.why.badge')}</span>
          <h2 class="main-title">
            {$_('home.why.title')}
            <span class="under-line">{$_('home.why.title_highlight')}</span>{$_(
              'home.why.title_suffix',
            )}
          </h2>
          <p>{$_('home.why.body')}</p>

          <div class="d-flex why-choose-single-item">
            <div class="flex-shrink-0">
              <div class="icon">
                <img
                  src="/assets/images/why-choose1.png"
                  alt="instant transfers"
                  width="32"
                  height="32"
                  loading="lazy"
                />
              </div>
            </div>
            <div class="flex-grow-1">
              <h3>{$_('home.why.instant.title')}</h3>
              <p>{$_('home.why.instant.body')}</p>
            </div>
          </div>
          <div class="d-flex why-choose-single-item">
            <div class="flex-shrink-0">
              <div class="icon">
                <img src="/assets/images/why-choose2.png" alt="1% fee" width="30" height="30" loading="lazy" />
              </div>
            </div>
            <div class="flex-grow-1">
              <h3>{$_('home.why.fee.title')}</h3>
              <p>{$_('home.why.fee.body')}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="col-xl-6">
        <div class="why-choose-us-img position-relative z-1 text-center">
          <div class="reveal">
            <picture>
              <source srcset="/assets/images/no-app-needed.webp" type="image/webp" />
              <img
                src="/assets/images/no-app-needed.jpg"
                class="img"
                alt="sendsasa on mobile"
                width="600"
                height="400"
                style="max-width:100%;height:auto;"
                loading="lazy"
              />
            </picture>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- End Why Choose Us Area -->

<!-- Covering Area -->
<div class="covering-area ptb-120">
  <div class="container mw-1690">
    <div
      class="text-center mb-50 mt-0"
      data-cues="slideInUp"
      data-duration="900"
    >
      <span class="top-title">{$_('home.coverage.badge')}</span>
      <h2 class="main-title mx-auto mw-620">
        {$_('home.coverage.title')}
        <span class="under-line">{$_('home.coverage.title_highlight')}</span>
        {$_('home.coverage.title_suffix')}
      </h2>
    </div>
    <div
      class="row g-4 justify-content-center"
      data-cues="slideInUp"
      data-duration="900"
    >
      <div class="col-xxl-3 col-lg-4 col-sm-6">
        <div class="covering-single-item">
          <div class="d-flex align-items-center gap-25 mb-4">
            <div class="flex-shrink-0">
              <img
                src="/assets/images/flags/cameroon.png"
                alt="Cameroon"
                width="56"
                height="56"
                style="width:56px;height:56px;object-fit:cover;border-radius:50%;"
                loading="lazy"
              />
            </div>
            <div class="flex-grow-1">
              <h3 class="mb-0">{$_('home.coverage.cameroon.name')}</h3>
            </div>
          </div>
          <p>{$_('home.coverage.cameroon.desc')}</p>
        </div>
      </div>
      <div class="col-xxl-3 col-lg-4 col-sm-6">
        <div class="covering-single-item">
          <div class="d-flex align-items-center gap-25 mb-4">
            <div class="flex-shrink-0">
              <img
                src="/assets/images/flags/nigeria.png"
                alt="Nigeria"
                width="56"
                height="56"
                style="width:56px;height:56px;object-fit:cover;border-radius:50%;"
                loading="lazy"
              />
            </div>
            <div class="flex-grow-1">
              <h3 class="mb-0">{$_('home.coverage.nigeria.name')}</h3>
            </div>
          </div>
          <p>{$_('home.coverage.nigeria.desc')}</p>
        </div>
      </div>
      <div class="col-xxl-3 col-lg-4 col-sm-6">
        <div class="covering-single-item">
          <div class="d-flex align-items-center gap-25 mb-4">
            <div class="flex-shrink-0">
              <img
                src="/assets/images/flags/kenya.png"
                alt="Kenya"
                width="56"
                height="56"
                style="width:56px;height:56px;object-fit:cover;border-radius:50%;"
                loading="lazy"
              />
            </div>
            <div class="flex-grow-1">
              <h3 class="mb-0">{$_('home.coverage.kenya.name')}</h3>
            </div>
          </div>
          <p>{$_('home.coverage.kenya.desc')}</p>
        </div>
      </div>
      <div class="col-xxl-3 col-lg-4 col-sm-6">
        <div class="covering-single-item">
          <div class="d-flex align-items-center gap-25 mb-4">
            <div class="flex-shrink-0">
              <img
                src="/assets/images/flags/united-states.png"
                alt="United States"
                width="56"
                height="56"
                style="width:56px;height:56px;object-fit:cover;border-radius:50%;"
                loading="lazy"
              />
            </div>
            <div class="flex-grow-1">
              <h3 class="mb-0">{$_('home.coverage.usa.name')}</h3>
            </div>
          </div>
          <p>{$_('home.coverage.usa.desc')}</p>
        </div>
      </div>
      <div class="col-xxl-3 col-lg-4 col-sm-6">
        <div class="covering-single-item">
          <div class="d-flex align-items-center gap-25 mb-4">
            <div class="flex-shrink-0">
              <img
                src="/assets/images/france.png"
                alt="France"
                width="50"
                height="50"
                style="width:50px;height:50px;object-fit:cover;border-radius:50%;"
                loading="lazy"
              />
            </div>
            <div class="flex-grow-1">
              <h3 class="mb-0">{$_('home.coverage.france.name')}</h3>
            </div>
          </div>
          <p>{$_('home.coverage.france.desc')}</p>
        </div>
      </div>
      <div class="col-xxl-3 col-lg-4 col-sm-6">
        <div class="covering-single-item">
          <div class="d-flex align-items-center gap-25 mb-4">
            <div class="flex-shrink-0">
              <img
                src="/assets/images/flags/canada.png"
                alt="Canada"
                width="56"
                height="56"
                style="width:56px;height:56px;object-fit:cover;border-radius:50%;"
                loading="lazy"
              />
            </div>
            <div class="flex-grow-1">
              <h3 class="mb-0">{$_('home.coverage.canada.name')}</h3>
            </div>
          </div>
          <p>{$_('home.coverage.canada.desc')}</p>
        </div>
      </div>
      <div class="col-xxl-3 col-lg-4 col-sm-6">
        <div class="covering-single-item">
          <div class="d-flex align-items-center gap-25 mb-4">
            <div class="flex-shrink-0">
              <img
                src="/assets/images/flags/ghana.png"
                alt="Ghana"
                width="56"
                height="56"
                style="width:56px;height:56px;object-fit:cover;border-radius:50%;"
                loading="lazy"
              />
            </div>
            <div class="flex-grow-1">
              <h3 class="mb-0">{$_('home.coverage.ghana.name')}</h3>
            </div>
          </div>
          <p>{$_('home.coverage.ghana.desc')}</p>
        </div>
      </div>
      <div class="col-xxl-3 col-lg-4 col-sm-6">
        <div class="covering-single-item">
          <div class="d-flex align-items-center gap-25 mb-4">
            <div class="flex-shrink-0">
              <img
                src="/assets/images/flags/ivory-coast.png"
                alt="Ivory Coast"
                width="56"
                height="56"
                style="width:56px;height:56px;object-fit:cover;border-radius:50%;"
                loading="lazy"
              />
            </div>
            <div class="flex-grow-1">
              <h3 class="mb-0">{$_('home.coverage.ivory_coast.name')}</h3>
            </div>
          </div>
          <p>{$_('home.coverage.ivory_coast.desc')}</p>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- End Covering Area -->

<!-- Pricing Area -->
<div class="pricing-area pb-120">
  <div class="container mw-1690">
    <div class="row g-4">
      <div class="col-xl-6">
        <div class="pricing-content position-relative z-1">
          <div data-cues="slideInUp" data-duration="900">
            <span class="top-title">{$_('home.pricing.badge')}</span>
            <h2 class="main-title mw-100">
              {$_('home.pricing.title')}
              <span class="under-line"
                >{$_('home.pricing.title_highlight')}</span
              >{$_('home.pricing.title_suffix')}
            </h2>
            <p>{$_('home.pricing.body')}</p>
            <button
              class="default-btn border-0"
              data-bs-toggle="offcanvas"
              data-bs-target="#pricingOffcanvas"
              aria-controls="pricingOffcanvas"
            >
              {$_('home.pricing.compare')}
            </button>
          </div>
          <img
            src="/assets/images/shape4.png"
            class="position-absolute shape4 d-none d-xl-inline-block"
            alt="shape"
            loading="lazy"
            width="120"
            height="120"
          />
        </div>
      </div>
      <div class="col-xl-6" data-cues="slideInUp" data-duration="900">
        <div class="table-responsive pricing-table">
          <table class="table bg-gray2 rounded-5 align-middle">
            <tbody>
              <tr>
                <td class="bg-gray2 rounded-top-5 fs-18 fw-medium text-dark"
                  >{$_('home.pricing.table.sending')}</td
                >
                <td class="bg-dark-div text-center rounded-top-5">
                  <img
                    src="/assets/images/logo-white.png"
                    alt="SendSasa"
                    width="160"
                    height="40"
                    style="max-width: 160px; height: auto;"
                    loading="lazy"
                  />
                </td>
                <td class="text-center bg-gray2 rounded-top-5">
                  <img
                    src="/assets/images/western-union.svg"
                    alt="traditional bank"
                    width="220"
                    height="40"
                    style="max-width: 220px; height: auto;"
                    loading="lazy"
                  />
                </td>
              </tr>
              <tr>
                <td class="bg-gray2">
                  <span class="d-block fs-18 fw-medium"
                    >{$_('home.pricing.table.recipient_gets')}</span
                  >
                  <span class="d-block"
                    >{$_('home.pricing.table.recipient_after')}</span
                  >
                </td>
                <td class="bg-dark-div text-center">
                  <span class="d-block fs-18 fw-bold text-white"
                    >{$_('home.pricing.table.sendsasa_amount')}</span
                  >
                  <span class="d-block text-success"
                    >{$_('home.pricing.table.sendsasa_save')}</span
                  >
                </td>
                <td class="text-center bg-gray2">
                  <span class="d-block fs-18 text-dark fw-bold"
                    >{$_('home.pricing.table.wu_amount')}</span
                  >
                  <span class="d-block text-danger"
                    >{$_('home.pricing.table.wu_loss')}</span
                  >
                </td>
              </tr>
              <tr>
                <td class="bg-gray2">
                  <span class="d-block fs-18 fw-medium"
                    >{$_('home.pricing.table.transfer_fee')}</span
                  >
                </td>
                <td class="bg-dark-div text-center">
                  <span class="d-block fs-18 fw-bold text-white"
                    >{$_('home.pricing.table.sendsasa_fee')}</span
                  >
                  <span class="d-block text-white"
                    >{$_('home.pricing.table.sendsasa_no_sub')}</span
                  >
                </td>
                <td class="text-center bg-gray2">
                  <span class="d-block fs-18 text-dark fw-bold"
                    >{$_('home.pricing.table.wu_fee')}</span
                  >
                </td>
              </tr>
              <tr>
                <td class="bg-gray2">
                  <span class="d-block fs-18 fw-medium"
                    >{$_('home.pricing.table.transfer_time')}</span
                  >
                </td>
                <td class="bg-dark-div text-center">
                  <span class="d-block fs-18 fw-bold text-white"
                    >{$_('home.pricing.table.sendsasa_time')}</span
                  >
                  <span class="d-block text-white"
                    >{$_('home.pricing.table.sendsasa_247')}</span
                  >
                </td>
                <td class="text-center bg-gray2">
                  <span class="d-block fs-18 text-dark fw-bold"
                    >{$_('home.pricing.table.wu_time')}</span
                  >
                </td>
              </tr>
              <tr>
                <td class="bg-gray2 rounded-bottom-5">
                  <span class="d-block fs-18 fw-medium"
                    >{$_('home.pricing.table.app_required')}</span
                  >
                </td>
                <td class="bg-dark-div text-center rounded-bottom-5">
                  <span class="d-block fs-18 fw-bold text-white"
                    >{$_('home.pricing.table.sendsasa_app')}</span
                  >
                </td>
                <td class="text-center bg-gray2 rounded-bottom-5">
                  <span class="d-block fs-18 text-dark fw-bold"
                    >{$_('home.pricing.table.wu_app')}</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- End Pricing Area -->

<!-- Fee Calculator Offcanvas -->
<div
  class="offcanvas offcanvas-end"
  tabindex="-1"
  id="pricingOffcanvas"
  aria-labelledby="pricingOffcanvasLabel"
  data-bs-scroll="false"
  data-bs-backdrop="true"
  style="width: min(520px, 100vw);"
>
  <div class="offcanvas-header border-bottom pb-3">
    <div>
      <h5 class="offcanvas-title fw-bold mb-0" id="pricingOffcanvasLabel">
        Fee Calculator
      </h5>
      <p class="text-muted small mb-0 mt-1">
        See exactly what you pay before you send
      </p>
    </div>
    <button
      type="button"
      class="btn-close"
      data-bs-dismiss="offcanvas"
      aria-label="Close"
    ></button>
  </div>
  <div class="offcanvas-body p-3">
    <form
      class="transfer-money-form bg-dark-div2 position-relative"
      on:submit|preventDefault
    >
      <!-- You Send -->
      <span class="title">You Send ({sendProvider.currency})</span>
      <div class="d-flex align-items-center mb-35 input-bg">
        <input
          type="number"
          class="form-control"
          placeholder="19352"
          bind:value={sendAmount}
          min="1"
          max="999999999"
        />
        <div class="dropdown flex-shrink-0">
          <button
            type="button"
            class="btn d-flex align-items-center gap-2 px-3 text-white border-0 bg-transparent dropdown-toggle"
            data-bs-toggle="dropdown"
            aria-expanded="false"
            style="white-space:nowrap;"
          >
            <img
              src={sendProvider.flag}
              alt={sendProvider.currency}
              style="width:24px;height:24px;object-fit:cover;border-radius:50%;flex-shrink:0;"
            />
            <span class="fs-18 fw-semibold">{sendProvider.currency}</span>
          </button>
          <ul
            class="dropdown-menu dropdown-menu-end shadow"
            style="min-width:220px;background:#fff;border:1px solid rgba(0,0,0,.12);"
          >
            {#each providers as p}
              <li>
                <button
                  type="button"
                  class="dropdown-item d-flex align-items-center gap-3 py-2 px-3"
                  on:click={() => (sendProvider = p)}
                  style="color:#212529; background:{sendProvider.id === p.id
                    ? '#e8effd'
                    : 'transparent'};"
                >
                  <img
                    src={p.flag}
                    alt={p.currency}
                    style="width:28px;height:28px;object-fit:cover;border-radius:50%;flex-shrink:0;"
                  />
                  <div class="lh-sm">
                    <span
                      class="d-block fw-medium"
                      style="font-size:0.88rem;color:#212529;">{p.name}</span
                    >
                    <span
                      class="d-block"
                      style="font-size:0.78rem;color:#6c757d;"
                      >{p.currency}</span
                    >
                  </div>
                  {#if sendProvider.id === p.id}
                    <i class="ti ti-check ms-auto" style="color:#0b47cc;"></i>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <!-- Fee breakdown -->
      <ul class="p-0 list-unstyled info-list">
        <li
          class="d-flex flex-wrap align-items-center justify-content-between gap-6"
        >
          <div class="d-flex align-items-center gap-10">
            <i class="ti ti-minus"></i>
            <span class="text-white fs-18">{fmt(fee)} XAF</span>
          </div>
          <div class="d-flex align-items-center gap-6">
            <span class="text-white fs-18">SendSasa Fee (1%)</span>
            <img src="/assets/images/down.svg" alt="down" />
          </div>
        </li>
        <li
          class="d-flex flex-wrap align-items-center justify-content-between gap-6"
        >
          <div class="d-flex align-items-center gap-10">
            <i class="ti ti-equal"></i>
            <span class="text-white fs-18">{fmt(receiveXAF)} XAF</span>
          </div>
          <span class="text-white fs-18">Total After Fee</span>
        </li>
        <li
          class="d-flex flex-wrap align-items-center justify-content-between gap-6"
        >
          <div class="d-flex align-items-center gap-10">
            <i class="ti ti-clock"></i>
            <span class="text-white fs-18">Under 60 seconds</span>
          </div>
          <span class="text-white fs-18">Delivery Time</span>
        </li>
      </ul>

      <!-- Recipient Gets -->
      <span class="title">Recipient Gets ({receiveProvider.currency})</span>
      <div class="d-flex align-items-center mb-35 input-bg">
        <input
          type="text"
          class="form-control"
          value={fmt(recipientGets)}
          readonly
        />
        <div class="dropdown flex-shrink-0">
          <button
            type="button"
            class="btn d-flex align-items-center gap-2 px-3 text-white border-0 bg-transparent dropdown-toggle"
            data-bs-toggle="dropdown"
            aria-expanded="false"
            style="white-space:nowrap;"
          >
            <img
              src={receiveProvider.flag}
              alt={receiveProvider.currency}
              style="width:24px;height:24px;object-fit:cover;border-radius:50%;flex-shrink:0;"
            />
            <span class="fs-18 fw-semibold">{receiveProvider.currency}</span>
          </button>
          <ul
            class="dropdown-menu dropdown-menu-end shadow"
            style="min-width:220px;background:#fff;border:1px solid rgba(0,0,0,.12);"
          >
            {#each providers as p}
              <li>
                <button
                  type="button"
                  class="dropdown-item d-flex align-items-center gap-3 py-2 px-3"
                  on:click={() => (receiveProvider = p)}
                  style="color:#212529; background:{receiveProvider.id === p.id
                    ? '#e8effd'
                    : 'transparent'};"
                >
                  <img
                    src={p.flag}
                    alt={p.currency}
                    style="width:28px;height:28px;object-fit:cover;border-radius:50%;flex-shrink:0;"
                  />
                  <div class="lh-sm">
                    <span
                      class="d-block fw-medium"
                      style="font-size:0.88rem;color:#212529;">{p.name}</span
                    >
                    <span
                      class="d-block"
                      style="font-size:0.78rem;color:#6c757d;"
                      >{p.currency}</span
                    >
                  </div>
                  {#if receiveProvider.id === p.id}
                    <i class="ti ti-check ms-auto" style="color:#0b47cc;"></i>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </div>
      </div>

      {#if sendProvider.currency !== receiveProvider.currency}
        <p class="text-white-50 small mb-0" style="margin-top:-20px;">
          Rate: 1 XAF ≈ {(1 / toXAF[receiveProvider.currency]).toFixed(4)}
          {receiveProvider.currency} (indicative)
        </p>
      {/if}
    </form>
  </div>
</div>

<!-- WhatsApp CTA Area (replaces Apps Area) -->
<div
  class="apps-area ptb-120 bg-img"
  style="background-image: url('/assets/images/testimonial-bg.jpeg')"
>
  <div class="container mw-1690">
    <div class="row g-4">
      <div class="col-lg-6 overflow-hidden">
        <div class="apps-img h-100 reveal">
          <picture>
            <source srcset="/assets/images/apps-img.webp" type="image/webp" />
            <img
              src="/assets/images/apps-img.jpeg"
              class="object-fit-cover h-100 rounded-5"
              alt="sendsasa on whatsapp"
              width="600"
              height="700"
              loading="lazy"
            />
          </picture>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="apps-content ms-xl-5 ps-xl-4 position-relative">
          <div data-cues="slideInUp" data-duration="900">
            <span class="top-title">{$_('home.cta.badge')}</span>
            <h2 class="main-title mw-100">
              {$_('home.cta.title')}
              <span class="under-line">{$_('home.cta.title_highlight')}</span>
              {$_('home.cta.title_suffix')}
            </h2>
            <p>{$_('home.cta.body')}</p>
            <ul class="px-0 mt-4 pt-xl-3 mb-xl-5 mb-4 list-unstyled">
              <li class="d-flex align-items-center gap-12 mb-lg-4 mb-3">
                <img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                <span class="fs-18 text-secondary">{$_('home.cta.check1')}</span
                >
              </li>
              <li class="d-flex align-items-center gap-12 mb-lg-4 mb-3">
                <img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                <span class="fs-18 text-secondary">{$_('home.cta.check2')}</span
                >
              </li>
              <li class="d-flex align-items-center gap-12 mb-lg-4 mb-3">
                <img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                <span class="fs-18 text-secondary">{$_('home.cta.check3')}</span
                >
              </li>
              <li class="d-flex align-items-center gap-12">
                <img src="/assets/images/check2.svg" alt="check" width="20" height="20" loading="lazy" />
                <span class="fs-18 text-secondary">{$_('home.cta.check4')}</span
                >
              </li>
            </ul>

            <div class="d-flex gap-30">
              <a
                href="https://api.whatsapp.com/send/?phone=14694079616&text=Hello&type=phone_number&app_absent=0"
                target="_blank"
                rel="noopener noreferrer"
                class="default-btn"
              >
                <i class="ti ti-brand-whatsapp me-2"></i>
                {$_('home.cta.btn')}
              </a>
            </div>
          </div>

          <img
            src="/assets/images/shape4.png"
            class="position-absolute top-50 end-0 translate-middle-y shape4 d-none d-xl-inline-block"
            alt="shape"
            loading="lazy"
            width="120"
            height="120"
          />
        </div>
      </div>
    </div>
  </div>
</div>
<!-- End WhatsApp CTA Area -->

<!-- Pitch Video Area -->
<div class="ptb-120">
  <div class="container mw-1690">
    <div class="text-center mb-50" data-cues="slideInUp" data-duration="900">
      <span class="top-title">{$_('home.pitch.badge')}</span>
      <h2 class="main-title mx-auto">
        {$_('home.pitch.title')}
        <span class="under-line">{$_('home.pitch.title_highlight')}</span>
      </h2>
      <p class="mx-auto mt-3" style="max-width: 620px;">
        {$_('home.pitch.body')}
      </p>
    </div>
    <div data-cues="slideInUp" data-duration="900">
      <div class="mx-auto rounded overflow-hidden" style="max-width: 800px;">
        <div style="position: relative; padding-bottom: 56.25%; height: 0;">
          {#if videoLoaded}
            <iframe
              src="https://www.youtube.com/embed/ErQ4Vm7jK08?si=Wme42brW-RwlrHS0&autoplay=1"
              title="SendSasa Pitch — XRPL Commons Demo Day"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
            ></iframe>
          {:else}
            <button
              on:click={() => (videoLoaded = true)}
              aria-label="Play SendSasa pitch video"
              style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;padding:0;cursor:pointer;background:#000;"
            >
              <img
                src="https://i.ytimg.com/vi/ErQ4Vm7jK08/maxresdefault.jpg"
                alt="SendSasa Pitch — XRPL Commons Demo Day"
                loading="lazy"
                width="1280"
                height="720"
                style="width:100%;height:100%;object-fit:cover;display:block;"
              />
              <span aria-hidden="true" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:68px;height:48px;background:#ff0000;border-radius:12px;display:flex;align-items:center;justify-content:center;">
                <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </span>
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
<!-- End Pitch Video Area -->

<!-- FAQ Area -->
<div
  class="faq-area ptb-120 bg-img"
  style="background-image: url('/assets/images/faq-bg.jpeg')"
>
  <div class="container mw-1690">
    <div class="row g-4 mb-50" data-cues="slideInUp" data-duration="900">
      <div class="col-lg-3">
        <span class="top-title">{$_('home.faq.badge')}</span>
      </div>
      <div class="col-lg-6">
        <h2 class="main-title mx-lg-auto">
          {$_('home.faq.title')}
          <span class="under-line">{$_('home.faq.title_highlight')}</span>
          {$_('home.faq.title_suffix')}
        </h2>
      </div>
      <div class="col-lg-3">
        <div class="d-flex justify-content-lg-end">
          <a href="/faqs" class="default-btn">{$_('home.faq.more')}</a>
        </div>
      </div>
    </div>
    <div class="row g-4">
      <div class="col-lg-6">
        <div
          class="accordion faq-wrapper"
          id="accordionFaq"
          data-cues="slideInUp"
          data-duration="900"
        >
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button
                class="accordion-button text-secondary"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target="#faqOne"
                aria-expanded="true"
                aria-controls="faqOne"
              >
                {$_('home.faq.q1')}
              </button>
            </h2>
            <div
              id="faqOne"
              class="accordion-collapse collapse show"
              data-bs-parent="#accordionFaq"
            >
              <div class="accordion-body">
                <p>{$_('home.faq.a1')}</p>
              </div>
            </div>
          </div>
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button
                class="accordion-button text-secondary collapsed"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target="#faqTwo"
                aria-expanded="false"
                aria-controls="faqTwo"
              >
                {$_('home.faq.q2')}
              </button>
            </h2>
            <div
              id="faqTwo"
              class="accordion-collapse collapse"
              data-bs-parent="#accordionFaq"
            >
              <div class="accordion-body">
                <p>{$_('home.faq.a2')}</p>
              </div>
            </div>
          </div>
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button
                class="accordion-button text-secondary collapsed"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target="#faqThree"
                aria-expanded="false"
                aria-controls="faqThree"
              >
                {$_('home.faq.q3')}
              </button>
            </h2>
            <div
              id="faqThree"
              class="accordion-collapse collapse"
              data-bs-parent="#accordionFaq"
            >
              <div class="accordion-body">
                <p>{$_('home.faq.a3')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div
          class="accordion faq-wrapper"
          id="accordionFaq2"
          data-cues="slideInUp"
          data-duration="900"
        >
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button
                class="accordion-button text-secondary"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target="#faqFour"
                aria-expanded="true"
                aria-controls="faqFour"
              >
                {$_('home.faq.q4')}
              </button>
            </h2>
            <div
              id="faqFour"
              class="accordion-collapse collapse show"
              data-bs-parent="#accordionFaq2"
            >
              <div class="accordion-body">
                <p>{$_('home.faq.a4')}</p>
              </div>
            </div>
          </div>
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button
                class="accordion-button text-secondary collapsed"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target="#faqFive"
                aria-expanded="false"
                aria-controls="faqFive"
              >
                {$_('home.faq.q5')}
              </button>
            </h2>
            <div
              id="faqFive"
              class="accordion-collapse collapse"
              data-bs-parent="#accordionFaq2"
            >
              <div class="accordion-body">
                <p>{$_('home.faq.a5')}</p>
              </div>
            </div>
          </div>
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button
                class="accordion-button text-secondary collapsed"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target="#faqSix"
                aria-expanded="false"
                aria-controls="faqSix"
              >
                {$_('home.faq.q6')}
              </button>
            </h2>
            <div
              id="faqSix"
              class="accordion-collapse collapse"
              data-bs-parent="#accordionFaq2"
            >
              <div class="accordion-body">
                <p>{$_('home.faq.a6')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- End FAQ Area -->
