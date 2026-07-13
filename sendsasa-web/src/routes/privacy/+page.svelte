<script lang="ts">
  import PageBanner from '$lib/components/PageBanner.svelte'
</script>

<svelte:head>
  <title>Privacy Policy — SendSasa</title>
</svelte:head>

<PageBanner title="Privacy Policy" breadcrumb="Privacy Policy" />

<div class="terms-area ptb-120">
  <div class="container mw-1690">
    <div class="row justify-content-center">
      <div class="col-lg-9">
        <div class="terms-content" data-cues="slideInUp" data-duration="900">
          <h3>1. Information We Collect</h3>
          <p>
            When you use SendSasa, we collect your WhatsApp phone number, the
            names and numbers of people you send money to, and the amounts and
            dates of your transactions. We do not collect your PIN — it is
            hashed before it reaches our servers.
          </p>

          <h3>2. How We Use Your Information</h3>
          <p>
            We use your information to process transfers, prevent fraud, improve
            our service, and send you transaction notifications on WhatsApp. We
            do not sell your personal information to anyone.
          </p>

          <h3>3. Who Sees Your Information</h3>
          <p>
            Your transaction data is shared with our payment partners (MTN,
            Orange, and other mobile money operators) only to the extent
            necessary to process your transfer. We share data with regulators
            when required by law.
          </p>

          <h3>4. How We Protect Your Data</h3>
          <p>
            All data is encrypted in transit and at rest. Your PIN is stored as
            a one-way hash — even our own team cannot see it. We use
            industry-standard security practices and conduct regular security
            reviews.
          </p>

          <h3>5. Your Rights</h3>
          <p>
            You can request a copy of your data, ask us to correct inaccurate
            information, or request deletion of your account at any time by
            messaging us on WhatsApp or emailing support@sendsasa.com.
          </p>

          <h3>6. Cookies and Tracking</h3>
          <p>
            SendSasa operates through WhatsApp and does not use cookies or
            browser tracking. This website uses minimal analytics to understand
            how many visitors we have, but does not track individuals.
          </p>

          <h3>7. Changes to This Policy</h3>
          <p>
            We will notify you via WhatsApp if we make significant changes to
            this privacy policy. The date at the top of this page shows when it
            was last updated.
          </p>

          <p class="text-secondary mt-5">
            Last updated: June 2026. Questions? Email us at support@sendsasa.com.
          </p>
        </div>
      </div>
    </div>
  </div>
</div>
