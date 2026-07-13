<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { afterNavigate } from '$app/navigation';

	let gsapRef: any = null;
	let ukiyoRef: any = null;

	function initUkiyo() {
		const w = window as any;
		if (!w.Ukiyo) return;
		// Ukiyo has no destroy method — replacing the reference is enough since the
		// old instance stops receiving scroll events once its elements leave the DOM
		ukiyoRef = new w.Ukiyo('.ukiyo');
	}

	function initReveal() {
		const w = window as any;
		const gsap = gsapRef;
		const ScrollTrigger = w._ScrollTrigger;
		if (!gsap || !ScrollTrigger) return;

		// Kill all existing ScrollTrigger instances before re-creating
		ScrollTrigger.getAll().forEach((t: any) => t.kill());

		document.querySelectorAll<HTMLElement>('.reveal').forEach((el) => {
			const img = el.querySelector('img');
			const tl = gsap.timeline({
				scrollTrigger: { trigger: el, toggleActions: 'restart none none reset' }
			});
			tl.set(el, { autoAlpha: 1 });
			tl.from(el, 1.5, { xPercent: -100, ease: 'power2.out' });
			if (img) tl.from(img, 1.5, { xPercent: 100, scale: 1.3, delay: -1.5, ease: 'power2.out' });
		});

		ScrollTrigger.refresh();
	}

	function initSwipers() {
		const w = window as any;
		const Swiper = w.Swiper;
		if (!Swiper) return;

		const configs: { selector: string; options: any }[] = [
			{
				selector: '.partner-slide',
				options: {
					slidesPerView: 2, spaceBetween: 30, loop: true,
					autoplay: { delay: 3000, disableOnInteraction: false, pauseOnMouseEnter: true },
					breakpoints: { 475: { slidesPerView: 3 }, 768: { slidesPerView: 4 }, 992: { slidesPerView: 5 } }
				}
			},
			{
				selector: '.partner-slide2',
				options: {
					slidesPerView: 2, spaceBetween: 30, loop: true,
					autoplay: { delay: 2500, disableOnInteraction: false, pauseOnMouseEnter: true },
					breakpoints: { 475: { slidesPerView: 3 }, 768: { slidesPerView: 4 }, 992: { slidesPerView: 5 }, 1200: { slidesPerView: 6 } }
				}
			},
			{
				selector: '.testimonial-slide',
				options: {
					slidesPerView: 1, spaceBetween: 30, loop: true,
					autoplay: { delay: 4000, disableOnInteraction: false, pauseOnMouseEnter: true },
					pagination: { el: '.swiper-pagination', clickable: true },
					breakpoints: { 768: { slidesPerView: 2 }, 1200: { slidesPerView: 3 } }
				}
			}
		];

		configs.forEach(({ selector, options }) => {
			const el = document.querySelector(selector) as any;
			if (!el) return;
			// Destroy existing instance before re-creating
			if (el.swiper) el.swiper.destroy(true, true);
			new Swiper(selector, options);
		});
	}

	function initScrollCue() {
		const w = window as any;
		if (!w.scrollCue) return;
		// Double-RAF ensures the browser has fully painted new DOM before scrollCue
		// queries element positions — single RAF returns stale getBoundingClientRect values
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				w.scrollCue.update();
			});
		});
	}

	afterNavigate(() => {
		if (!browser) return;
		window.scrollTo({ top: 0, behavior: 'instant' });

		// Re-initialize everything for the newly inserted page content
		requestAnimationFrame(() => {
			initReveal();
			initSwipers();
			initScrollCue();
			initUkiyo();
		});
	});

	onMount(async () => {
		if (!browser) return;

		const w = window as any;

		// ── Preloader — dismiss on the very next paint ─────────────────────
		// Must happen before any await so that a failed dynamic import never
		// leaves the overlay permanently blocking all content.
		requestAnimationFrame(() => {
			const preloader = document.getElementById('preloader');
			if (preloader) preloader.style.display = 'none';
		});

		// ── scrollCue ──────────────────────────────────────────────────────
		if (w.scrollCue) {
			w.scrollCue.init({ duration: 900, ease: 'ease' });
			requestAnimationFrame(() => requestAnimationFrame(() => w.scrollCue.update()));
		}

		// ── Emergency reveal ──────────────────────────────────────────────────
		// scrollCue hides two kinds of elements:
		//   [data-cue="..."]  — the element itself gets opacity:0
		//   [data-cues="..."] — its DIRECT CHILDREN get opacity:0 via CSS
		// Both must be targeted. We also check opacity < 0.1 before forcing
		// so we never snap an element that is mid-animation.
		const forceRevealScrollCue = () => {
			document.querySelectorAll<HTMLElement>('[data-cue], [data-cues] > *').forEach((el) => {
				const { top } = el.getBoundingClientRect();
				if (top > window.innerHeight + 300) return;
				if (parseFloat(getComputedStyle(el).opacity) < 0.1) {
					el.classList.add('scrollcue-force-visible');
				}
			});
		};
		forceRevealScrollCue();
		[400, 1200, 3000].forEach((ms) => setTimeout(forceRevealScrollCue, ms));
		window.addEventListener('scroll', forceRevealScrollCue, { passive: true });

		// ── Header sticky ──────────────────────────────────────────────────
		const navbar = document.getElementById('navbar');
		if (navbar) {
			window.addEventListener('scroll', () => {
				navbar.classList.toggle('sticky', window.scrollY >= 200);
			}, { passive: true });
		}

		// ── Back to top ────────────────────────────────────────────────────
		const topBtn = document.getElementById('backtotop');
		if (topBtn) {
			topBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
			window.addEventListener('scroll', () => {
				topBtn.style.opacity = window.scrollY > 200 ? '1' : '0';
			}, { passive: true });
		}

		// ── Swiper carousels ───────────────────────────────────────────────
		initSwipers();

		// ── Ukiyo parallax ─────────────────────────────────────────────────
		initUkiyo();

		// ── Async animation libraries ──────────────────────────────────────
		// Isolated in try/catch: a chunk-load failure (e.g. stale hash after a
		// redeploy) must not prevent the page from being usable.
		try {
			const [{ gsap }, { ScrollTrigger }, { default: LenisLib }] = await Promise.all([
				import('gsap'),
				import('gsap/ScrollTrigger'),
				import('lenis'),
			]);
			gsap.registerPlugin(ScrollTrigger);
			gsapRef = gsap;
			w._ScrollTrigger = ScrollTrigger;

			// ── GSAP reveal images ─────────────────────────────────────────────
			initReveal();

			// Rescue .reveal elements whose ScrollTrigger never fired.
			// Must run AFTER initReveal() so GSAP has already set the initial
			// transform:translateX(-100%) — the stuck check is only valid then.
			const forceRevealGSAP = () => {
				document.querySelectorAll<HTMLElement>('.reveal').forEach((el) => {
					const { top } = el.getBoundingClientRect();
					if (top > window.innerHeight + 300) return;
					const tx = getComputedStyle(el).transform;
					const stuck = tx !== 'none' && tx !== '' && tx !== 'matrix(1, 0, 0, 1, 0, 0)';
					if (stuck) el.classList.add('scrollcue-force-visible');
				});
			};
			[300, 1000, 2500].forEach((ms) => setTimeout(forceRevealGSAP, ms));
			window.addEventListener('scroll', forceRevealGSAP, { passive: true });

			// ── Lenis smooth scroll ────────────────────────────────────────────
			const lenis = new LenisLib({ duration: 0.75, smoothWheel: true, smoothTouch: false });
			let rafId: number;
			const raf = (time: number) => {
				lenis.raf(time);
				if (ukiyoRef) ukiyoRef.animate();
				rafId = requestAnimationFrame(raf);
			};
			rafId = requestAnimationFrame(raf);
			document.addEventListener('visibilitychange', () => {
				if (document.hidden) cancelAnimationFrame(rafId);
				else rafId = requestAnimationFrame(raf);
			});

			// ── Hero text animation ────────────────────────────────────────────
			const container = document.getElementById('text');
			if (container) {
				const texts = ['Send Money', 'in 60 seconds', 'via WhatsApp', 'No bank needed'];
				let idx = 0;
				const showLine = (i: number) => {
					container!.innerHTML = '';
					const spans = texts[i].split('').map((ch) => {
						const s = document.createElement('span');
						s.textContent = ch;
						s.style.display = 'inline-block';
						container!.appendChild(s);
						return s;
					});
					gsap.fromTo(
						spans,
						{ opacity: 0, y: 20, filter: 'blur(10px)' },
						{
							opacity: 1, y: 0, filter: 'blur(0px)', stagger: 0.05, duration: 0.6, ease: 'power2.out',
							onComplete: () =>
								gsap.to(spans, {
									opacity: 0, y: -20, filter: 'blur(10px)', stagger: 0.05, delay: 1, duration: 0.5, ease: 'power2.in',
									onComplete: () => { idx = (idx + 1) % texts.length; showLine(idx); }
								})
						}
					);
				};
				showLine(idx);
			}
		} catch (err) {
			console.warn('[SendSasa] Animation libraries failed to load:', err);
		}

		// ── Counter animation ──────────────────────────────────────────────
		if ('IntersectionObserver' in window) {
			const obs = new IntersectionObserver((entries) => {
				entries.forEach((e) => {
					if (!e.isIntersecting) return;
					const el = e.target as HTMLElement;
					const target = parseInt(el.innerText, 10);
					let current = 0;
					const step = Math.max(target / 200, 1);
					const timer = setInterval(() => {
						current += step;
						el.innerText = String(Math.floor(Math.min(current, target)));
						if (Math.floor(current) >= target) clearInterval(timer);
					}, 10);
					obs.unobserve(el);
				});
			});
			document.querySelectorAll('.counter').forEach((c) => obs.observe(c));
		}

		// ── Mobile nav accordion ───────────────────────────────────────────
		const menuItems = document.querySelectorAll<HTMLElement>('.mobile-menu-list');
		menuItems.forEach((item) => {
			item.addEventListener('click', function (e) {
				e.stopPropagation();
				const wasActive = this.classList.contains('active');
				menuItems.forEach((i) => i.classList.remove('active'));
				if (!wasActive) this.classList.add('active');
			});
		});
	});
</script>
