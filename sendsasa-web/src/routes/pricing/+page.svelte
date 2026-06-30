<script lang="ts">
  import PageBanner from '$lib/components/PageBanner.svelte'

  let sendAmount = 19352
  $: fee = Math.max(100, Math.min(2000, Math.round(sendAmount * 0.01)))
  $: recipientGets = sendAmount - fee

  function fmt(n: number) {
    return Math.round(n).toLocaleString('fr-FR')
  }
</script>

<svelte:head>
  <title>Pricing — SendSasa</title>
  <meta
    name="description"
    content="SendSasa charges 1% flat on every transfer. No subscription. No hidden fees. Min 100 XAF, max 2,000 XAF."
  />
</svelte:head>

<PageBanner title="Pricing" breadcrumb="Pricing" />

<!-- Pricing Area -->
<div class="pricing-area ptb-120" id="pricing-plans">
  <div class="container mw-1690">
    <div class="text-center mb-60 mt-0">
      <span class="top-title">Our Pricing</span>
      <h2 class="main-title mx-auto mw-620">
        We Charge As Little As <span class="under-line">Possible</span> No Subscription
        Fee
      </h2>
    </div>

    <div class="row g-4 justify-content-center">
      <div class="col-xxl-4 col-md-6">
        <div class="pricing-single-item">
          <div class="d-flex align-items-center price-header">
            <div class="flex-grow-1">
              <h3>Starter</h3>
              <h1>Free/ <sub>Always</sub></h1>
            </div>
            <div class="flex-shrink-0">
              <img src="/assets/images/pricing1.png" alt="pricing" />
            </div>
          </div>

          <h4>What's Included in Plan:</h4>
          <ul class="px-0 list-unstyled">
            <li class="d-flex align-items-center justify-content-between">
              <span>Receive money from anyone</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>Check account balance</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>View transaction history</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>Join Njangi or SplitChat groups</span>
              <i class="ti ti-xbox-x-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>TrustLock escrow &amp; Send Money</span>
              <i class="ti ti-xbox-x-filled"></i>
            </li>
          </ul>
          <a
            href="https://api.whatsapp.com/send/?phone=14694079616&text=Hello&type=phone_number&app_absent=0"
            target="_blank"
            rel="noopener noreferrer"
            class="default-btn w-100 active"
          >
            Get Started
          </a>
        </div>
      </div>
      <div class="col-xxl-4 col-md-6">
        <div class="pricing-single-item">
          <div class="d-flex align-items-center price-header">
            <div class="flex-grow-1">
              <h3>Personal</h3>
              <h1>1%/ <sub>Per Transfer</sub></h1>
            </div>
            <div class="flex-shrink-0">
              <img src="/assets/images/pricing2.png" alt="pricing" />
            </div>
          </div>

          <h4>What's Included in Plan:</h4>
          <ul class="px-0 list-unstyled">
            <li class="d-flex align-items-center justify-content-between">
              <span>Send money across Africa (MTN, Orange…)</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>TrustLock escrow for safe deals</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>NjangiBot rotating savings circles</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>SplitChat group collections</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>PayDay bulk payroll (up to 100)</span>
              <i class="ti ti-xbox-x-filled"></i>
            </li>
          </ul>
          <a
            href="https://api.whatsapp.com/send/?phone=14694079616&text=Hello&type=phone_number&app_absent=0"
            target="_blank"
            rel="noopener noreferrer"
            class="default-btn w-100"
          >
            Get Started
          </a>
        </div>
      </div>
      <div class="col-xxl-4 col-md-6">
        <div class="pricing-single-item">
          <div class="d-flex align-items-center price-header">
            <div class="flex-grow-1">
              <h3>Business</h3>
              <h1>1%/ <sub>Per Transfer</sub></h1>
            </div>
            <div class="flex-shrink-0">
              <img src="/assets/images/pricing3.png" alt="pricing" />
            </div>
          </div>

          <h4>What's Included in Plan:</h4>
          <ul class="px-0 list-unstyled">
            <li class="d-flex align-items-center justify-content-between">
              <span>Everything in Personal</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>PayDay bulk payroll (up to 100 people)</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>SafiPay professional invoicing</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>Payment confirmation receipts</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
            <li class="d-flex align-items-center justify-content-between">
              <span>Volume discounts available on request</span>
              <i class="ti ti-circle-check-filled"></i>
            </li>
          </ul>
          <a href="/contact" class="default-btn w-100 active">
            Contact Sales
          </a>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Partner Area -->
<div class="partner-area pb-120">
  <div class="container mw-1690">
    <span
      class="partner-title text-center d-block mb-50 mt-0 text-secondary"
      data-cue="slideInLeft"
      data-duration="900"
      >WE ARE PARTNERED WITH MORE THAN 1000+ COMPANIES AROUND THE GLOBE</span
    >
    <div class="swiper partner-slide2 text-center">
      <div class="swiper-wrapper align-items-center">
        <div class="swiper-slide">
          <img src="/assets/images/partner6.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner7.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner8.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner9.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner10.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner11.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner6.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner7.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner8.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner9.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner10.png" alt="partner" />
        </div>
        <div class="swiper-slide">
          <img src="/assets/images/partner11.png" alt="partner" />
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Fee Calculator -->
<div class="testimonial-area ptb-120">
  <div class="container mw-1690">
    <div class="row g-4 mb-50" data-cues="slideInUp" data-duration="900">
      <div class="col-lg-6">
        <span class="top-title">fee calculator</span>
        <h2 class="main-title ms-0">
          See Exactly What You <span class="under-line">Pay</span> Before You Send
        </h2>
      </div>
      <div class="col-lg-6">
        <div class="d-flex justify-content-lg-end">
          <a href="/contact" class="default-btn">Get In Touch</a>
        </div>
      </div>
    </div>

    <div
      class="row justify-content-center g-4"
      data-cues="slideInUp"
      data-duration="900"
    >
      <div class="col-lg-7">
        <!-- Fee Calculator -->
        <form
          class="transfer-money-form bg-dark-div2 position-relative"
          on:submit|preventDefault
        >
          <span class="title">You Send (XAF)</span>
          <div class="d-flex align-items-center mb-35 input-bg">
            <input
              type="number"
              class="form-control"
              placeholder="19352"
              bind:value={sendAmount}
              min="500"
              max="5000000"
            />
            <div class="d-flex align-items-center px-3 gap-8 flex-shrink-0">
              <img
                src="/assets/images/flags/south-africa.png"
                alt="xaf"
                style="width:24px;height:24px;object-fit:cover;border-radius:50%;"
              />
              <span class="fs-20 fw-semibold text-white">XAF</span>
            </div>
          </div>

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
                <span class="text-white fs-18">{fmt(recipientGets)} XAF</span>
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

          <span class="title">Recipient Gets (XAF)</span>
          <div class="d-flex align-items-center mb-35 input-bg">
            <input
              type="text"
              class="form-control"
              value={fmt(recipientGets)}
              readonly
            />
            <div class="d-flex align-items-center px-3 gap-8 flex-shrink-0">
              <img
                src="/assets/images/flags/south-africa.png"
                alt="xaf"
                style="width:24px;height:24px;object-fit:cover;border-radius:50%;"
              />
              <span class="fs-20 fw-semibold text-white">XAF</span>
            </div>
          </div>

          <span class="fs-18 text-white notification"
            >Arrives in under 60 seconds, available 24 hours a day</span
          >

          <div class="d-flex align-items-center gap-20 recipient-btn flex-wrap">
            <a href="#pricing-plans" class="default-btn">View Plans</a>
            <a
              href="https://api.whatsapp.com/send/?phone=14694079616&text=Hello&type=phone_number&app_absent=0"
              target="_blank"
              rel="noopener noreferrer"
              class="default-btn active">Get Started</a
            >
          </div>
        </form>
      </div>
    </div>
  </div>
</div>

<!-- Pay Support Area -->
<div class="pay-support-area pb-120">
  <div class="container mw-1690">
    <span
      class="partner-title text-center mb-50 d-block text-secondary"
      data-cues="slideInUp"
      data-duration="900"
      >ACCEPTED BY ALL MAJOR MOBILE MONEY PROVIDERS IN CENTRAL AND WEST AFRICA</span
    >
    <div
      class="d-flex flex-wrap gap-10 justify-content-between align-items-center"
      data-cues="slideInUp"
      data-duration="900"
    >
      <img src="/assets/images/visa2.png" alt="visa" />
      <img src="/assets/images/apple-pay2.png" alt="apple-pay" />
      <img src="/assets/images/paypal2.png" alt="paypal" />
      <img src="/assets/images/city-max2.png" alt="city-max" />
      <img src="/assets/images/discover2.png" alt="discover" />
      <img src="/assets/images/master-card2.png" alt="master-card" />
    </div>
  </div>
</div>
