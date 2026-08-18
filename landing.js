// ResiEase Landing Page Interactive Script (High-Performance, Zero-Blocking)

// Setup Tailwind theme dynamically
if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        theme: {
            extend: {
                fontFamily: {
                    sans: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
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

function calculateRoi() {
    const slider = document.getElementById('flat-slider');
    if (!slider) return;
    const flatCount = parseInt(slider.value, 10) || 120;

    const displayEl = document.getElementById('flat-count-display');
    if (displayEl) displayEl.innerText = `${flatCount} Flats`;

    // Compute hours saved (approx 0.35 hours per flat per month for invoice matching and manual reconciliation)
    const hours = Math.round(flatCount * 0.35);
    const timeSavedEl = document.getElementById('time-saved');
    if (timeSavedEl) {
        timeSavedEl.innerText = hours;
    }

    const collEl = document.getElementById('collection-increase');
    if (collEl) collEl.innerText = '15';

    const compEl = document.getElementById('compliance-stat');
    if (compEl) compEl.innerText = '100';
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

    function onScroll() {
        const y = window.scrollY || document.documentElement.scrollTop;
        if (header) header.classList.toggle('is-scrolled', y > 10);
        if (backToTop) {
            if (y > 350) {
                backToTop.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
            } else {
                backToTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            }
        }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (backToTop) {
        backToTop.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    calculateRoi();
});
