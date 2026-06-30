<script lang="ts">
  import PageBanner from '$lib/components/PageBanner.svelte'

  const team = [
    {
      name: 'Duclair Fopa',
      role: 'Founder & CEO',
      bio: 'Built SendSasa to replace the Western Union trip his mother made every month.',
      img: '/assets/images/team1.jpg',
    },
    {
      name: 'Aisha Mbow',
      role: 'CTO',
      bio: 'Former fintech engineer with 8 years experience building mobile money infrastructure.',
      img: '/assets/images/team2.jpg',
    },
    {
      name: 'Jean-Marc Essono',
      role: 'Head of Partnerships',
      bio: 'Leads mobile money operator relationships across Cameroon, Nigeria and Kenya.',
      img: '/assets/images/team3.jpg',
    },
    {
      name: 'Fatima Diallo',
      role: 'Head of Customer Success',
      bio: 'Ensures every user can send money without needing a tutorial.',
      img: '/assets/images/team4.jpg',
    },
  ]
</script>

<svelte:head>
  <title>Our Team — SendSasa</title>
</svelte:head>

<PageBanner title="Our Team" breadcrumb="Team" />

<div class="team-area ptb-120">
  <div class="container mw-1690">
    <div class="text-center mb-50" data-cues="slideInUp" data-duration="900">
      <span class="top-title">the people behind sendsasa</span>
      <h2 class="main-title mx-auto">
        Built by Africans, <span class="under-line">For</span> Africa
      </h2>
    </div>
    <div
      class="row g-4 justify-content-center"
      data-cues="slideInUp"
      data-duration="900"
    >
      {#each team as member}
        <div class="col-lg-3 col-sm-6">
          <div class="team-single-item text-center">
            <div class="team-img mb-4">
              <img
                src={member.img}
                alt={member.name}
                class="img-fluid rounded-5 w-100"
              />
            </div>
            <h3>{member.name}</h3>
            <span class="top-title d-block mb-2">{member.role}</span>
            <p class="text-secondary">{member.bio}</p>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
