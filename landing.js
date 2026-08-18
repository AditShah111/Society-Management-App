// ResiEase Landing Page Interactive Script

// Setup Tailwind theme dynamically
if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        theme: {
            extend: {
                fontFamily: {
                    sans: ['"Plus Jakarta Sans"', 'sans-serif'],
                },
                colors: {
                    brand: {
                        50: '#eef2ff',
                        100: '#e0e7ff',
                        200: '#c7d2fe',
                        400: '#818cf8',
                        500: '#4f46e5', /* Indigo CTA Accent */
                        600: '#4338ca',
                        700: '#3730a3',
                        900: '#0B0F19', /* Premium Dark */
                    }
                }
            }
        }
    };
}

function toggleFaq(button) {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    const icon = button.querySelector('i');

    button.setAttribute('aria-expanded', String(!expanded));
    if (panel) {
        panel.style.gridTemplateRows = expanded ? '0fr' : '1fr';
    }
    if (icon) {
        icon.classList.toggle('rotate-180', !expanded);
    }
}

function animateCount(el, toValue) {
    if (!el) return;
    const from = { v: parseFloat(el.textContent) || 0 };
    if (window.gsap) {
        gsap.to(from, {
            v: toValue,
            duration: 0.6,
            ease: 'power2.out',
            onUpdate: function () { el.textContent = Math.round(from.v); }
        });
    } else {
        el.textContent = toValue;
    }
}

function calculateRoi() {
    const slider = document.getElementById('flat-slider');
    if (!slider) return;
    const flatCount = parseInt(slider.value, 10) || 50;

    const displayEl = document.getElementById('flat-count-display');
    if (displayEl) displayEl.innerText = `${flatCount} Flats`;

    // Compute hours saved (approx 0.35 hours per flat per month for invoice matching and manual reconciliation)
    const hours = Math.round(flatCount * 0.35);
    const timeSavedEl = document.getElementById('time-saved');
    if (timeSavedEl) {
        timeSavedEl.dataset.value = hours;
        animateCount(timeSavedEl, hours);
    }
}

// Mobile menu & Navigation
document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    const icon = document.getElementById('menu-icon');

    function closeMenu() {
        if (menu) menu.classList.add('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        if (icon) {
            icon.classList.remove('fa-xmark');
            icon.classList.add('fa-bars');
        }
    }
    function openMenu() {
        if (menu) menu.classList.remove('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        if (icon) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-xmark');
        }
    }

    if (btn && menu) {
        btn.addEventListener('click', function () {
            const isOpen = btn.getAttribute('aria-expanded') === 'true';
            isOpen ? closeMenu() : openMenu();
        });
        menu.querySelectorAll('.mobile-nav-link').forEach(function (link) {
            link.addEventListener('click', closeMenu);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeMenu();
        });
    }

    // Header scroll shadow + back-to-top visibility
    const header = document.getElementById('site-header');
    const backToTop = document.getElementById('back-to-top');
    let ticking = false;

    function onScroll() {
        const y = window.scrollY;
        if (header) header.classList.toggle('is-scrolled', y > 8);
        if (backToTop) {
            if (y > 480) {
                backToTop.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
            } else {
                backToTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            }
        }
        ticking = false;
    }
    window.addEventListener('scroll', function () {
        if (!ticking) {
            requestAnimationFrame(onScroll);
            ticking = true;
        }
    }, { passive: true });
    onScroll();

    if (backToTop) {
        backToTop.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    calculateRoi();

    // GSAP + ScrollTrigger animations
    if (window.gsap && window.ScrollTrigger) {
        gsap.registerPlugin(ScrollTrigger);
        const mm = gsap.matchMedia();

        mm.add('(prefers-reduced-motion: no-preference)', function () {
            const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
            heroTl
                .from('.hero-item', { opacity: 0, y: 28, duration: 0.8, stagger: 0.15 })
                .from('#hero-visual-card', { opacity: 0, scale: 1.06, duration: 1 }, 0.15)
                .from('#hero-chip', { opacity: 0, y: 16, duration: 0.6 }, '-=0.3');

            gsap.to('#hero-visual-img', {
                scale: 1.08,
                duration: 16,
                ease: 'sine.inOut',
                yoyo: true,
                repeat: -1,
                transformOrigin: 'center center'
            });

            if (window.matchMedia('(pointer: fine)').matches) {
                const wrap = document.querySelector('.hero-visual-wrap');
                const card = document.getElementById('hero-visual-card');
                if (wrap && card) {
                    const setRotX = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3' });
                    const setRotY = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3' });
                    wrap.addEventListener('mousemove', function (e) {
                        const r = wrap.getBoundingClientRect();
                        const px = (e.clientX - r.left) / r.width - 0.5;
                        const py = (e.clientY - r.top) / r.height - 0.5;
                        setRotY(px * 10);
                        setRotX(-py * 10);
                    });
                    wrap.addEventListener('mouseleave', function () {
                        setRotX(0);
                        setRotY(0);
                    });
                }
            }

            gsap.utils.toArray('.parallax-orb').forEach(function (orb, i) {
                gsap.to(orb, {
                    y: i % 2 === 0 ? 140 : -140,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: orb.closest('section'),
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: 1
                    }
                });
            });

            gsap.utils.toArray('.fade-single').forEach(function (el) {
                gsap.from(el, {
                    opacity: 0,
                    y: 50,
                    duration: 0.8,
                    scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none none' }
                });
            });

            gsap.utils.toArray('.fade-group').forEach(function (group) {
                const items = group.querySelectorAll('.fade-item');
                gsap.from(items, {
                    opacity: 0,
                    y: 50,
                    duration: 0.7,
                    stagger: 0.15,
                    scrollTrigger: { trigger: group, start: 'top 85%', toggleActions: 'play none none none' }
                });
            });

            ScrollTrigger.create({
                trigger: '#roi-stats',
                start: 'top 85%',
                once: true,
                onEnter: function () {
                    document.querySelectorAll('#roi-stats [data-value]').forEach(function (el) {
                        animateCount(el, parseFloat(el.dataset.value));
                    });
                }
            });
        });
    }
});
