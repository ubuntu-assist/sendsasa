<script lang="ts">
	export let title: string;
	export let breadcrumb: string;
</script>

<div class="page-banner-area bg-img" style="background-image: url('/assets/images/page-bg.png')">
	<div class="container position-relative">
		<div class="page-banner-content text-center">
			<h2>{title}</h2>
			<ul class="p-0 m-0 list-unstyled d-flex align-items-center justify-content-center breadcrumbs">
				<li><a href="/">Home</a></li>
				<li><span>{breadcrumb}</span></li>
			</ul>
		</div>
		<img src="/assets/images/shape14.png" class="position-absolute top-50 start-0 translate-middle-y ps-5 ms-3 d-none d-xl-inline-block transform-unset" alt="shape" />
		<img src="/assets/images/shape15.png" class="position-absolute top-50 end-0 translate-middle-y d-none d-xl-inline-block transform-unset" alt="shape" />
	</div>
</div>
