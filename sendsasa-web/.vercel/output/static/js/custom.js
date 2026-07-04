(function () {
	"use strict";

	window.onload = function () {

		// Header Sticky
		const getHeaderId = document.getElementById("navbar");
		if (getHeaderId) {
			window.addEventListener('scroll', event => {
				const height = 200;
				const { scrollTop } = event.target.scrollingElement;
				document.querySelector('#navbar').classList.toggle('sticky', scrollTop >= height);
			});
		}

		// Back to Top JS
		const getId = document.getElementById("backtotop");
		if (getId) {
			const topbutton = document.getElementById("backtotop");
			topbutton.onclick = function (e) {
				window.scrollTo({ top: 0, behavior: "smooth" });
			};
			window.onscroll = function () {
				if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
					topbutton.style.opacity = "1";
				} else {
					topbutton.style.opacity = "0";
				}
			};
		}

		// Preloader JS
		const getPreloaderId = document.getElementById('preloader');
		if (getPreloaderId) {
			getPreloaderId.style.display = 'none';
		}
	};

	// Partner Slide JS
	var swiper = new Swiper(".partner-slide", {
		slidesPerView: 1,
		spaceBetween: 30,
		centeredSlides: false,
		preventClicks: true,
		loop: false,
		autoHeight: true,
		autoplay: {
			delay: 5000,
			disableOnInteraction: false,
			pauseOnMouseEnter: true,
		},
		pagination: {
			clickable: true,
		},
		breakpoints: {
			0: {
				slidesPerView: 2,
			},
			475: {
				slidesPerView: 3,
			},
			768: {
				slidesPerView: 4,
			},
			992: {
				slidesPerView: 5,
			},
			1200: {
				slidesPerView: 5,
			},
			1600: {
				slidesPerView: 5,
			},
		}
	});

	// Partner Slide JS
	var swiper = new Swiper(".partner-slide2", {
		slidesPerView: 1,
		spaceBetween: 30,
		centeredSlides: false,
		preventClicks: true,
		loop: false,
		autoHeight: true,
		autoplay: {
			delay: 5000,
			disableOnInteraction: false,
			pauseOnMouseEnter: true,
		},
		pagination: {
			clickable: true,
		},
		breakpoints: {
			0: {
				slidesPerView: 2,
			},
			475: {
				slidesPerView: 3,
			},
			768: {
				slidesPerView: 4,
			},
			992: {
				slidesPerView: 5,
			},
			1200: {
				slidesPerView: 6,
			},
			1600: {
				slidesPerView: 6,
			},
		}
	});

	// More Products Slide JS
	var swiper = new Swiper(".more-products-slide", {
		slidesPerView: 1,
		spaceBetween: 30,
		centeredSlides: false,
		preventClicks: true,
		loop: false,
		autoHeight: true,
		autoplay: {
			delay: 5000,
			disableOnInteraction: false,
			pauseOnMouseEnter: true,
		},
		pagination: {
			clickable: true,
			el: ".more-products-pagination",
		},
		breakpoints: {
			0: {
				slidesPerView: 1,
			},
			475: {
				slidesPerView: 2,
			},
			768: {
				slidesPerView: 2,
			},
			992: {
				slidesPerView: 3,
			},
			1200: {
				slidesPerView: 4,
			},
			1600: {
				slidesPerView: 4,
			},
		}
	});

	// Text Animation JS
	try {
		const texts = [
			"Money Transfer",
			"fast & secure",
			"international",
			"Our Features",
		];
		const container = document.getElementById("text");
		let currentIndex = 0;
		function showLine(index) {
			container.innerHTML = ""; // Clear previous content

			const text = texts[index];
			const chars = text.split(""); // split with spaces preserved

			const spans = chars.map((char) => {
				const span = document.createElement("span");
				span.textContent = char;
				span.style.display = "inline-block"; // Ensure movement works
				container.appendChild(span);
				return span;
			});

			// Animate in
			gsap.fromTo(
				spans,
				{
					opacity: 0,
					y: 20,
					filter: 'blur(10px)',
				},
				{
					opacity: 1,
					y: 0,
					filter: 'blur(0px)',

					stagger: 0.05,
					duration: 0.6,
					ease: "power2.out",
					onComplete: () => {
						// Animate out after a delay
						gsap.to(spans, {
							opacity: 0,
							y: -20,
							filter: 'blur(10px)',

							stagger: 0.05,
							delay: 1,
							duration: 0.5,
							ease: "power2.in",
							onComplete: () => {
								currentIndex = (currentIndex + 1) % texts.length;
								showLine(currentIndex);
							}
						});
					}
				}
			);
		}
		// Start animation
		showLine(currentIndex);
	} catch { }

	// Images Animation JS
	gsap.registerPlugin(ScrollTrigger);
	let revealContainers = document.querySelectorAll(".reveal");
	revealContainers.forEach((container) => {
		let image = container.querySelector("img");
		let tl = gsap.timeline({
			scrollTrigger: {
				trigger: container,
				toggleActions: "restart none none reset"
			}
		});

		tl.set(container, { autoAlpha: 1 });
		tl.from(container, 1.5, {
			xPercent: -100,
			ease: Power2.out
		});
		tl.from(image, 1.5, {
			xPercent: 100,
			scale: 1.3,
			delay: -1.5,
			ease: Power2.out
		});
	});

	// Odometer JS
	if ("IntersectionObserver" in window) {
		let counterObserver = new IntersectionObserver(function (entries, observer) {
			entries.forEach(function (entry) {
				if (entry.isIntersecting) {
					let counter = entry.target;
					let target = parseInt(counter.innerText, 10); // FIXED
					let step = target / 200;
					let current = 0;
					let timer = setInterval(function () {
						current += step;
						counter.innerText = Math.floor(current);
						if (parseInt(counter.innerText, 10) >= target) { // FIXED
							clearInterval(timer);
						}
					}, 10);
					counterObserver.unobserve(counter);
				}
			});
		});
		let counters = document.querySelectorAll(".counter");
		counters.forEach(function (counter) {
			counterObserver.observe(counter);
		});
	}

	// Ukiyo.js
	const parallax = new Ukiyo('.ukiyo', {
		externalRAF: true,
	});

	// Force body height = auto
	document.body.style.height = "auto";
	document.documentElement.style.height = "auto";

	//smooth scroll
	const lenis = new Lenis({
		duration: 0.75,
		smoothWheel: true,
		smoothTouch: false,
	});

	// animate
	function raf(time) {
		parallax.animate();

		lenis.raf(time);
		requestAnimationFrame(raf);
	}
	requestAnimationFrame(raf);

	// ScrollCue JS
	scrollCue.init();

	// Quantity buttons
	document.querySelectorAll('.quantity-btn').forEach(button => {
		button.addEventListener('click', function () {
			const input = this.parentElement.querySelector('.quantity-input');
			let value = parseInt(input.value, 10); // FIXED

			if (this.querySelector('i').classList.contains('ti-plus')) {
				value++;
			} else if (this.querySelector('i').classList.contains('ti-minus')) {
				if (value > 1) {
					value--;
				}
			}
			input.value = value;
		});
	});

	// Review Rating
	const ratings = document.querySelectorAll('.rating');
	ratings.forEach(rating => {
		rating.addEventListener('click', () => {
			// reset all ratings to default state
			ratings.forEach(rating => {
				rating.classList.remove('active');
			});

			// add active class to clicked rating and all previous ratings
			rating.classList.add('active');
			let prevRating = rating.previousElementSibling;
			while (prevRating) {
				prevRating.classList.add('active');
				prevRating = prevRating.previousElementSibling;
			}
		});
	});

	// Payment Method JS
	const getPaymentMethodId = document.getElementById('payment_method');
	if (getPaymentMethodId){
		document.querySelectorAll('.payment-option input[type="radio"]').forEach(radio => {
			radio.addEventListener('change', () => {
				document.querySelectorAll('.payment-option').forEach(option => {
					option.classList.remove('active');
				});
				radio.closest('.payment-option').classList.add('active');
			});
		});
	}

	// Login Coupon JS
	const getLoginCouponId = document.getElementById('login_coupon');
	if (getLoginCouponId){
		document.querySelectorAll('.login-coupon-option input[type="radio"]').forEach(radio => {
			radio.addEventListener('change', () => {
				document.querySelectorAll('.login-coupon-option').forEach(option => {
					option.classList.remove('active');
				});
				radio.closest('.login-coupon-option').classList.add('active');
			});
		});
	}

	// Close modal if click is outside the input
	const getCloseModalId = document.getElementById("staticBackdrop");
	if (getCloseModalId) {
		document.addEventListener("click", function (e) {
			const modal = document.querySelector("#staticBackdrop");
			const input = document.querySelector("#searchInput");

			if (modal.classList.contains("show")) {
				// if click is inside input → do nothing
				if (input.contains(e.target)) return;

				// if click is inside modal-content → prevent closing only for input
				if (modal.querySelector(".modal-content").contains(e.target) && !input.contains(e.target)) {
					bootstrap.Modal.getInstance(modal).hide();
				}
			}
		});
	}
	
	// Only For Light & Dark
	const toggleButton = document.getElementById('for-light-dark');
	if (toggleButton) {
		const savedMode = localStorage.getItem('for_mode');

		// Apply saved mode on load
		if (savedMode) {
			document.body.setAttribute('for-dark-light-data-mode', savedMode);
			toggleButton.textContent =
				savedMode === 'for-dark' ? 'Switch To Light' : 'Switch To Dark';
		} else {
			document.body.setAttribute('for-dark-light-data-mode', 'for-light');
			toggleButton.textContent = 'Switch To Dark';
		}

		// Add event listener
		toggleButton.addEventListener('click', () => {
			const currentMode = document.body.getAttribute('for-dark-light-data-mode');
			const newMode = currentMode === 'for-dark' ? 'for-light' : 'for-dark';

			document.body.setAttribute('for-dark-light-data-mode', newMode);
			localStorage.setItem('for_mode', newMode);

			toggleButton.textContent =
				newMode === 'for-dark' ? 'Switch To Light' : 'Switch To Dark';
		});
	}

	// Only For RTL & LTR
	try {
		function setMode(modeName) {
			localStorage.setItem('for_rtl', modeName);
			document.documentElement.className = modeName;

			// Update button text dynamically
			const btn = document.getElementById('rtlToggleBtn');
			if (btn) {
				btn.textContent = modeName === 'rtl' ? 'Switch To LTR' : 'Switch To RTL';
			}
		}

		function toggleMode() {
			if (localStorage.getItem('for_rtl') === 'rtl') {   // ✅ fixed strict equality
				setMode('ltr');
			} else {
				setMode('rtl');
			}
		}

		// Run on load
		(function () {
			if (localStorage.getItem('for_rtl') === 'rtl') {   // ✅ fixed strict equality
				setMode('rtl');
			} else {
				setMode('ltr');
			}

			// Add event listener instead of onclick
			const btn = document.getElementById('rtlToggleBtn');
			if (btn) {
				btn.addEventListener('click', toggleMode);
			}
		})();
	} catch (e) { }

	// Select all buttons with the class 'like-button' Favorite Button
	document.querySelectorAll('.slide-active').forEach(button => {
		// Add click event listener to each button
		button.addEventListener('click', () => {
			// Toggle 'liked' class
			button.classList.toggle('active');
		});
	});
})();

// For Mobile Navbar JS
const list = document.querySelectorAll('.mobile-menu-list');
function accordion(e) {
	e.stopPropagation();
	if (this.classList.contains('active')) {
		this.classList.remove('active');
	}
	else if (this.parentElement.parentElement.classList.contains('active')) {
		this.classList.add('active');
	}
	else {
		for (i = 0; i < list.length; i++) {
			list[i].classList.remove('active');
		}
		this.classList.add('active');
	}
}
for (i = 0; i < list.length; i++) {
	list[i].addEventListener('click', accordion);
}