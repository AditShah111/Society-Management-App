// ResiEase Login Page Interactive Script

// Setup Tailwind theme
if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        theme: {
            extend: {
                fontFamily: { sans: ['Inter', 'sans-serif'] },
                colors: {
                    corporate: {
                        900: '#0B0F19',
                        800: '#151C2C',
                        700: '#1F2937',
                        600: '#374151',
                        100: '#F4F5F7',
                    },
                    brand: {
                        500: '#4F46E5',
                        600: '#4338CA'
                    }
                }
            }
        }
    };
}

let authMethod = 'password';
let otpSent = false;

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `flex items-center gap-3 p-4 rounded-xl border shadow-xl text-white bg-corporate-900 border-white/20 transition-all duration-300 translate-y-2 opacity-0 pointer-events-auto max-w-sm`;
    
    let icon = 'fa-circle-check text-emerald-400';
    if (type === 'error') icon = 'fa-circle-xmark text-red-400';
    if (type === 'info') icon = 'fa-circle-info text-blue-400';

    toast.innerHTML = `
        <i class="fa-solid ${icon} text-lg"></i>
        <div class="text-sm font-semibold">${message}</div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);
    setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function setAuthMethod(method) {
    authMethod = method;
    const pGroup = document.getElementById('login-password-group');
    const otpGroup = document.getElementById('login-otp-group');
    const tabPassword = document.getElementById('tab-password');
    const tabOtp = document.getElementById('tab-otp');
    const submitBtn = document.getElementById('login-submit-btn');

    if (method === 'password') {
        if (pGroup) pGroup.classList.remove('hidden');
        if (otpGroup) otpGroup.classList.add('hidden');
        const pInput = document.getElementById('login-password');
        if (pInput) pInput.required = true;
        const oInput = document.getElementById('login-otp-code');
        if (oInput) oInput.required = false;
        
        if (tabPassword) tabPassword.className = 'w-1/2 py-1.5 text-[11px] font-bold text-center rounded-lg bg-white/10 text-white focus:outline-none transition-all';
        if (tabOtp) tabOtp.className = 'w-1/2 py-1.5 text-[11px] font-bold text-center rounded-lg text-gray-400 hover:text-white focus:outline-none transition-all';
        if (submitBtn) submitBtn.innerText = 'Sign In';
        otpSent = false;
    } else {
        if (pGroup) pGroup.classList.add('hidden');
        if (otpGroup) otpGroup.classList.add('hidden');
        const pInput = document.getElementById('login-password');
        if (pInput) pInput.required = false;
        const oInput = document.getElementById('login-otp-code');
        if (oInput) oInput.required = false;

        if (tabPassword) tabPassword.className = 'w-1/2 py-1.5 text-[11px] font-bold text-center rounded-lg text-gray-400 hover:text-white focus:outline-none transition-all';
        if (tabOtp) tabOtp.className = 'w-1/2 py-1.5 text-[11px] font-bold text-center rounded-lg bg-white/10 text-white focus:outline-none transition-all';
        if (submitBtn) submitBtn.innerText = 'Send OTP PIN';
    }
}

// Initialize Google Sign-in
window.addEventListener('load', function () {
    const container = document.getElementById('google-btn-container');
    const fallbackElement = document.getElementById('google-auth-fallback');

    if (typeof google !== 'undefined' && google.accounts && google.accounts.id && container) {
        try {
            google.accounts.id.initialize({
                client_id: '1033704835291-2t1v5b1junmn6imkbssvn0ku51v4tpur.apps.googleusercontent.com',
                callback: handleGoogleCredentialResponse,
                use_fedcm_for_prompt: true
            });
            
            if(fallbackElement) fallbackElement.remove();

            google.accounts.id.renderButton(
                container,
                { theme: 'outline', size: 'large', type: 'standard', shape: 'rectangular', text: 'signin_with', logo_alignment: 'left' }
            );
        } catch(err) {
            console.error("Google Auth Init Error:", err);
        }
    }

    setTimeout(() => {
        if (container && !container.querySelector('iframe')) {
            container.innerHTML = `
                <div class="w-full bg-red-900/40 border border-red-500/50 text-red-200 p-4 rounded-xl text-xs text-center shadow-lg">
                    <i class="fa-solid fa-triangle-exclamation text-red-400 text-lg mb-2"></i><br>
                    <strong class="text-sm">Google Sign-in Blocked</strong><br><br>
                    Google is hiding the button because this URL is unauthorized.<br><br>
                    Go to <b>Google Cloud Console &rarr; Credentials &rarr; OAuth Client ID</b> and add:<br>
                    <code class="block bg-black/50 p-2 mt-2 mb-2 rounded text-brand-300 font-mono text-[10px]">https://society-management-app-xh6q.onrender.com</code>
                    to your <b>Authorized JavaScript origins</b>.
                </div>
            `;
        }
    }, 2500);
});

async function handleGoogleCredentialResponse(response) {
    try {
        showToast('Verifying Google Login...', 'info');
        
        const res = await fetch('/api/login/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast('Google Sign-In successful!', 'success');
            setTimeout(() => {
                window.location.href = data.user.role === 'master_admin' ? '/master.html' : '/app';
            }, 800);
        } else {
            showToast(data.error || 'Authentication failed', 'error');
        }
    } catch (err) {
        showToast('Network error during Google login', 'error');
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;

            if (authMethod === 'password') {
                const password = document.getElementById('login-password').value;
                try {
                    const res = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);

                    localStorage.setItem('user_role', data.user.role);
                    localStorage.setItem('user_email', email);

                    showToast('Authenticated successfully. Loading app...');
                    setTimeout(() => window.location.href = '/app', 600);
                } catch (err) {
                    showToast(err.message, 'error');
                }
            } else {
                // OTP Access Mode
                if (!otpSent) {
                    try {
                        const res = await fetch('/api/auth/send-otp', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ email })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        
                        otpSent = true;
                        document.getElementById('login-otp-group').classList.remove('hidden');
                        document.getElementById('login-otp-code').required = true;
                        document.getElementById('login-submit-btn').innerText = 'Verify & Sign In';
                        showToast('Verification PIN sent. Check your email or the server console.', 'info');
                    } catch (err) {
                        showToast(err.message, 'error');
                    }
                } else {
                    const code = document.getElementById('login-otp-code').value;
                    try {
                        const res = await fetch('/api/auth/verify-otp', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ email, code, otp: code })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);

                        localStorage.setItem('user_role', data.user.role);
                        localStorage.setItem('user_email', email);

                        showToast('Authenticated successfully. Loading app...');
                        setTimeout(() => window.location.href = '/app', 600);
                    } catch (err) {
                        showToast(err.message, 'error');
                    }
                }
            }
        });
    }

    const regForm = document.getElementById('register-form');
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('reg-name').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const societyName = document.getElementById('reg-society-name').value;
            const registrationNo = document.getElementById('reg-regno').value;

            // Validate Registration Number
            const parts = registrationNo.split('/');
            if (parts.length < 5 || parts.length > 6) {
                showToast('Invalid registration number layout. Must be DISTRICT/WARD/HSG/[TC|TA|GN]/NUMBER/YEAR (e.g. MUM/WP/HSG/TC/12345/2026)', 'error');
                return;
            }
            const [dist, ward, cls, sub] = parts.length === 6 ? parts : [parts[0], parts[1], parts[2], 'GN'];
            const validDists = new Set(['MUM', 'PNE', 'TNA', 'NGP', 'KGD', 'NAS', 'AMD', 'SAT', 'SOL', 'KOP', 'LAT', 'AUR', 'NND', 'JAL', 'DHU', 'NSA', 'KBD', 'YAT', 'CHA', 'BND', 'GND', 'GAD', 'AMR', 'BUL', 'WAS', 'AKO', 'PAR', 'BEED', 'OSM', 'JLG', 'RAT', 'SNG', 'SIN']);
            if (!validDists.has(dist.toUpperCase())) {
                showToast(`Invalid District code "${dist}". Must be a valid Maharashtra district (e.g. MUM, PNE, TNA)`, 'error');
                return;
            }
            if (cls.toUpperCase() !== 'HSG') {
                showToast(`Invalid Classification "${cls}". Housing societies must have classification code "HSG"`, 'error');
                return;
            }
            const validSubs = new Set(['TC', 'TA', 'GN', 'OD', 'MHS']);
            if (!validSubs.has(sub.toUpperCase())) {
                showToast(`Invalid Sub-classification "${sub}". Must be one of: TC, TA, GN, OD`, 'error');
                return;
            }
            const num = parts.length === 6 ? parts[4] : parts[3];
            const yr = parts.length === 6 ? parts[5] : parts[4];
            if (!/^\d+$/.test(num)) {
                showToast(`Invalid Serial Number "${num}". Must be numeric`, 'error');
                return;
            }
            if (!/^\d{4}$/.test(yr)) {
                showToast(`Invalid Registration Year "${yr}". Must be a 4-digit year`, 'error');
                return;
            }
            const yearVal = parseInt(yr);
            const currentYear = new Date().getFullYear();
            if (yearVal < 1960 || yearVal > currentYear) {
                showToast(`Invalid Year ${yearVal}. Must be between 1960 and ${currentYear}`, 'error');
                return;
            }

            try {
                const res = await fetch('/api/auth/register-society', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ name, email, password, societyName, registrationNo })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                localStorage.setItem('user_role', 'super_admin');
                localStorage.setItem('user_email', email);

                showToast('Society registered & space deployed successfully!');
                setTimeout(() => window.location.href = '/app', 1000);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'register' && typeof setMode === 'function') {
        setMode('register');
    }
});
