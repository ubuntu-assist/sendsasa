<script lang="ts">
  import PageBanner from '$lib/components/PageBanner.svelte'
  import { _ } from 'svelte-i18n'

  const featureSlugs = [
    { slug: 'send_money', icon: '/assets/images/feature-icon1.png', image: '/assets/images/feature1.png' },
    { slug: 'trustlock',  icon: '/assets/images/feature-icon2.png', image: '/assets/images/feature4.png' },
    { slug: 'njangibot',  icon: '/assets/images/feature-icon3.png', image: '/assets/images/feature5.png' },
    { slug: 'splitchat',  icon: '/assets/images/feature-icon1.png', image: '/assets/images/feature6.png' },
    { slug: 'payday',     icon: '/assets/images/feature-icon2.png', image: '/assets/images/feature2.png' },
    { slug: 'safipay',    icon: '/assets/images/feature-icon3.png', image: '/assets/images/feature3.png' },
  ]
</script>

<svelte:head>
  <title>{$_('features_page.meta_title')}</title>
  <meta name="description" content={$_('features_page.meta_desc')} />
</svelte:head>

<PageBanner title={$_('features_page.page_title')} breadcrumb={$_('features_page.page_title')} />

<!-- Features Grid -->
<div class="services-area ptb-120">
  <div class="container mw-1690">
    <div class="text-center mb-50" data-cues="slideInUp" data-duration="900">
      <span class="top-title">{$_('features_page.badge')}</span>
      <h2 class="main-title mx-auto">
        {$_('features_page.title')} <span class="under-line">{$_('features_page.title_highlight')}</span> {$_('features_page.title_suffix')}
      </h2>
    </div>
    <div
      class="row g-4 justify-content-center"
      data-cues="slideInUp"
      data-duration="900"
    >
      {#each featureSlugs as f}
        <div class="col-lg-4 col-md-6">
          <div class="services-single-item d-flex flex-column h-100">
            <div class="services-img" style="height:280px;display:flex;align-items:center;justify-content:center;">
              <img src={f.image} alt={$_(`features_page.features.${f.slug}.title`)} style="max-height:280px;width:auto;max-width:100%;object-fit:contain;" />
            </div>
            <div class="services-content flex-grow-1 d-flex flex-column">
              <div class="d-flex align-items-center gap-20 mb-3">
                <div class="flex-shrink-0">
                  <div class="icon"><img src={f.icon} alt={$_(`features_page.features.${f.slug}.title`)} /></div>
                </div>
                <div class="flex-grow-1">
                  <h3 class="mb-0">{$_(`features_page.features.${f.slug}.title`)}</h3>
                  <span class="top-title d-block mt-1">{$_(`features_page.features.${f.slug}.subtitle`)}</span>
                </div>
              </div>
              <p class="flex-grow-1">{$_(`features_page.features.${f.slug}.description`)}</p>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
