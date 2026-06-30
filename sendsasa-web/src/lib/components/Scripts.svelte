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

		// ── scrollCue ──────────────────────────────────────────────────────
		if (w.scrollCue) {
			w.scrollCue.init({ duration: 900, ease: 'ease' });
			requestAnimationFrame(() => requestAnimationFrame(() => w.scrollCue.update()));
		}

		// ── GSAP + ScrollTrigger ───────────────────────────────────────────
		const { gsap } = await import('gsap');
		const { ScrollTrigger } = await import('gsap/ScrollTrigger');
		gsap.registerPlugin(ScrollTrigger);
		gsapRef = gsap;
		w._ScrollTrigger = ScrollTrigger;

		// ── GSAP reveal images ─────────────────────────────────────────────
		initReveal();

		// ── Lenis smooth scroll ────────────────────────────────────────────
		const { default: Lenis } = await import('lenis');
		const lenis = new Lenis({ duration: 0.75, smoothWheel: true, smoothTouch: false });
		const raf = (time: number) => {
			lenis.raf(time);
			if (ukiyoRef) ukiyoRef.animate();
			requestAnimationFrame(raf);
		};
		requestAnimationFrame(raf);

		// ── Header sticky ──────────────────────────────────────────────────
		const navbar = document.getElementById('navbar');
		if (navbar) {
			window.addEventListener('scroll', () => {
				navbar.classList.toggle('sticky', window.scrollY >= 200);
			});
		}

		// ── Back to top ────────────────────────────────────────────────────
		const topBtn = document.getElementById('backtotop');
		if (topBtn) {
			topBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
			window.addEventListener('scroll', () => {
				topBtn.style.opacity = window.scrollY > 200 ? '1' : '0';
			});
		}

		// ── Preloader ──────────────────────────────────────────────────────
		const preloader = document.getElementById('preloader');
		if (preloader) preloader.style.display = 'none';

		// ── Swiper carousels ───────────────────────────────────────────────
		initSwipers();

		// ── Ukiyo parallax ─────────────────────────────────────────────────
		initUkiyo();

		// ── Hero text animation ────────────────────────────────────────────
		const container = document.getElementById('text');
		if (container) {
			const texts = ['Send Money', 'in 60 seconds', 'via WhatsApp', 'No bank needed'];
			let idx = 0;
			function showLine(i: number) {
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
			}
			showLine(idx);
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
