// ResiEase Society Onboarding & Registration Script

// Setup Tailwind theme
if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        theme: {
            extend: {
                fontFamily: { sans: ['Inter', 'sans-serif'] },
                colors: { brand: { 50: '#eef2ff', 100: '#e0e7ff', 500: '#4f46e5', 600: '#4338ca', 900: '#312e81' } }
            }
        }
    };
}

let userData = {
    name: '',
    email: '',
    googleToken: null
};

function showToast(message, type = 'error') {
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-xl shadow-lg backdrop-blur-md border text-sm font-medium transform transition-all duration-300 translate-x-full ${
        type === 'error' ? 'bg-red-900/80 border-red-500/50 text-red-100' : 'bg-green-900/80 border-green-500/50 text-green-100'
    }`;
    toast.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'} mr-2"></i>${message}`;
    const container = document.getElementById('toast-container');
    if (container) container.appendChild(toast);
    
    setTimeout(() => toast.classList.remove('translate-x-full'), 10);
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function goToStep(step) {
    document.querySelectorAll('.step-transition').forEach(el => {
        el.classList.remove('active-step');
        el.classList.add('hidden-step');
    });
    const targetStep = document.getElementById(`step-${step}`);
    if (targetStep) {
        targetStep.classList.remove('hidden-step');
        targetStep.classList.add('active-step');
    }
    
    const title = document.getElementById('step-title');
    const desc = document.getElementById('step-desc');
    const progress = document.getElementById('progress-bar');
    
    if (step === 1) {
        if (title) title.innerText = 'Create Admin Account';
        if (desc) desc.innerText = 'Step 1 of 2: Setup your administrator profile.';
        if (progress) progress.style.width = '50%';
    } else if (step === 2) {
        if (title) title.innerText = 'Register Society';
        if (desc) desc.innerText = `Step 2 of 2: Details for ${userData.name}`;
        if (progress) progress.style.width = '100%';
    } else if (step === 3) {
        if (title) title.innerText = 'Success!';
        if (desc) desc.innerText = 'Registration finalized.';
        if (progress && progress.parentElement) progress.parentElement.style.display = 'none';
        const footNote = document.querySelector('.text-center.text-gray-500.text-xs.mt-8');
        if (footNote) footNote.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const form1 = document.getElementById('form-step-1');
    if (form1) {
        form1.addEventListener('submit', (e) => {
            e.preventDefault();
            userData.name = document.getElementById('reg-name').value;
            userData.email = document.getElementById('reg-email').value;
            userData.googleToken = null;
            goToStep(2);
        });
    }

    const form2 = document.getElementById('form-step-2');
    if (form2) {
        form2.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-finish');
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
                btn.disabled = true;
            }

            const payload = {
                name: userData.name,
                email: userData.email,
                googleToken: userData.googleToken,
                societyName: document.getElementById('reg-society-name').value,
                registrationNo: document.getElementById('reg-no').value
            };

            try {
                const res = await fetch('/api/auth/onboard', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if (res.ok) {
                    const successEl = document.getElementById('success-email');
                    if (successEl) successEl.innerText = userData.email;
                    goToStep(3);
                } else {
                    showToast(data.error || 'Registration failed');
                    if (btn) {
                        btn.innerHTML = 'Register & Get Password';
                        btn.disabled = false;
                    }
                }
            } catch (err) {
                showToast('Network error occurred.');
                if (btn) {
                    btn.innerHTML = 'Register & Get Password';
                    btn.disabled = false;
                }
            }
        });
    }

    initGoogleAuth();
});

function initGoogleAuth() {
    const container = document.getElementById('google-btn-container');
    const fallbackElement = document.getElementById('google-auth-fallback');

    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        setTimeout(initGoogleAuth, 100);
        return;
    }

    try {
        google.accounts.id.initialize({
            client_id: '1033704835291-2t1v5b1junmn6imkbssvn0ku51v4tpur.apps.googleusercontent.com',
            callback: handleGoogleSignUp,
        });
        
        if(fallbackElement) fallbackElement.remove();

        if (container) {
            google.accounts.id.renderButton(
                container,
                { theme: 'outline', size: 'large', type: 'standard', shape: 'rectangular', text: 'signup_with', logo_alignment: 'left', width: 300 }
            );
        }

        setTimeout(() => {
            if (container && container.innerHTML.trim() === '') {
                container.innerHTML = `
                    <div class="bg-red-500/10 border border-red-500/50 rounded-xl p-4 w-full text-center">
                        <i class="fa-solid fa-triangle-exclamation text-red-500 text-2xl mb-2"></i>
                        <h4 class="text-red-400 font-bold text-sm mb-1">Google Auth Blocked</h4>
                        <p class="text-xs text-red-300">
                            Your Google Cloud Console is blocking this URL. <br/>
                            Add <code class="bg-black/50 px-1 py-0.5 rounded">${window.location.origin}</code> 
                            to Authorized JavaScript Origins in GCP.
                        </p>
                    </div>
                `;
            }
        }, 3000);

    } catch(err) {
        console.error("Google Auth Init Error:", err);
    }
}

function parseJwt (token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

async function handleGoogleSignUp(response) {
    try {
        const payload = parseJwt(response.credential);
        userData.name = payload.name || 'Google User';
        userData.email = payload.email;
        userData.googleToken = response.credential;
        goToStep(2);
    } catch(e) {
        showToast("Failed to process Google login.");
    }
}
