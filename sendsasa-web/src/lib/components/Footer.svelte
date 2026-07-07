<script lang="ts">
  import { site } from '$lib/data/site'
  import { _ } from 'svelte-i18n'
</script>

<footer class="py-5" style="background:#fff;">
  <div class="container mw-1690">
    <div class="row g-4 align-items-stretch">
      <!-- Brand -->
      <div class="col-lg-6">
        <div
          class="p-4 rounded-4 h-100 d-flex flex-column"
          style="background:#0B47CC;"
        >
          <a href="/" class="d-inline-block mb-4">
            <img
              src="/assets/images/logo-white.png"
              alt="SendSasa"
              style="height:40px;width:auto;"
            />
          </a>
          <p class="fw-bold fs-4 mb-2 text-white">{$_('footer.tagline')}</p>
          <p class="mb-4" style="color:rgba(255,255,255,.75);">
            {$_('footer.description')}
          </p>
          <a
            href="mailto:support@sendsasa.com"
            class="text-decoration-none mb-4 d-inline-flex align-items-center gap-2"
            style="color:rgba(255,255,255,.8);"
          >
            <i class="ti ti-mail-filled"></i> support@sendsasa.com
          </a>
          <div
            class="mt-auto pt-3 d-flex flex-wrap align-items-center justify-content-between gap-2"
            style="border-top:1px solid rgba(255,255,255,.2);"
          >
            <div class="d-flex gap-3">
              <a href="/privacy" class="text-decoration-none small text-white"
                >{$_('footer.privacy')}</a
              >
              <a href="/terms" class="text-decoration-none small text-white"
                >{$_('footer.terms')}</a
              >
            </div>
            <span class="small" style="color:rgba(255,255,255,.6);"
              >{$_('footer.copyright')}</span
            >
          </div>
        </div>
      </div>

      <!-- LinkedIn + X -->
      <div class="col-lg-3">
        <div class="d-flex flex-column gap-4 h-100">
          <a
            href={site.social.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            class="social-card text-decoration-none rounded-4 flex-grow-1 d-flex flex-column justify-content-between p-4"
            style="background:#0A66C2;"
          >
            <div class="d-flex align-items-center justify-content-between">
              <span class="text-white fw-semibold small">LinkedIn</span>
              <i
                class="ti ti-arrow-up-right text-white social-arrow"
                style="font-size:1.1rem;"
              ></i>
            </div>
            <p
              class="text-white my-3"
              style="font-size:1.15rem;line-height:1.4;"
            >
              {$_('footer.linkedin_desc')}
            </p>
            <div class="d-flex align-items-center justify-content-between">
              <span class="join-label text-white small"
                >{$_('footer.join')}</span
              >
              <div
                class="social-icon d-flex align-items-center justify-content-center rounded-circle bg-white"
                style="width:42px;height:42px;flex-shrink:0;"
              >
                <i
                  class="ti ti-brand-linkedin"
                  style="font-size:1.3rem;color:#0A66C2;"
                ></i>
              </div>
            </div>
          </a>

          <a
            href={site.social.twitter}
            target="_blank"
            rel="noopener noreferrer"
            class="social-card text-decoration-none rounded-4 d-flex flex-column justify-content-between p-4"
            style="background:#000;"
          >
            <div class="d-flex align-items-center justify-content-between">
              <span class="text-white fw-semibold small">X</span>
              <i
                class="ti ti-arrow-up-right text-white social-arrow"
                style="font-size:1.1rem;"
              ></i>
            </div>
            <p
              class="text-white my-3"
              style="font-size:1.15rem;line-height:1.4;"
            >
              {$_('footer.twitter_desc')}
            </p>
            <div class="d-flex align-items-center justify-content-between">
              <span class="join-label text-white small"
                >{$_('footer.join')}</span
              >
              <div
                class="social-icon d-flex align-items-center justify-content-center rounded-circle bg-white"
                style="width:42px;height:42px;flex-shrink:0;"
              >
                <i class="ti ti-brand-x" style="font-size:1.3rem;color:#000;"
                ></i>
              </div>
            </div>
          </a>
        </div>
      </div>

      <!-- Facebook + TikTok -->
      <div class="col-lg-3">
        <div class="d-flex flex-column gap-4 h-100">
          <a
            href={site.social.facebook}
            target="_blank"
            rel="noopener noreferrer"
            class="social-card text-decoration-none rounded-4 flex-grow-1 d-flex flex-column justify-content-between p-4"
            style="background:#1877F2;"
          >
            <div class="d-flex align-items-center justify-content-between">
              <span class="text-white fw-semibold small">Facebook</span>
              <i class="ti ti-arrow-up-right text-white social-arrow" style="font-size:1.1rem;"></i>
            </div>
            <p class="text-white my-3" style="font-size:1.15rem;line-height:1.4;">
              {$_('footer.facebook_desc')}
            </p>
            <div class="d-flex align-items-center justify-content-between">
              <span class="join-label text-white small">{$_('footer.join')}</span>
              <div
                class="social-icon d-flex align-items-center justify-content-center rounded-circle bg-white"
                style="width:42px;height:42px;flex-shrink:0;"
              >
                <i class="ti ti-brand-facebook" style="font-size:1.3rem;color:#1877F2;"></i>
              </div>
            </div>
          </a>

          <a
            href={site.social.tiktok}
            target="_blank"
            rel="noopener noreferrer"
            class="social-card text-decoration-none rounded-4 d-flex flex-column justify-content-between p-4"
            style="background:#010101;"
          >
            <div class="d-flex align-items-center justify-content-between">
              <span class="text-white fw-semibold small">TikTok</span>
              <i class="ti ti-arrow-up-right text-white social-arrow" style="font-size:1.1rem;"></i>
            </div>
            <p class="text-white my-3" style="font-size:1.15rem;line-height:1.4;">
              {$_('footer.tiktok_desc')}
            </p>
            <div class="d-flex align-items-center justify-content-between">
              <span class="join-label text-white small">{$_('footer.join')}</span>
              <div
                class="social-icon d-flex align-items-center justify-content-center rounded-circle bg-white"
                style="width:42px;height:42px;flex-shrink:0;"
              >
                <i class="ti ti-brand-tiktok" style="font-size:1.3rem;color:#010101;"></i>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  </div>
</footer>

<style>
  .join-label {
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .social-card:hover .join-label {
    opacity: 1;
  }
  .social-card .social-arrow,
  .social-card .social-icon {
    transition: transform 0.3s ease;
  }
  .social-card:hover .social-arrow,
  .social-card:hover .social-icon {
    transform: scale(1.2);
  }
</style>
