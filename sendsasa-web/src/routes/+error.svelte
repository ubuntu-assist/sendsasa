<script lang="ts">
	import { page } from '$app/stores';
</script>

<svelte:head>
	<title>{$page.status} — SendSasa</title>
</svelte:head>

<div class="error-area ptb-120 bg-img" style="background-image: url('/assets/images/page-bg.png')">
	<div class="container mw-1690">
		<div class="text-center" data-cues="slideInUp" data-duration="900">
			<h1 class="display-1 fw-bold text-primary">{$page.status}</h1>
			<h2 class="main-title">{$page.error?.message ?? 'Page Not Found'}</h2>
			<p class="text-secondary mb-5">The page you are looking for does not exist or has been moved.</p>
			<a href="/" class="default-btn">Back to Home</a>
		</div>
	</div>
</div>
