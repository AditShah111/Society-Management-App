// ResiEase Master Admin Dashboard Script

// Setup Tailwind theme
if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        theme: {
            extend: {
                fontFamily: { sans: ['Inter', 'sans-serif'] },
                colors: {
                    brand: { 50: '#eef2ff', 100: '#e0e7ff', 500: '#4f46e5', 600: '#4338ca', 900: '#312e81' }
                }
            }
        }
    };
}

async function loadSocieties() {
    try {
        const res = await fetch('/api/master/societies');
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                window.location.href = '/login';
                return;
            }
            throw new Error('Failed to fetch societies');
        }
        const data = await res.json();
        renderTable(data.societies || []);
    } catch (err) {
        console.error(err);
        showToast('Failed to load societies', 'error');
    }
}

function renderTable(societies) {
    const tbody = document.getElementById('society-table-body');
    if (!tbody) return;
    
    let pendingCount = 0;
    let activeCount = 0;

    if (!societies || societies.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-400">No societies found.</td></tr>`;
    } else {
        tbody.innerHTML = societies.map(s => {
            const isPending = s.status === 'PENDING';
            if (isPending) pendingCount++; else activeCount++;

            const statusBadge = isPending 
                ? `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 tracking-wide">PENDING</span>`
                : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 tracking-wide">VALIDATED</span>`;
            
            const actionBtn = isPending
                ? `<button onclick="validateSociety('${s.id}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors">Validate Access</button>`
                : `<span class="text-xs text-gray-400 italic">Approved</span>`;

            const date = new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

            return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="p-4 pl-6 font-medium text-gray-900">${s.name}</td>
                <td class="p-4 text-gray-600 font-mono text-xs">${s.registration_no}</td>
                <td class="p-4 text-gray-600">${s.admin_email || 'N/A'}</td>
                <td class="p-4 text-gray-500 text-xs">${date}</td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 pr-6 text-right">${actionBtn}</td>
            </tr>
            `;
        }).join('');
    }

    const statTotal = document.getElementById('stat-total');
    if (statTotal) statTotal.innerText = societies.length;
    const statPending = document.getElementById('stat-pending');
    if (statPending) statPending.innerText = pendingCount;
    const statActive = document.getElementById('stat-active');
    if (statActive) statActive.innerText = activeCount;
}

async function validateSociety(id) {
    if (!confirm('Are you sure you want to validate this society? They will instantly gain access.')) return;
    try {
        const res = await fetch(`/api/master/societies/${id}/validate`, { method: 'POST' });
        if (!res.ok) throw new Error('Validation failed');
        showToast('Society validated successfully!', 'success');
        loadSocieties();
    } catch (err) {
        console.error(err);
        showToast(err.message, 'error');
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
    } catch (err) {
        console.error('Logout failed', err);
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'flex items-center gap-3 p-4 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 translate-x-10 opacity-0 pointer-events-auto';
    if (type === 'success') {
        toast.classList.add('bg-gray-800');
        toast.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i> <span>${message}</span>`;
    } else {
        toast.classList.add('bg-red-600');
        toast.innerHTML = `<i class="fa-solid fa-circle-exclamation text-white"></i> <span>${message}</span>`;
    }
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.remove('translate-x-10', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('translate-x-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    loadSocieties();
});
