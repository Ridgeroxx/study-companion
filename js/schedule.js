// Meeting scheduling and convention management module
import { storage } from './storage.js';
import { notes } from './notes.js';

class Schedule {
    constructor() {
        this.settings = null;
        this.upcomingMeetings = [];
        this.conventionSessions = [];
        this.currentSession = null;
        this.dayNames = [];
    }

    async init() {
        console.log('Initializing schedule module...');
        
        // Load settings
        await this.loadSettings();
        
        // Initialize day names based on language
        this.initializeDayNames();
        
        // Generate upcoming meetings
        this.generateUpcomingMeetings();
        
        // Load convention sessions
        this.loadConventionSessions();
        
        // Update displays
        this.refreshDisplay();
        
        console.log('Schedule module initialized');
    }

    initializeDayNames() {
        // This should be updated when language changes
        const lang = window.app?.currentLanguage || 'en';
        
        if (lang === 'es') {
            this.dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        } else {
            this.dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        }
    }

    async loadSettings() {
        this.settings = await storage.getSettings();
    }

    generateUpcomingMeetings() {
        this.upcomingMeetings = [];
        
        if (!this.settings?.meetingSchedule) return;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Generate meetings for the next 4 weeks
        for (let week = 0; week < 4; week++) {
            // Midweek meetings
            for (const meeting of (this.settings.meetingSchedule.midweek || [])) {
                const meetingDate = this.getNextMeetingDate(today, meeting.dow, week);
                this.upcomingMeetings.push({
                    id: `midweek_${meetingDate.toISOString().split('T')[0]}_${meeting.dow}_${meeting.time}`,
                    type: 'Midweek',
                    date: meetingDate,
                    time: meeting.time,
                    dayOfWeek: meeting.dow,
                    title: window.app?.translate('midweek') || 'Midweek Meeting'
                });
            }
            
            // Weekend meetings
            for (const meeting of (this.settings.meetingSchedule.weekend || [])) {
                const meetingDate = this.getNextMeetingDate(today, meeting.dow, week);
                this.upcomingMeetings.push({
                    id: `weekend_${meetingDate.toISOString().split('T')[0]}_${meeting.dow}_${meeting.time}`,
                    type: 'Weekend',
                    date: meetingDate,
                    time: meeting.time,
                    dayOfWeek: meeting.dow,
                    title: window.app?.translate('weekend') || 'Weekend Meeting'
                });
            }
        }
        
        // Sort by date
        this.upcomingMeetings.sort((a, b) => a.date - b.date);
    }

    getNextMeetingDate(startDate, dayOfWeek, weekOffset = 0) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + (weekOffset * 7));
        
        // Find the next occurrence of the specified day of week
        const dayDiff = dayOfWeek - date.getDay();
        const daysToAdd = dayDiff >= 0 ? dayDiff : dayDiff + 7;
        
        date.setDate(date.getDate() + daysToAdd);
        return date;
    }

    loadConventionSessions() {
        this.conventionSessions = [];
        
        if (!this.settings?.convention?.enabled || !this.settings.convention.sessions) return;

        this.conventionSessions = [...this.settings.convention.sessions];
        
        // Sort by date and time
        this.conventionSessions.sort((a, b) => {
            const dateA = new Date(`${a.dateISO} ${a.startTime || '00:00'}`);
            const dateB = new Date(`${b.dateISO} ${b.startTime || '00:00'}`);
            return dateA - dateB;
        });
    }

    refreshDisplay() {
        this.updateUpcomingMeetingsDisplay();
        this.updateConventionDisplay();
        this.updateSettingsDisplay();
    }

    updateUpcomingMeetingsDisplay() {
        const container = document.getElementById('upcoming-meetings');
        
        if (this.upcomingMeetings.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-calendar-plus fa-2x mb-2"></i>
                    <p data-i18n="configure_meetings">Configure your meeting schedule in Settings.</p>
                </div>
            `;
            return;
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        container.innerHTML = this.upcomingMeetings.map(meeting => {
            const isToday = meeting.date.getTime() === today.getTime();
            const isPast = meeting.date < today;
            const classes = isToday ? 'meeting-item today' : 'meeting-item upcoming';
            
            if (isPast) return ''; // Don't show past meetings
            
            return `
                <div class="${classes}">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">${meeting.title}</h6>
                        <small class="text-muted">${meeting.time}</small>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <small>${this.dayNames[meeting.dayOfWeek]}</small>
                            <br>
                            <small class="text-muted">${meeting.date.toLocaleDateString()}</small>
                        </div>
                        <button class="btn btn-sm btn-primary" 
                                onclick="schedule.openMeetingNote('${meeting.type}', '${meeting.date.toISOString().split('T')[0]}')">
                            <i class="fas fa-edit"></i> ${window.app?.translate('note') || 'Note'}
                        </button>
                    </div>
                </div>
            `;
        }).filter(html => html).join('');
    }

    updateConventionDisplay() {
        const container = document.getElementById('convention-sessions');
        const addBtn = document.getElementById('add-session-btn');
        
        if (!this.settings?.convention?.enabled) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-users fa-2x mb-2"></i>
                    <p data-i18n="enable_convention">Enable Convention Mode in Settings.</p>
                </div>
            `;
            addBtn.style.display = 'none';
            return;
        }

        addBtn.style.display = 'inline-block';

        if (this.conventionSessions.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-calendar-plus fa-2x mb-2"></i>
                    <p>No convention sessions yet. Click the + button to add sessions.</p>
                </div>
            `;
            return;
        }

        // Group sessions by date
        const sessionsByDate = this.conventionSessions.reduce((acc, session) => {
            if (!acc[session.dateISO]) acc[session.dateISO] = [];
            acc[session.dateISO].push(session);
            return acc;
        }, {});

        let html = '';
        for (const [dateISO, sessions] of Object.entries(sessionsByDate)) {
            const date = new Date(dateISO);
            html += `
                <div class="mb-3">
                    <h6 class="text-primary mb-2">${date.toLocaleDateString()}</h6>
                    ${sessions.map(session => this.renderConventionSession(session)).join('')}
                </div>
            `;
        }

        container.innerHTML = html;
    }

    renderConventionSession(session) {
        return `
            <div class="session-item">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="mb-1">${this.escapeHtml(session.title || 'Untitled Session')}</h6>
                        ${session.speaker ? `<small class="text-muted">${this.escapeHtml(session.speaker)}</small>` : ''}
                    </div>
                    <small class="text-muted">${session.startTime || ''}</small>
                </div>
                
                ${session.theme ? `
                    <div class="mb-2">
                        <small><strong>Theme:</strong> ${this.escapeHtml(session.theme)}</small>
                    </div>
                ` : ''}
                
                <div class="d-flex justify-content-between align-items-center">
                    <div></div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" 
                                onclick="schedule.openConventionNote('${session.id}', '${session.dateISO}')">
                            <i class="fas fa-edit"></i> ${window.app?.translate('note') || 'Note'}
                        </button>
                        <button class="btn btn-outline-secondary" 
                                onclick="schedule.editConventionSession('${session.id}')">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button class="btn btn-outline-danger" 
                                onclick="schedule.deleteConventionSessionConfirm('${session.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    updateSettingsDisplay() {
        this.updateMeetingScheduleSettings();
        this.updateConventionSettings();
        this.updateOnboardingMeetings();
    }

    updateMeetingScheduleSettings() {
        this.renderMeetingSchedule('midweek-schedule', this.settings?.meetingSchedule?.midweek || []);
        this.renderMeetingSchedule('weekend-schedule', this.settings?.meetingSchedule?.weekend || []);
    }

    renderMeetingSchedule(containerId, meetings) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (meetings.length === 0) {
            container.innerHTML = `
                <p class="text-muted">No meetings scheduled</p>
            `;
            return;
        }

        container.innerHTML = meetings.map((meeting, index) => `
            <div class="meeting-schedule-item">
                <div class="row">
                    <div class="col-md-6">
                        <select class="form-select form-select-sm" 
                                onchange="schedule.updateMeetingDay('${containerId}', ${index}, this.value)">
                            ${this.dayNames.map((day, dow) => `
                                <option value="${dow}" ${meeting.dow === dow ? 'selected' : ''}>${day}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="col-md-4">
                        <input type="time" class="form-control form-control-sm" 
                               value="${meeting.time || ''}"
                               onchange="schedule.updateMeetingTime('${containerId}', ${index}, this.value)">
                    </div>
                    <div class="col-md-2">
                        <button class="btn btn-outline-danger btn-sm w-100" 
                                onclick="schedule.removeMeetingTime('${containerId}', ${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateConventionSettings() {
        if (this.settings?.convention) {
            document.getElementById('convention-enabled').checked = this.settings.convention.enabled || false;
            document.getElementById('convention-start').value = this.settings.convention.startISO || '';
            document.getElementById('convention-end').value = this.settings.convention.endISO || '';
            
            const configDiv = document.getElementById('convention-config');
            configDiv.style.display = this.settings.convention.enabled ? 'block' : 'none';
        }
    }

    updateOnboardingMeetings() {
        this.renderOnboardingMeetings('onboarding-midweek', this.settings?.meetingSchedule?.midweek || []);
        this.renderOnboardingMeetings('onboarding-weekend', this.settings?.meetingSchedule?.weekend || []);
    }

    renderOnboardingMeetings(containerId, meetings) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (meetings.length === 0) {
            container.innerHTML = `
                <p class="text-muted">No meetings added yet</p>
            `;
            return;
        }

        container.innerHTML = meetings.map((meeting, index) => `
            <div class="meeting-schedule-item">
                <div class="row align-items-center">
                    <div class="col-6">
                        <span>${this.dayNames[meeting.dow]}</span>
                    </div>
                    <div class="col-4">
                        <span>${meeting.time}</span>
                    </div>
                    <div class="col-2">
                        <button class="btn btn-outline-danger btn-sm" 
                                onclick="schedule.removeOnboardingMeeting('${containerId}', ${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Meeting time management
    addMeetingTime(type) {
        const dow = parseInt(prompt('Day of week (0=Sunday, 6=Saturday):') || '1');
        const time = prompt('Time (HH:MM):') || '19:00';
        
        if (dow < 0 || dow > 6 || !time) return;

        if (!this.settings.meetingSchedule) this.settings.meetingSchedule = {};
        if (!this.settings.meetingSchedule[type]) this.settings.meetingSchedule[type] = [];
        
        this.settings.meetingSchedule[type].push({ dow, time });
        this.updateMeetingScheduleSettings();
    }

    addOnboardingMeeting(type) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Add ${type} Meeting</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">Day:</label>
                            <select class="form-control" id="onboarding-day">
                                ${this.dayNames.map((day, dow) => `
                                    <option value="${dow}">${day}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Time:</label>
                            <input type="time" class="form-control" id="onboarding-time" value="19:00">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="schedule.saveOnboardingMeeting('${type}', this)">Add</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        // Clean up on hide
        modal.addEventListener('hidden.bs.modal', () => modal.remove());
    }

    saveOnboardingMeeting(type, button) {
        const dow = parseInt(document.getElementById('onboarding-day').value);
        const time = document.getElementById('onboarding-time').value;
        
        if (!this.settings.meetingSchedule) this.settings.meetingSchedule = {};
        if (!this.settings.meetingSchedule[type]) this.settings.meetingSchedule[type] = [];
        
        this.settings.meetingSchedule[type].push({ dow, time });
        
        // Close modal
        const modal = button.closest('.modal');
        const bsModal = bootstrap.Modal.getInstance(modal);
        bsModal.hide();
        
        this.updateOnboardingMeetings();
    }

    updateMeetingDay(containerId, index, dow) {
        const type = containerId.includes('midweek') ? 'midweek' : 'weekend';
        if (this.settings.meetingSchedule[type][index]) {
            this.settings.meetingSchedule[type][index].dow = parseInt(dow);
        }
    }

    updateMeetingTime(containerId, index, time) {
        const type = containerId.includes('midweek') ? 'midweek' : 'weekend';
        if (this.settings.meetingSchedule[type][index]) {
            this.settings.meetingSchedule[type][index].time = time;
        }
    }

    removeMeetingTime(containerId, index) {
        const type = containerId.includes('midweek') ? 'midweek' : 'weekend';
        this.settings.meetingSchedule[type].splice(index, 1);
        this.updateMeetingScheduleSettings();
    }

    removeOnboardingMeeting(containerId, index) {
        const type = containerId.includes('midweek') ? 'midweek' : 'weekend';
        this.settings.meetingSchedule[type].splice(index, 1);
        this.updateOnboardingMeetings();
    }

    getSettingsMeetings(type) {
        return this.settings?.meetingSchedule?.[type] || [];
    }

    getOnboardingMeetings(type) {
        return this.settings?.meetingSchedule?.[type] || [];
    }

    // Meeting note management
    async openMeetingNote(meetingType, dateISO) {
        await notes.openMeetingNote(meetingType, dateISO);
    }

    async openConventionNote(sessionId, dateISO) {
        await notes.openMeetingNote('Convention', dateISO, sessionId);
    }

    // Convention session management
    addConventionSession() {
        this.currentSession = null;
        this.populateConventionSessionModal({});
        
        const modal = new bootstrap.Modal(document.getElementById('conventionSessionModal'));
        modal.show();
    }

    editConventionSession(sessionId) {
        const session = this.conventionSessions.find(s => s.id === sessionId);
        if (!session) return;

        this.currentSession = session;
        this.populateConventionSessionModal(session);
        
        const modal = new bootstrap.Modal(document.getElementById('conventionSessionModal'));
        modal.show();
    }

    populateConventionSessionModal(session) {
        document.getElementById('session-title').value = session.title || '';
        document.getElementById('session-speaker').value = session.speaker || '';
        document.getElementById('session-theme').value = session.theme || '';
        document.getElementById('session-date').value = session.dateISO || '';
        document.getElementById('session-time').value = session.startTime || '';

        const deleteBtn = document.getElementById('delete-session-btn');
        deleteBtn.style.display = session.id ? 'inline-block' : 'none';
    }

    async saveConventionSession() {
        try {
            const title = document.getElementById('session-title').value.trim();
            const speaker = document.getElementById('session-speaker').value.trim();
            const theme = document.getElementById('session-theme').value.trim();
            const dateISO = document.getElementById('session-date').value;
            const startTime = document.getElementById('session-time').value;
            
            if (!title || !dateISO) {
                window.app.showError('Title and date are required.');
                return;
            }

            const session = {
                ...(this.currentSession || {}),
                id: this.currentSession?.id || storage.generateId('session'),
                title,
                speaker,
                theme,
                dateISO,
                startTime
            };

            // Update settings
            if (!this.settings.convention.sessions) {
                this.settings.convention.sessions = [];
            }

            const existingIndex = this.settings.convention.sessions.findIndex(s => s.id === session.id);
            if (existingIndex >= 0) {
                this.settings.convention.sessions[existingIndex] = session;
            } else {
                this.settings.convention.sessions.push(session);
            }

            await storage.saveSettings(this.settings);

            // Reload and refresh
            this.loadConventionSessions();
            this.updateConventionDisplay();

            // Hide modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('conventionSessionModal'));
            modal.hide();

            window.app.showSuccess('Convention session saved!');

        } catch (error) {
            console.error('Failed to save convention session:', error);
            window.app.showError('Failed to save session. Please try again.');
        }
    }

    async deleteConventionSession() {
        if (!this.currentSession?.id) return;

        try {
            // Remove from settings
            this.settings.convention.sessions = this.settings.convention.sessions.filter(
                s => s.id !== this.currentSession.id
            );

            await storage.saveSettings(this.settings);

            // Reload and refresh
            this.loadConventionSessions();
            this.updateConventionDisplay();

            // Hide modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('conventionSessionModal'));
            modal.hide();

            window.app.showSuccess('Convention session deleted!');

        } catch (error) {
            console.error('Failed to delete convention session:', error);
            window.app.showError('Failed to delete session. Please try again.');
        }
    }

    deleteConventionSessionConfirm(sessionId) {
        if (!confirm('Are you sure you want to delete this convention session?')) return;
        
        this.currentSession = this.conventionSessions.find(s => s.id === sessionId);
        this.deleteConventionSession();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create and export schedule instance
const schedule = new Schedule();
window.schedule = schedule; // For global access

export { schedule };
