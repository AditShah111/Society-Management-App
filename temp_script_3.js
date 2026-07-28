
        // Custom Toast Function (Replacing standard alerts)
        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            
            let bgClass = 'bg-brand-500';
            let iconClass = 'fa-info-circle';
            if (type === 'success') {
                bgClass = 'bg-emerald-500';
                iconClass = 'fa-check-circle';
            } else if (type === 'error') {
                bgClass = 'bg-red-500';
                iconClass = 'fa-exclamation-circle';
            } else if (type === 'info') {
                bgClass = 'bg-blue-500';
                iconClass = 'fa-info-circle';
            }
            
            toast.className = `${bgClass} text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium transform transition-all duration-300 translate-y-4 opacity-0 flex items-center z-50`;
            toast.innerHTML = `<i class="fa-solid ${iconClass} mr-2"></i> ${message}`;
            
            container.appendChild(toast);
            
            // Trigger animation in
            setTimeout(() => {
                toast.classList.remove('translate-y-4', 'opacity-0');
            }, 10);
            
            // Trigger animation out and remove
            setTimeout(() => {
                toast.classList.add('translate-y-4', 'opacity-0');
                setTimeout(() => {
                    toast.remove();
                }, 300);
            }, 3000);
        }

        // Title mapping for the top header
        const pageTitles = {
            'dashboard': 'Dashboard Overview',
            'maintenance': 'Maintenance & Invoicing',
            'accounts': 'Books of Accounts',
            'agm': 'AGM & Resolutions Management',
            'redevelopment': 'Redevelopment Project Tracker',
            'documents': 'Statutory Documents (MCS Act 1960)',
            'legal': 'Legal Sources & Bye-laws',
            'mdc-panel': 'Master Data Centre Configuration'
        };

        // Function to toggle mobile menu visibility
        function toggleMobileMenu(open) {
            const sidebar = document.getElementById('mobile-sidebar');
            const backdrop = document.getElementById('mobile-sidebar-backdrop');
            if (open) {
                sidebar.classList.remove('-translate-x-full');
                backdrop.classList.remove('hidden');
            } else {
                sidebar.classList.add('-translate-x-full');
                backdrop.classList.add('hidden');
            }
        }

        // Function to switch between main views
        function switchView(viewId) {
            // Hide all views
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            // Remove active state from all nav buttons (desktop and mobile)
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            
            // Show the selected view
            document.getElementById('view-' + viewId).classList.add('active');
            // Highlight the selected nav button (desktop)
            const desktopNav = document.getElementById('nav-' + viewId);
            if (desktopNav) desktopNav.classList.add('active');
            
            // Highlight the selected nav button (mobile)
            const mobileNav = document.getElementById('mobile-nav-' + viewId);
            if (mobileNav) mobileNav.classList.add('active');
            
            // Update the page title
            document.getElementById('page-title').innerText = pageTitles[viewId];
        }

        // Function to switch sub-views in Books of Accounts
        function switchSubView(subViewId) {
            // Hide all subviews
            document.querySelectorAll('.subview-section').forEach(el => {
                el.classList.remove('block');
                el.classList.add('hidden');
            });
            
            // Reset all subnav items
            document.querySelectorAll('.subnav-item').forEach(el => {
                el.classList.remove('text-brand-600', 'font-bold', 'border-b-2', 'border-brand-600');
                el.classList.add('text-gray-500', 'hover:text-gray-800', 'font-medium');
            });
            
            // Show selected subview
            document.getElementById('subview-' + subViewId).classList.remove('hidden');
            document.getElementById('subview-' + subViewId).classList.add('block');
            
            // Highlight selected subnav item
            const activeNav = document.getElementById('subnav-' + subViewId);
            activeNav.classList.remove('text-gray-500', 'hover:text-gray-800', 'font-medium');
            activeNav.classList.add('text-brand-600', 'font-bold', 'border-b-2', 'border-brand-600');
        }

        // Initialize Financial Chart for the Dashboard
        document.addEventListener("DOMContentLoaded", function() {
            const ctx = document.getElementById('financeChart').getContext('2d');
            
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
                    datasets: [
                        {
                            label: 'Income (Maintenance)',
                            data: [0, 0, 0, 0, 0, 0],
                            backgroundColor: '#2563eb', // Brand Blue
                            borderRadius: 4,
                            barPercentage: 0.6
                        },
                        {
                            label: 'Expenditure',
                            data: [0, 0, 0, 0, 0, 0],
                            backgroundColor: '#94a3b8', // Slate Gray
                            borderRadius: 4,
                            barPercentage: 0.6
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top', align: 'end' }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { borderDash: [4, 4], color: '#e2e8f0' },
                            ticks: { callback: function(value) { return '₹' + (value/1000) + 'k'; } }
                        },
                        x: { grid: { display: false } }
                    }
                }
            });
        });
    