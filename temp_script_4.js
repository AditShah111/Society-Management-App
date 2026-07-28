
        let authMode = 'password';
        let otpSent = false;

        function setAuthMode(mode) {
            authMode = mode;
            otpSent = false;
            
            const tabPassword = document.getElementById('tab-password');
            const tabOtp = document.getElementById('tab-otp');
            const passGroup = document.getElementById('login-password-group');
            const otpGroup = document.getElementById('login-otp-group');
            const submitBtn = document.getElementById('login-submit-btn');
            
            if (mode === 'password') {
                tabPassword.className = 'w-1/2 py-2 text-xs font-bold text-center rounded-lg bg-brand-500 text-white focus:outline-none transition-all';
                tabOtp.className = 'w-1/2 py-2 text-xs font-bold text-center rounded-lg text-gray-400 hover:text-white focus:outline-none transition-all';
                passGroup.classList.remove('hidden');
                otpGroup.classList.add('hidden');
                submitBtn.innerText = 'Sign In';
            } else {
                tabPassword.className = 'w-1/2 py-2 text-xs font-bold text-center rounded-lg text-gray-400 hover:text-white focus:outline-none transition-all';
                tabOtp.className = 'w-1/2 py-2 text-xs font-bold text-center rounded-lg bg-brand-500 text-white focus:outline-none transition-all';
                passGroup.classList.add('hidden');
                otpGroup.classList.add('hidden');
                submitBtn.innerText = 'Send Verification PIN';
            }
        }
        window.setAuthMode = setAuthMode;

        const api = {
            async login(email, password) {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error || 'Invalid credentials');
                }
                return response.json();
            },
            async logout() {
                const response = await fetch('/api/logout', { method: 'POST' });
                if (!response.ok) throw new Error('Logout failed');
                return response.json();
            },
            async state() {
                const response = await fetch('/api/state');
                if (!response.ok) throw new Error(response.status === 401 ? '401' : 'Unable to load backend data');
                return response.json();
            },
            async createFinancialRecord(record) {
                const response = await fetch('/api/financial-records', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(record)
                });
                if (!response.ok) throw new Error('Unable to save financial record');
                return response.json();
            },
            async createAgmMeeting(meeting) {
                const response = await fetch('/api/agm-meetings', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(meeting)
                });
                if (!response.ok) throw new Error('Unable to save AGM meeting');
                return response.json();
            },
            async uploadDocument(formData) {
                const response = await fetch('/api/documents', { method: 'POST', body: formData });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error || 'Unable to upload document');
                }
                return response.json();
            },
            async deleteDocument(documentId) {
                const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    const message = error.error === 'API route not found.'
                        ? 'Delete route is not active yet. Restart the backend server and refresh the page.'
                        : (error.error || 'Unable to delete document');
                    throw new Error(message);
                }
                return response.json();
            },
            async updateMdcSociety(society) {
                const response = await fetch('/api/mdc/society', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(society)
                });
                if (!response.ok) throw new Error('Unable to update society profile');
                return response.json();
            },
            async updateMdcStages(stages) {
                const response = await fetch('/api/mdc/stages', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(stages)
                });
                if (!response.ok) throw new Error('Unable to update milestones');
                return response.json();
            },
            async updateMdcTenders(tenders) {
                const response = await fetch('/api/mdc/tenders', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(tenders)
                });
                if (!response.ok) throw new Error('Unable to update builder tenders');
                return response.json();
            },
            async importMdcBills(bills) {
                const response = await fetch('/api/mdc/import', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(bills)
                });
                if (!response.ok) throw new Error('Unable to import flat records');
                return response.json();
            }
        };

        const money = value => `INR ${Number(value || 0).toLocaleString('en-IN')}`;
        const shortDate = value => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        function setText(selector, value) {
            const element = document.querySelector(selector);
            if (element) element.textContent = value;
        }

        const statutoryForms = [
            { id: 'form-i', title: "Form 'I'", category: 'Register of Members' },
            { id: 'form-j', title: "Form 'J'", category: 'Register of Active Members' },
            { id: 'share-register', title: 'Share Register', category: 'Capital Contribution' },
            { id: 'nomination', title: 'Nomination', category: 'Form 14 & Register' },
            { id: 'property-register', title: 'Property Register', category: 'Dead Stock & Assets' }
        ];

        function getFormConfigFromCard(card) {
            const heading = card.querySelector('h3')?.textContent.trim();
            const subtitle = card.querySelector('p.font-semibold')?.textContent.trim();
            return statutoryForms.find(form => form.title === heading && form.category === subtitle);
        }

        function latestDocumentForForm(documents, formId) {
            return documents
                .filter(document => document.formId === formId || document.category === `Statutory Form: ${formId}`)
                .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
        }

        function openDigitalDocument(document, form) {
            if (!document) {
                showToast(`No uploaded file found for ${form.title}. Use the upload icon on this card.`, 'info');
                return;
            }
            window.open(document.url, '_blank');
        }

        function prepareStatutoryFormCards(documents = []) {
            document.querySelectorAll('#view-documents .grid > .group').forEach(card => {
                const form = getFormConfigFromCard(card);
                if (!form) return;

                card.dataset.formId = form.id;
                const linkedDocument = latestDocumentForForm(documents, form.id);
                let status = card.querySelector('[data-form-status]');
                if (!status) {
                    status = document.createElement('p');
                    status.dataset.formStatus = 'true';
                    status.className = 'text-[11px] text-gray-500 mb-3 truncate';
                    card.querySelector('.flex.space-x-2')?.before(status);
                }
                status.textContent = linkedDocument ? `Digital file: ${linkedDocument.title}` : 'No digital file uploaded yet';

                const buttons = card.querySelectorAll('button');
                const viewButton = buttons[0];
                const downloadButton = buttons[1];
                const uploadButton = buttons[2];

                if (viewButton && !viewButton.dataset.formBound) {
                    viewButton.dataset.formBound = 'true';
                    viewButton.addEventListener('click', () => openDigitalDocument(latestDocumentForForm(window.currentDocuments || [], form.id), form));
                }
                if (downloadButton && !downloadButton.dataset.formBound) {
                    downloadButton.dataset.formBound = 'true';
                    downloadButton.addEventListener('click', () => openDigitalDocument(latestDocumentForForm(window.currentDocuments || [], form.id), form));
                }
                if (uploadButton) {
                    const isAdmin = window.currentUserRole === 'super_admin' || window.currentUserRole === 'society_admin';
                    uploadButton.style.display = isAdmin ? 'block' : 'none';
                    if (!uploadButton.dataset.formBound) {
                        uploadButton.dataset.formBound = 'true';
                        uploadButton.addEventListener('click', () => {
                            window.activeStatutoryForm = form;
                            document.getElementById('backend-document-upload')?.click();
                        });
                    }
                }
            });
        }

        function bindBackendButtons() {
            document.querySelectorAll('button').forEach(button => {
                const label = button.textContent.trim();
                const title = button.getAttribute('title') || '';
                if (!button.dataset.backendBound && (label.includes('Add Voucher') || label.includes('Add Financial Entry'))) {
                    button.dataset.backendBound = 'true';
                    button.addEventListener('click', () => openModal('financial-entry'));
                }
                if (!button.dataset.backendBound && label.includes('Schedule Meeting')) {
                    button.dataset.backendBound = 'true';
                    button.addEventListener('click', () => openModal('schedule-meeting'));
                }
                if (!button.dataset.backendBound && title.includes('Upload') && !button.closest('#view-documents .grid')) {
                    button.dataset.backendBound = 'true';
                    button.addEventListener('click', () => {
                        window.activeStatutoryForm = null;
                        document.getElementById('backend-document-upload')?.click();
                    });
                }
            });
        }

        function renderDashboard(state) {
            const cards = document.querySelectorAll('#view-dashboard .border-l-4 h3');
            if (cards[0]) cards[0].textContent = state.dashboard.totalFlats;
            if (cards[1]) cards[1].textContent = money(state.dashboard.mtdCollection);
            if (cards[2]) cards[2].textContent = money(state.dashboard.outstandingDues);
            if (cards[3]) cards[3].textContent = state.dashboard.activeComplaints;

            const flatsTitle = document.getElementById('kpi-flats-title');
            if (flatsTitle && state.society.wing) {
                flatsTitle.textContent = `Total Flats (Wing ${state.society.wing})`;
            }

            const agm = state.dashboard.upcomingAgm;
            const eventCard = document.querySelector('#view-dashboard .bg-blue-50');
            if (eventCard && agm) {
                eventCard.querySelector('.font-bold').innerHTML = `<i class="fa-solid fa-gavel mr-2"></i> ${agm.title}`;
                eventCard.querySelector('p').textContent = `Scheduled: ${shortDate(agm.date)}`;
            }

            const chart = Chart.getChart('financeChart');
            if (chart) {
                chart.data.labels = state.dashboard.chart.map(item => item.month);
                chart.data.datasets[0].data = state.dashboard.chart.map(item => item.income);
                chart.data.datasets[1].data = state.dashboard.chart.map(item => item.expense);
                chart.update();
            }

            // Call Master Data Centre renderer for Redevelopment
            renderRedevelopment(state);
        }

        function renderRedevelopment(state) {
            const addressSpan = document.getElementById('society-address');
            if (addressSpan && state.society.address) {
                addressSpan.innerHTML = `<i class="fa-solid fa-location-dot text-brand-400"></i> ${state.society.address}`;
            }
            const regNoSpan = document.getElementById('society-registration-no');
            if (regNoSpan && state.society.registrationNo) {
                regNoSpan.innerText = state.society.registrationNo;
            }
            const regNameSpan = document.getElementById('society-registered-name');
            if (regNameSpan && state.society.registeredName) {
                regNameSpan.innerText = state.society.registeredName;
            }

            // Render Timeline Steps
            const stepsContainer = document.getElementById('redevelopment-steps-container');
            if (stepsContainer && state.redevelopmentStages) {
                const stages = state.redevelopmentStages;
                const totalStages = stages.length;
                if (totalStages === 0) {
                    stepsContainer.innerHTML = `
                        <div class="w-full text-center py-6 text-gray-500 text-sm">
                            No redevelopment milestones configured. Configure them in the Master Data Centre.
                        </div>
                    `;
                    return;
                }
                let activeIndex = -1; // last completed or in-progress index
                
                stages.forEach((stage, idx) => {
                    if (stage.status === 'Completed' || stage.status === 'In Progress') {
                        activeIndex = idx;
                    }
                });

                // Progress track percentage (scaled down slightly to match visual track spacing)
                const progressWidth = totalStages > 1 ? (activeIndex / (totalStages - 1)) * 75 : 0;

                let html = `
                    <!-- Background Track -->
                    <div class="absolute left-[12.5%] right-[12.5%] top-[1.75rem] transform -translate-y-1/2 h-1 bg-gray-200 z-0"></div>
                    <!-- Progress Track -->
                    <div class="absolute left-[12.5%] top-[1.75rem] transform -translate-y-1/2 h-1 bg-brand-500 z-0 transition-all duration-500" style="width: ${progressWidth}%"></div>
                `;

                stages.forEach((stage, idx) => {
                    const isCompleted = stage.status === 'Completed';
                    const isInProgress = stage.status === 'In Progress';
                    
                    let iconHtml = '';
                    let circleClass = '';
                    let textClass = 'text-gray-400';
                    
                    if (isCompleted) {
                        iconHtml = '<i class="fa-solid fa-check"></i>';
                        circleClass = 'bg-brand-500 text-white shadow-md';
                        textClass = 'text-gray-800 font-bold';
                    } else if (isInProgress) {
                        iconHtml = '<i class="fa-solid fa-spinner"></i>';
                        circleClass = 'bg-white border-4 border-brand-500 text-brand-500 shadow-md animate-pulse';
                        textClass = 'text-brand-600 font-bold';
                    } else {
                        iconHtml = `${idx + 1}`;
                        circleClass = 'bg-gray-100 text-gray-400 border-2 border-gray-200 shadow-sm';
                    }

                    html += `
                        <div class="relative z-10 flex flex-col items-center w-1/4 px-2">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold ${circleClass}">
                                ${iconHtml}
                            </div>
                            <p class="text-xs mt-3 text-center ${textClass}">${stage.name}</p>
                            <p class="text-[10px] text-gray-500 text-center">${stage.subText}</p>
                        </div>
                    `;
                });
                
                stepsContainer.innerHTML = html;
            }

            // Render Tenders List
            const tendersContainer = document.getElementById('redevelopment-tenders-list');
            if (tendersContainer && state.redevelopmentTenders) {
                tendersContainer.innerHTML = state.redevelopmentTenders.length ? state.redevelopmentTenders.map(t => `
                    <tr class="hover:bg-gray-50 transition-colors">
                        <td class="p-4">
                            <p class="font-bold text-gray-800">${t.builderName}</p>
                            <p class="text-xs text-gray-500">Extra Area: ${t.extraAreaPct}% | Corpus: ₹${t.corpusAmountLakhs}L</p>
                        </td>
                        <td class="p-4 text-right">
                            <span class="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">${t.status}</span>
                        </td>
                    </tr>
                `).join('') : `
                    <tr>
                        <td colspan="2" class="p-4 text-center text-sm text-gray-500">No active tender submissions yet.</td>
                    </tr>
                `;
            }

            // Render Redevelopment Documents
            const redevelopmentDocsList = document.getElementById('redevelopment-documents-list');
            if (redevelopmentDocsList && state.documents) {
                const redevDocs = state.documents.filter(d => d.category === 'Redevelopment');
                redevelopmentDocsList.innerHTML = redevDocs.length ? redevDocs.map(d => `
                    <div class="flex items-center justify-between p-3 border border-gray-200 rounded hover:shadow-sm transition-shadow">
                        <div class="flex items-center overflow-hidden mr-4">
                            <i class="fa-solid fa-file-pdf text-red-500 text-2xl mr-3 flex-shrink-0"></i>
                            <div class="truncate">
                                <p class="text-sm font-bold text-gray-800 truncate">${d.title}</p>
                                <p class="text-xs text-gray-500 truncate">Uploaded on ${shortDate(d.uploadedAt)}</p>
                            </div>
                        </div>
                        <a href="${d.url}" target="_blank" class="text-gray-400 hover:text-brand-500 flex-shrink-0"><i class="fa-solid fa-download"></i></a>
                    </div>
                `).join('') : `
                    <p class="text-xs text-gray-500 text-center py-4">No redevelopment documents uploaded yet.</p>
                `;
            }
        }

        function populateMdcFormInputs(state) {
            // Populate profile
            if (state.society) {
                document.getElementById('mdc-input-name').value = state.society.registeredName || 'Lotus Co-operative Housing Society Ltd.';
                document.getElementById('mdc-input-reg').value = state.society.registrationNo || 'MUM/WP/HSG/TC/12345/2026';
                document.getElementById('mdc-input-wing').value = state.society.wing || 'A';
                document.getElementById('mdc-input-flats').value = state.society.totalFlats || 48;
                document.getElementById('mdc-input-address').value = state.society.address || 'Plot 42, Sector 15, Vashi, Navi Mumbai, Maharashtra 400703';
                document.getElementById('mdc-input-mtd').value = state.society.mtdCollection || 345000;
                document.getElementById('mdc-input-dues').value = state.society.outstandingDues || 42500;
                document.getElementById('mdc-input-complaints').value = state.society.activeComplaints || 2;

                // Populate Default Billing Rates
                document.getElementById('mdc-rate-service').value = state.society.rateService || 1200;
                document.getElementById('mdc-rate-sinking').value = state.society.rateSinking || 300;
                document.getElementById('mdc-rate-repair').value = state.society.rateRepair || 500;
                document.getElementById('mdc-rate-water').value = state.society.rateWater || 250;
                document.getElementById('mdc-rate-parking').value = state.society.rateParking || 150;
            }

            // Populate Redevelopment stages grid
            const stagesGrid = document.getElementById('mdc-stages-grid');
            if (stagesGrid && state.redevelopmentStages) {
                let stagesToRender = state.redevelopmentStages;
                if (!stagesToRender || stagesToRender.length === 0) {
                    stagesToRender = [
                        { id: 1, name: '', subText: '', status: 'Pending' },
                        { id: 2, name: '', subText: '', status: 'Pending' },
                        { id: 3, name: '', subText: '', status: 'Pending' },
                        { id: 4, name: '', subText: '', status: 'Pending' }
                    ];
                }
                stagesGrid.innerHTML = stagesToRender.map(stage => {
                    const statusOptions = ['Pending', 'In Progress', 'Completed'];
                    const optionsHtml = statusOptions.map(opt => `
                        <option value="${opt}" ${stage.status === opt ? 'selected' : ''}>${opt}</option>
                    `).join('');
                    return `
                        <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3" data-stage-id="${stage.id}">
                            <div class="flex justify-between items-center border-b border-gray-200 pb-2 mb-2">
                                <span class="text-xs font-bold text-brand-600">Stage ${stage.id}</span>
                            </div>
                            <div>
                                <label class="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Stage Name</label>
                                <input type="text" class="stage-name-input w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-brand-500" value="${stage.name}" required>
                            </div>
                            <div>
                                <label class="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Sub Text / PMC</label>
                                <input type="text" class="stage-sub-input w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-brand-500" value="${stage.subText}" required>
                            </div>
                            <div>
                                <label class="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Status</label>
                                <select class="stage-status-input w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-brand-500">
                                    ${optionsHtml}
                                </select>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // Populate Redevelopment tenders
            const tendersTbody = document.getElementById('mdc-tenders-tbody');
            if (tendersTbody && state.redevelopmentTenders) {
                tendersTbody.innerHTML = '';
                state.redevelopmentTenders.forEach(t => addNewTenderRow(t));
            }
        }

        function addNewTenderRow(data = {}) {
            const tbody = document.getElementById('mdc-tenders-tbody');
            if (!tbody) return;
            const tr = document.createElement('tr');
            tr.className = 'tender-row hover:bg-gray-50/50 transition-colors';
            
            const builderName = data.builderName || '';
            const extraAreaPct = data.extraAreaPct || '';
            const corpusAmountLakhs = data.corpusAmountLakhs || '';

            tr.innerHTML = `
                <td class="py-2.5 pr-2">
                    <input type="text" class="tender-builder w-full bg-gray-50/50 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-brand-500" value="${builderName}" placeholder="e.g. L&T Realty" required>
                </td>
                <td class="py-2.5 pr-2 w-28">
                    <input type="number" step="0.01" class="tender-area w-full bg-gray-50/50 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-brand-500" value="${extraAreaPct}" placeholder="%" required>
                </td>
                <td class="py-2.5 pr-2 w-28">
                    <input type="number" step="0.01" class="tender-corpus w-full bg-gray-50/50 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-brand-500" value="${corpusAmountLakhs}" placeholder="₹ Lakhs" required>
                </td>
                <td class="py-2.5 text-right w-16">
                    <button type="button" onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700 text-xs font-semibold p-1" title="Delete tender"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        }

        async function saveMdcProfile(event) {
            event.preventDefault();
            const society = {
                registeredName: document.getElementById('mdc-input-name').value,
                registrationNo: document.getElementById('mdc-input-reg').value,
                wing: document.getElementById('mdc-input-wing').value,
                totalFlats: Number(document.getElementById('mdc-input-flats').value),
                address: document.getElementById('mdc-input-address').value,
                mtdCollection: Number(document.getElementById('mdc-input-mtd').value),
                outstandingDues: Number(document.getElementById('mdc-input-dues').value),
                activeComplaints: Number(document.getElementById('mdc-input-complaints').value),
                rateService: Number(document.getElementById('mdc-rate-service').value),
                rateSinking: Number(document.getElementById('mdc-rate-sinking').value),
                rateRepair: Number(document.getElementById('mdc-rate-repair').value),
                rateWater: Number(document.getElementById('mdc-rate-water').value),
                rateParking: Number(document.getElementById('mdc-rate-parking').value)
            };
            try {
                await api.updateMdcSociety(society);
                showToast('Society profile updated successfully');
                refreshLiveData();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        async function saveMdcStages() {
            const stages = [];
            const grid = document.getElementById('mdc-stages-grid');
            const blocks = grid.querySelectorAll('[data-stage-id]');
            blocks.forEach(block => {
                stages.push({
                    id: Number(block.dataset.stageId),
                    name: block.querySelector('.stage-name-input').value,
                    subText: block.querySelector('.stage-sub-input').value,
                    status: block.querySelector('.stage-status-input').value
                });
            });
            try {
                await api.updateMdcStages(stages);
                showToast('Milestone timeline updated successfully');
                refreshLiveData();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        async function saveMdcTenders() {
            const tenders = [];
            const rows = document.querySelectorAll('#mdc-tenders-tbody .tender-row');
            rows.forEach(row => {
                tenders.push({
                    builderName: row.querySelector('.tender-builder').value,
                    extraAreaPct: Number(row.querySelector('.tender-area').value),
                    corpusAmountLakhs: Number(row.querySelector('.tender-corpus').value),
                    status: 'Under Review'
                });
            });
            try {
                await api.updateMdcTenders(tenders);
                showToast('Redevelopment tenders updated successfully');
                refreshLiveData();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        function triggerMdcImport() {
            document.getElementById('mdc-import-file').click();
        }

        function handleMdcImport(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    await api.importMdcBills(data);
                    showToast('Flat layout and maintenance records imported successfully');
                    refreshLiveData();
                } catch (error) {
                    showToast('Invalid JSON file format. Make sure it matches flat/maintenance schema.', 'error');
                }
            };
            reader.readAsText(file);
        }

        function renderMaintenance(bills) {
            const tbody = document.getElementById('maintenance-bills-tbody');
            if (!tbody) return;

            const isAdmin = window.currentUserRole === 'super_admin' || window.currentUserRole === 'society_admin' || window.currentUserRole === 'accountant';

            tbody.innerHTML = bills.length ? bills.map(bill => {
                const isPaid = bill.status.toLowerCase() === 'paid';
                
                // Overdue calculation (if unpaid and past due date)
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const dueDate = new Date(bill.dueDate);
                const diffTime = today - dueDate;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const isDraft = bill.status === 'Draft';
                const isOverdue = !isPaid && !isDraft && diffDays > 0;

                let badgeClass = 'bg-amber-100 text-amber-700 border border-amber-200';
                let statusText = 'Unpaid';
                if (isDraft) {
                    badgeClass = 'bg-gray-100 text-gray-500 border border-gray-200';
                    statusText = 'Draft';
                } else if (isPaid) {
                    badgeClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
                    statusText = 'Paid';
                } else if (isOverdue) {
                    badgeClass = 'bg-red-100 text-red-700 border border-red-200';
                    statusText = `Overdue (${diffDays} Days)`;
                }

                return `
                    <tr class="hover:bg-gray-50/50 transition-colors">
                        <td class="px-6 py-4">
                            <p class="font-bold text-gray-800">${bill.flatNo}</p>
                            <p class="text-[11px] text-gray-400 font-medium">${bill.memberName}</p>
                        </td>
                        <td class="px-6 py-4 text-gray-600 font-medium text-xs">${bill.billingMonth}</td>
                        <td class="px-6 py-4 text-gray-500 text-xs">${shortDate(bill.billDate)}</td>
                        <td class="px-6 py-4 text-gray-500 text-xs">${shortDate(bill.dueDate)}</td>
                        <td class="px-6 py-4 font-bold text-gray-800 text-right text-xs">₹${Number(bill.amount).toLocaleString('en-IN')}</td>
                        <td class="px-6 py-4 text-center">
                            <span class="px-2.5 py-1 ${badgeClass} text-[10px] rounded-full font-bold uppercase tracking-wider">${statusText}</span>
                        </td>
                        <td class="px-6 py-4 text-right space-x-2.5">
                            <button onclick="viewBillInvoice('${bill.id}')" class="text-brand-600 hover:text-brand-700 text-xs font-bold transition-colors"><i class="fa-solid fa-file-invoice"></i> Bill Details</button>
                            ${!isPaid && !isDraft && isAdmin ? `
                                <button onclick="payMaintenanceBill('${bill.id}')" class="text-emerald-600 hover:text-emerald-700 text-xs font-bold transition-colors"><i class="fa-solid fa-circle-check"></i> Collect</button>
                            ` : ''}
                            ${!isPaid && !isDraft && isOverdue ? `
                                <button onclick="sendWhatsAppReminder('${bill.id}')" class="text-green-500 hover:text-green-600 text-xs font-bold transition-colors" title="Send WhatsApp Reminder"><i class="fa-brands fa-whatsapp"></i> Remind</button>
                            ` : ''}
                        </td>
                    </tr>
                `;
            }).join('') : `
                <tr>
                    <td colspan="7" class="text-center py-10 text-gray-500 text-sm font-medium">No maintenance billing records found. Select different filters or generate bills.</td>
                </tr>
            `;
        }

        function filterMaintenanceBills() {
            if (!window.stateData || !window.stateData.maintenanceBills) return;
            const query = document.getElementById('maint-search-flat').value.toLowerCase().trim();
            const monthVal = document.getElementById('maint-month-filter').value;
            const statusVal = document.getElementById('maint-status-filter').value;
            
            let filtered = window.stateData.maintenanceBills;
            
            if (query) {
                filtered = filtered.filter(b => b.flatNo.toLowerCase().includes(query) || b.memberName.toLowerCase().includes(query));
            }
            if (monthVal !== 'ALL') {
                filtered = filtered.filter(b => b.billingMonth === monthVal);
            }
            if (statusVal !== 'ALL') {
                filtered = filtered.filter(b => {
                    const isPaid = b.status.toLowerCase() === 'paid';
                    const isDraft = b.status.toLowerCase() === 'draft';
                    const isOverdue = !isPaid && !isDraft && (new Date(b.dueDate) < new Date());
                    if (statusVal === 'Draft') return isDraft;
                    if (statusVal === 'Paid') return isPaid;
                    if (statusVal === 'Unpaid') return !isPaid && !isDraft && !isOverdue;
                    if (statusVal === 'Overdue') return isOverdue;
                    return true;
                });
            }
            renderMaintenance(filtered);
        }

        async function payMaintenanceBill(billId) {
            if (!confirm('Mark this maintenance bill as PAID and record credit entry in Ledger?')) return;
            try {
                const response = await fetch('/api/maintenance/pay', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ billId })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                showToast(`Payment collected successfully! Recorded in Ledger.`);
                refreshLiveData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        function sendWhatsAppReminder(billId) {
            const bill = (window.stateData.maintenanceBills || []).find(b => b.id === billId);
            if (!bill) return;
            showToast(`[WhatsApp] Dispatching auto reminder to ${bill.memberName} for ₹${Number(bill.amount).toLocaleString('en-IN')}!`, 'success');
        }

        function viewBillInvoice(billId) {
            if (!window.stateData) return;
            const bill = (window.stateData.maintenanceBills || []).find(b => b.id === billId);
            const soc = window.stateData.society || {};
            if (!bill) return;

            // Header info
            document.getElementById('invoice-soc-name').innerText = soc.registeredName || 'Lotus Co-operative Housing Society Ltd.';
            document.getElementById('invoice-soc-reg').innerText = `REG NO: ${soc.registrationNo || 'MUM/WP/HSG/TC/12345/2026'}`;
            document.getElementById('invoice-soc-addr').innerText = soc.address || 'Plot 42, Sector 15, Vashi, Navi Mumbai, Maharashtra 400703';
            
            // Bill info
            document.getElementById('invoice-period').innerText = bill.billingMonth;
            document.getElementById('invoice-flat-no').innerText = bill.flatNo;
            document.getElementById('invoice-member-name').innerText = bill.memberName;
            document.getElementById('invoice-bill-date').innerText = shortDate(bill.billDate);
            document.getElementById('invoice-due-date').innerText = shortDate(bill.dueDate);

            // Particulars breakdown
            document.getElementById('invoice-item-service').innerText = `₹${Number(bill.serviceCharges || 0).toLocaleString('en-IN')}`;
            document.getElementById('invoice-item-sinking').innerText = `₹${Number(bill.sinkingFund || 0).toLocaleString('en-IN')}`;
            document.getElementById('invoice-item-repair').innerText = `₹${Number(bill.repairFund || 0).toLocaleString('en-IN')}`;
            document.getElementById('invoice-item-water').innerText = `₹${Number(bill.waterCharges || 0).toLocaleString('en-IN')}`;
            document.getElementById('invoice-item-parking').innerText = `₹${Number(bill.parkingCharges || 0).toLocaleString('en-IN')}`;
            
            // Total Net Payable
            document.getElementById('invoice-total').innerText = `₹${Number(bill.amount || 0).toLocaleString('en-IN')}`;

            // Status stamp layout
            const stamp = document.getElementById('invoice-status-stamp');
            const isPaid = bill.status.toLowerCase() === 'paid';
            
            // Overdue check
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDate = new Date(bill.dueDate);
            const diffTime = today - dueDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const isOverdue = !isPaid && diffDays > 0;

            stamp.className = 'absolute right-0 top-0 border-4 uppercase font-black text-xl px-4 py-2 rotate-12 rounded opacity-80 select-none';
            if (isPaid) {
                stamp.innerText = 'Paid';
                stamp.classList.add('border-emerald-500', 'text-emerald-500');
            } else if (isOverdue) {
                stamp.innerText = 'Overdue';
                stamp.classList.add('border-red-500', 'text-red-500');
            } else if (bill.status === 'Draft') {
                stamp.innerText = 'Draft';
                stamp.classList.add('border-gray-500', 'text-gray-500');
            } else {
                stamp.innerText = 'Unpaid';
                stamp.classList.add('border-amber-500', 'text-amber-500');
            }

            openModal('view-invoice');
        }

        async function generateMonthlyBillsSubmit(event) {
            event.preventDefault();
            const month = document.getElementById('gen-bills-month').value;
            try {
                const response = await fetch('/api/maintenance/generate', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ month })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                showToast(`Maintenance bills for ${month} generated successfully!`);
                closeModal('generate-bills');
                refreshLiveData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        async function approveDraftsSubmit(event) {
            event.preventDefault();
            const month = document.getElementById('approve-bills-month').value;
            try {
                const response = await fetch('/api/maintenance/approve', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ month })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                showToast(data.message);
                closeModal('approve-drafts');
                refreshLiveData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }

        function renderFinancialStatements(records) {
            let incomeTotal = 0;
            let expenseTotal = 0;
            const groups = {};

            records.forEach(r => {
                const amt = Number(r.amount || 0);
                const head = r.accountHead;
                const type = r.type;
                if (!groups[head]) {
                    groups[head] = { amount: 0, type };
                }
                groups[head].amount += amt;
                if (type === 'income') {
                    incomeTotal += amt;
                } else {
                    expenseTotal += amt;
                }
            });

            // Expense Side Table
            const expenseTbody = document.getElementById('expense-tbody');
            if (expenseTbody) {
                let expenseRows = Object.entries(groups)
                    .filter(([_, d]) => d.type === 'expense')
                    .map(([head, d]) => `<tr class="hover:bg-gray-50"><td class="p-3 text-gray-700">To ${head}</td><td class="p-3 text-right font-medium">₹${Number(d.amount).toLocaleString('en-IN')}</td></tr>`)
                    .join('');

                const surplus = incomeTotal - expenseTotal;
                if (surplus > 0) {
                    expenseRows += `<tr class="hover:bg-gray-50 bg-emerald-50"><td class="p-3 text-gray-800 font-bold">To Excess of Income over Exp.</td><td class="p-3 text-right font-bold text-emerald-600">₹${Number(surplus).toLocaleString('en-IN')}</td></tr>`;
                }
                expenseTbody.innerHTML = expenseRows || `<tr><td colspan="2" class="p-3 text-gray-500 text-center text-xs">No expense records found</td></tr>`;
            }

            // Income Side Table
            const incomeTbody = document.getElementById('income-tbody');
            if (incomeTbody) {
                let incomeRows = Object.entries(groups)
                    .filter(([_, d]) => d.type === 'income')
                    .map(([head, d]) => `<tr class="hover:bg-gray-50"><td class="p-3 text-gray-700">By ${head}</td><td class="p-3 text-right font-medium">₹${Number(d.amount).toLocaleString('en-IN')}</td></tr>`)
                    .join('');

                const surplus = incomeTotal - expenseTotal;
                if (surplus < 0) {
                    incomeRows += `<tr class="hover:bg-gray-50 bg-red-50"><td class="p-3 text-gray-800 font-bold">By Deficit of Income over Exp.</td><td class="p-3 text-right font-bold text-red-600">₹${Number(Math.abs(surplus)).toLocaleString('en-IN')}</td></tr>`;
                }
                incomeTbody.innerHTML = incomeRows || `<tr><td colspan="2" class="p-3 text-gray-500 text-center text-xs">No income records found</td></tr>`;
            }

            // Set Income & Exp totals
            const statementTotalVal = Math.max(incomeTotal, expenseTotal);
            const statementTotalEl = document.querySelector('#subview-income .bg-gray-800 span:nth-child(2)');
            if (statementTotalEl) {
                statementTotalEl.textContent = `₹${Number(statementTotalVal).toLocaleString('en-IN')}`;
            }

            // Balance Sheet Liabilities
            const liabTbody = document.getElementById('liabilities-tbody');
            const surplus = incomeTotal - expenseTotal;
            if (liabTbody) {
                const sinking = groups['Sinking Fund']?.amount || 0;
                const reserve = groups['Reserve Fund']?.amount || 0;
                const repair = groups['Repairs & Maintenance Fund']?.amount || 0;
                liabTbody.innerHTML = `
                    <tr class="hover:bg-gray-50"><td class="p-3 font-bold text-gray-800">Share Capital</td><td class="p-3 text-right font-bold">₹0.00</td></tr>
                    <tr class="hover:bg-gray-50"><td class="p-3 font-bold text-gray-800">Reserve & Surplus</td><td class="p-3 text-right font-bold"></td></tr>
                    <tr class="hover:bg-gray-50"><td class="p-3 pl-6 text-gray-600">Reserve Fund</td><td class="p-3 text-right font-medium">₹${Number(reserve).toLocaleString('en-IN')}</td></tr>
                    <tr class="hover:bg-gray-50"><td class="p-3 pl-6 text-gray-600">Sinking Fund</td><td class="p-3 text-right font-medium">₹${Number(sinking).toLocaleString('en-IN')}</td></tr>
                    <tr class="hover:bg-gray-50"><td class="p-3 pl-6 text-gray-600">Building Repair Fund</td><td class="p-3 text-right font-medium">₹${Number(repair).toLocaleString('en-IN')}</td></tr>
                    <tr class="hover:bg-gray-50"><td class="p-3 pl-6 ${surplus >= 0 ? 'text-emerald-600' : 'text-red-600'} font-semibold">+ Current Year Surplus</td><td class="p-3 text-right font-medium">₹${Number(surplus).toLocaleString('en-IN')}</td></tr>
                `;
            }

            // Balance Sheet Assets
            const assetTbody = document.getElementById('assets-tbody');
            if (assetTbody) {
                const cash = Math.max(0, surplus);
                assetTbody.innerHTML = `
                    <tr class="hover:bg-gray-50"><td class="p-3 font-bold text-gray-800">Fixed Assets</td><td class="p-3 text-right font-bold"></td></tr>
                    <tr class="hover:bg-gray-50"><td class="p-3 pl-6 text-gray-600">Land & Building (Nominal)</td><td class="p-3 text-right font-medium">₹0.00</td></tr>
                    <tr class="hover:bg-gray-50"><td class="p-3 font-bold text-gray-800">Current Assets</td><td class="p-3 text-right font-bold"></td></tr>
                    <tr class="hover:bg-gray-50"><td class="p-3 pl-6 text-gray-600">Cash at Bank</td><td class="p-3 text-right font-medium">₹${Number(cash).toLocaleString('en-IN')}</td></tr>
                    <tr class="hover:bg-gray-50"><td class="p-3 pl-6 text-gray-600">Cash in Hand</td><td class="p-3 text-right font-medium">₹0.00</td></tr>
                `;
            }

            // Set Balance Sheet totals
            const balanceTotalEl = document.querySelector('#subview-balance .bg-gray-800 span:nth-child(2)');
            if (balanceTotalEl) {
                const sinking = groups['Sinking Fund']?.amount || 0;
                const reserve = groups['Reserve Fund']?.amount || 0;
                const repair = groups['Repairs & Maintenance Fund']?.amount || 0;
                const totalBS = Math.max(0, sinking + reserve + repair + surplus);
                balanceTotalEl.textContent = `₹${Number(totalBS).toLocaleString('en-IN')}`;
            }
        }

        function renderLedger(records) {
            const tbody = document.querySelector('#subview-ledger tbody');
            if (!tbody) return;
            tbody.innerHTML = records.slice(0, 12).map(record => `
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-6 py-4 text-gray-600">${shortDate(record.date)}</td>
                    <td class="px-6 py-4">
                        <div class="font-bold text-gray-800">${record.accountHead}</div>
                        <div class="text-xs text-gray-500">${record.description || ''}</div>
                    </td>
                    <td class="px-6 py-4 text-gray-600 text-xs font-mono">${record.voucherNo || '-'}</td>
                    <td class="px-6 py-4 text-right font-bold ${record.type === 'income' ? 'text-green-600' : 'text-gray-400'}">${record.type === 'income' ? Number(record.amount).toLocaleString('en-IN') : '-'}</td>
                    <td class="px-6 py-4 text-right font-bold ${record.type === 'expense' ? 'text-red-600' : 'text-gray-400'}">${record.type === 'expense' ? Number(record.amount).toLocaleString('en-IN') : '-'}</td>
                </tr>
            `).join('');
        }

        function renderAgm(meetings) {
            const container = document.querySelector('#view-agm .p-6:not(.border-b)');
            if (!container) return;
            container.innerHTML = meetings.map(meeting => {
                const finalized = meeting.status.toLowerCase().includes('final');
                const badge = finalized ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
                return `
                    <div class="border border-gray-200 rounded-lg p-5 mb-4 hover:shadow-md transition-shadow ${finalized ? '' : 'bg-blue-50/30'}">
                        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <div class="flex items-center space-x-3 mb-2">
                                    <h3 class="text-lg font-bold ${finalized ? 'text-gray-800' : 'text-brand-700'}">${meeting.title}</h3>
                                    <span class="${badge} text-[10px] uppercase font-bold px-2 py-1 rounded">${meeting.status}</span>
                                </div>
                                <p class="text-sm text-gray-600 mb-1"><i class="fa-regular fa-calendar mr-2"></i> Date: ${shortDate(meeting.date)}</p>
                                <p class="text-xs text-gray-500">${meeting.agenda || ''}</p>
                            </div>
                            <button class="bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 px-3 py-1.5 rounded text-sm font-bold whitespace-nowrap">
                                <i class="fa-solid ${finalized ? 'fa-file-pdf text-red-500' : 'fa-pen-to-square text-brand-500'} mr-1"></i>${finalized ? 'View Minutes' : 'Edit Agenda'}
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function renderDocuments(documents) {
            window.currentDocuments = documents;
            prepareStatutoryFormCards(documents);
            const list = document.getElementById('uploaded-documents-list');
            if (!list) return;
            const isAdmin = window.currentUserRole === 'super_admin' || window.currentUserRole === 'society_admin';
            list.innerHTML = documents.length ? documents.map(document => `
                <div class="flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:shadow-sm transition-all bg-gray-50/30">
                    <div class="flex items-center overflow-hidden mr-4">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white shadow-sm border border-gray-100">
                            <i class="fa-solid ${document.mimeType.includes('pdf') ? 'fa-file-pdf text-red-500' : document.mimeType.includes('word') ? 'fa-file-word text-blue-500' : 'fa-file-lines text-gray-500'} text-xl"></i>
                        </div>
                        <div class="truncate ml-3">
                            <p class="text-sm font-bold text-gray-800 truncate">${document.title}</p>
                            <p class="text-xs text-gray-500 truncate">${document.category} | Uploaded ${shortDate(document.uploadedAt)}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <a href="${document.url}" target="_blank" class="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-brand-500 flex items-center justify-center transition-all" title="View or download"><i class="fa-solid fa-download"></i></a>
                        ${isAdmin ? `<button class="w-8 h-8 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 flex items-center justify-center transition-all" title="Delete document" onclick="deleteUploadedDocument('${document.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                </div>
            `).join('') : '<p class="text-sm text-gray-500 text-center py-4">No files uploaded yet.</p>';
        }

        async function deleteUploadedDocument(documentId) {
            const document = (window.currentDocuments || []).find(item => item.id === documentId);
            if (!document) return showToast('Document not found in the current list', 'info');
            if (!confirm(`Delete "${document.title}"? This removes the stored file too.`)) return;

            try {
                await api.deleteDocument(documentId);
                showToast('Document deleted');
                refreshLiveData();
            } catch (error) {
                showToast(error.message, 'info');
            }
        }

        async function logout() {
            try {
                await api.logout();
                showToast('Signed out successfully');
                window.currentDocuments = [];
                window.location.href = '/login';
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        async function refreshLiveData() {
            try {
                const state = await api.state();
                window.stateData = state;
                
                // RBAC UI Control - Hide actions if not admin
                window.currentUserRole = state.currentUser.role;
                const isAdmin = state.currentUser.role === 'super_admin' || state.currentUser.role === 'society_admin';
                const addFinBtn = document.getElementById('add-fin-entry-btn');
                const schedMeetBtn = document.getElementById('schedule-meeting-btn');
                const uploadDocBtn = document.getElementById('upload-doc-btn');
                const maintGenBtn = document.getElementById('maint-generate-btn');
                const maintApproveBtn = document.getElementById('maint-approve-btn');
                
                if (addFinBtn) addFinBtn.style.display = isAdmin ? 'block' : 'none';
                if (schedMeetBtn) schedMeetBtn.style.display = isAdmin ? 'block' : 'none';
                if (uploadDocBtn) uploadDocBtn.style.display = isAdmin ? 'flex' : 'none';
                if (maintGenBtn) maintGenBtn.style.display = isAdmin ? 'flex' : 'none';
                if (maintApproveBtn) maintApproveBtn.style.display = isAdmin ? 'flex' : 'none';
                
                const navMdc = document.getElementById('nav-mdc-panel');
                const mobMdc = document.getElementById('mobile-nav-mdc-panel');
                if (navMdc) navMdc.style.display = isAdmin ? 'flex' : 'none';
                if (mobMdc) mobMdc.style.display = isAdmin ? 'flex' : 'none';
                
                // Update sidebar displays
                const userEmails = document.querySelectorAll('.user-email-display');
                userEmails.forEach(el => el.innerText = state.currentUser.email);
                
                const userRoles = document.querySelectorAll('.user-role-display');
                const roleLabels = {
                    'super_admin': 'Super Admin',
                    'society_admin': 'Committee Admin',
                    'gate_guard': 'Gate Guard',
                    'member': 'Resident'
                };
                userRoles.forEach(el => el.innerText = roleLabels[state.currentUser.role] || 'Resident');
                
                renderDashboard(state);
                renderLedger(state.financialRecords);
                renderFinancialStatements(state.financialRecords);
                renderMaintenance(state.maintenanceBills);
                renderAgm(state.agmMeetings);
                renderDocuments(state.documents);
                populateMdcFormInputs(state);
                bindBackendButtons();
            } catch (error) {
                if (error.message === '401') {
                    window.location.href = '/login';
                } else {
                    console.error("Fetch failed:", error.message);
                }
            }
        }

        // Modal triggers
        function openModal(modalId) {
            const modal = document.getElementById('modal-' + modalId);
            const card = document.getElementById('modal-' + modalId + '-card');
            if (modal && card) {
                if (modalId === 'financial-entry') {
                    document.getElementById('fin-date').value = new Date().toISOString().slice(0, 10);
                    document.getElementById('fin-voucher').value = '';
                    document.getElementById('fin-account-head').value = '';
                    document.getElementById('fin-amount').value = '';
                    document.getElementById('fin-desc').value = '';
                } else if (modalId === 'schedule-meeting') {
                    document.getElementById('meet-date').value = new Date().toISOString().slice(0, 10);
                    document.getElementById('meet-title').value = '';
                    document.getElementById('meet-agenda').value = '';
                    document.getElementById('meet-status').value = 'Scheduled';
                }
                
                modal.classList.remove('hidden');
                setTimeout(() => {
                    card.classList.remove('scale-95', 'opacity-0');
                    card.classList.add('scale-100', 'opacity-100');
                }, 10);
            }
        }

        function closeModal(modalId) {
            const modal = document.getElementById('modal-' + modalId);
            const card = document.getElementById('modal-' + modalId + '-card');
            if (modal && card) {
                card.classList.remove('scale-100', 'opacity-100');
                card.classList.add('scale-95', 'opacity-0');
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 300);
            }
        }

        function toggleUploadPanel(show) {
            const panel = document.getElementById('document-upload-panel');
            if (!panel) return;
            if (show === undefined) {
                panel.classList.toggle('hidden');
            } else if (show) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        }

        async function submitFinancialEntry(event) {
            event.preventDefault();
            const accountHead = document.getElementById('fin-account-head').value;
            const amount = Number(document.getElementById('fin-amount').value);
            const type = document.getElementById('fin-type').value;
            const date = document.getElementById('fin-date').value;
            const voucherNo = document.getElementById('fin-voucher').value || (type === 'income' ? 'RV-NEW' : 'PV-NEW');
            const description = document.getElementById('fin-desc').value;
            const month = new Date(date).toLocaleString('en-US', { month: 'short' });

            try {
                await api.createFinancialRecord({
                    date,
                    month,
                    accountHead,
                    amount,
                    type,
                    voucherNo,
                    description
                });
                showToast('Financial entry saved successfully');
                closeModal('financial-entry');
                refreshLiveData();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        async function submitScheduleMeeting(event) {
            event.preventDefault();
            const title = document.getElementById('meet-title').value;
            const date = document.getElementById('meet-date').value;
            const status = document.getElementById('meet-status').value;
            const agenda = document.getElementById('meet-agenda').value;

            try {
                await api.createAgmMeeting({
                    title,
                    date,
                    status,
                    agenda
                });
                showToast('Meeting scheduled successfully');
                closeModal('schedule-meeting');
                refreshLiveData();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        // Redirection fallbacks for any dynamic button calls
        function addFinancialRecord() {
            openModal('financial-entry');
        }

        function addAgmMeeting() {
            openModal('schedule-meeting');
        }

        async function uploadDocument(event) {
            event.preventDefault?.();
            const isFormSubmit = event.currentTarget?.id === 'document-upload-form';
            const fileInput = isFormSubmit ? document.getElementById('document-upload-file') : event.target;
            const file = fileInput?.files?.[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('file', file);
            const titleInput = document.getElementById('document-upload-title');
            const categoryInput = document.getElementById('document-upload-category');
            const form = window.activeStatutoryForm;
            const title = form ? `${form.title} - ${file.name}` : (isFormSubmit ? (titleInput.value || file.name) : (prompt('Document title', file.name) || file.name));
            const category = form ? `Statutory Form: ${form.id}` : (isFormSubmit ? (categoryInput.value || 'Financials') : (prompt('Category', 'Statutory') || 'Statutory'));
            formData.append('title', title);
            formData.append('category', category);
            if (form) {
                formData.append('formId', form.id);
                formData.append('formName', form.title);
            }
            try {
                await api.uploadDocument(formData);
                showToast(form ? `${form.title} digital file uploaded` : 'Document uploaded and stored');
                if (isFormSubmit) {
                    titleInput.value = '';
                    categoryInput.value = 'Financials';
                    toggleUploadPanel(false);
                }
                refreshLiveData();
            } catch (error) {
                showToast(error.message, 'info');
            } finally {
                if (fileInput) fileInput.value = '';
                window.activeStatutoryForm = null;
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            // Bind Login Form submit
            const loginForm = document.getElementById('login-form');
            if (loginForm) {
                loginForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('login-email').value;
                    
                    if (authMode === 'password') {
                        const password = document.getElementById('login-password').value;
                        try {
                            const data = await api.login(email, password);
                            showToast(`Signed in successfully! Role: ${data.user.role}`);
                            document.getElementById('login-password').value = '';
                            refreshLiveData();
                        } catch (err) {
                            showToast(err.message, 'error');
                        }
                    } else {
                        // OTP Mode
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
                                document.getElementById('login-submit-btn').innerText = 'Verify & Sign In';
                                showToast(`Verification PIN sent: ${data.otp}`, 'info');
                            } catch (err) {
                                showToast(err.message, 'error');
                            }
                        } else {
                            const code = document.getElementById('login-otp-code').value;
                            try {
                                const res = await fetch('/api/auth/verify-otp', {
                                    method: 'POST',
                                    headers: { 'content-type': 'application/json' },
                                    body: JSON.stringify({ email, code })
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.error);
                                
                                showToast(`Signed in successfully! Role: ${data.user.role}`);
                                document.getElementById('login-otp-code').value = '';
                                refreshLiveData();
                            } catch (err) {
                                showToast(err.message, 'error');
                            }
                        }
                    }
                });
            }

            // Bind file input change listener
            const fileInput = document.getElementById('backend-document-upload');
            if (fileInput) {
                fileInput.addEventListener('change', uploadDocument);
            }

            // Bind document upload form submit
            const docForm = document.getElementById('document-upload-form');
            if (docForm) {
                docForm.addEventListener('submit', uploadDocument);
            }

            // Bind Financial Entry form submit
            const finForm = document.getElementById('form-financial-entry');
            if (finForm) {
                finForm.addEventListener('submit', submitFinancialEntry);
            }

            // Bind Schedule Meeting form submit
            const meetForm = document.getElementById('form-schedule-meeting');
            if (meetForm) {
                meetForm.addEventListener('submit', submitScheduleMeeting);
            }

            // Bind Generate Bills form submit
            const genBillsForm = document.getElementById('form-generate-bills');
            if (genBillsForm) {
                genBillsForm.addEventListener('submit', generateMonthlyBillsSubmit);
            }

            // Bind Approve Drafts form submit
            const approveDraftsForm = document.getElementById('form-approve-drafts');
            if (approveDraftsForm) {
                approveDraftsForm.addEventListener('submit', approveDraftsSubmit);
            }

            setTimeout(refreshLiveData, 150);
            setInterval(refreshLiveData, 15000);
        });
    