<script lang="ts">
	import { site } from '$lib/data/site';
</script>

<div class="header-area bg-dark-div">
	<div class="container mw-1690">
		<div class="row align-items-center gy-2">
			<div class="col-lg-4 col-md-6">
				<div class="d-flex justify-content-center justify-content-md-start link-social-wrap align-items-center">
					<ul class="d-flex align-items-center p-0 m-0 list-unstyled header-info">
						<li class="d-flex align-items-center gap-10" style="white-space: nowrap;">
							<span class="fw-bold">Support:</span>
							<a href="mailto:{site.email}" class="text-decoration-none">{site.email}</a>
						</li>
					</ul>
				</div>
			</div>
			<div class="col-lg-4">
				<div class="d-flex link-social-wrap align-items-center justify-content-center justify-content-lg-end">
					<div class="social-link d-flex align-items-center">
						<a href={site.social.twitter} target="_blank" rel="noopener noreferrer">
							<i class="ti ti-brand-x"></i>
						</a>
						<a href={site.social.linkedin} target="_blank" rel="noopener noreferrer">
							<i class="ti ti-brand-linkedin"></i>
						</a>
					</div>
					<div class="dropdown language">
						<button class="btn btn-secondary bg-transparent border-0 gap-10 d-flex align-items-center p-0" type="button" data-bs-toggle="dropdown" aria-expanded="false">
							<img src="/assets/images/united-kingdom.png" alt="united-kingdom" style="width:20px;height:20px;object-fit:cover;border-radius:50%;" />
							English
						</button>
						<ul class="dropdown-menu">
							<li>
								<a class="dropdown-item d-flex align-items-center gap-10 fs-15 fw-normal py-2" href="/">
									<img src="/assets/images/uk.png" alt="uk" style="width:20px;height:20px;object-fit:cover;border-radius:50%;" />
									English
								</a>
							</li>
							<li>
								<a class="dropdown-item d-flex align-items-center gap-10 fs-15 fw-normal py-2" href="/">
									<img src="/assets/images/france.png" alt="france" style="width:20px;height:20px;object-fit:cover;border-radius:50%;" />
									Français
								</a>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
