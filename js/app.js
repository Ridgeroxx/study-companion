// Main application module
import { storage } from './storage.js';
import { reader } from './reader.js';
import { notes } from './notes.js';
import { scripture } from './scripture.js';
import { search } from './search.js';
import { schedule } from './schedule.js';
import { exporter } from './exporter.js';

class App {
    constructor() {
        this.currentLanguage = 'en';
        this.currentTheme = 'light';
        this.isFirstRun = false;
        this.onboardingStep = 0;
        this.translations = {};
        this.currentRoute = '#notes';
    }

    async init() {
        console.log('Initializing Study Companion...');
        
        try {
            // Initialize storage first
            await storage.init();
            
            // Load settings
            const settings = await storage.getSettings();
            this.currentLanguage = settings.lang || 'en';
            this.currentTheme = settings.theme || 'light';
            this.isFirstRun = !settings.setupComplete;
            
            // Apply theme immediately
            this.applyTheme();
            
            // Load translations
            await this.loadTranslations();
            
            // Initialize modules
            await Promise.all([
                reader.init(),
                notes.init(),
                scripture.init(),
                search.init(),
                schedule.init(),
                exporter.init()
            ]);
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Handle routing
            this.handleRoute();
            
            // Update UI
            this.updateLanguageUI();
            this.updateThemeUI();
            
            // Hide loading screen with multiple methods
            setTimeout(() => {
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen) {
                    console.log('Hiding loading screen...');
                    loadingScreen.style.display = 'none';
                    loadingScreen.style.visibility = 'hidden';
                    loadingScreen.style.opacity = '0';
                    loadingScreen.classList.add('d-none');
                    setTimeout(() => loadingScreen.remove(), 100);
                    console.log('Loading screen hidden and removed');
                } else {
                    console.warn('Loading screen element not found');
                }
                
                // Also ensure main content is visible
                document.body.style.overflow = 'auto';
            }, 100);
            
            // Show onboarding if first run
            if (this.isFirstRun) {
                this.showOnboarding();
            }
            
            console.log('Study Companion initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to initialize application. Please refresh the page.');
        }
    }

    async loadTranslations() {
        // Simple embedded translations for EN and ES
        this.translations = {
            en: {
                app_name: 'Study Companion',
                loading: 'Loading...',
                import: 'Import',
                import_epub: 'Import EPUB',
                import_bible: 'Import Bible',
                import_data: 'Import Data',
                settings: 'Settings',
                notes: 'Notes',
                meetings: 'Meetings',
                convention: 'Convention',
                search: 'Search',
                current_book_notes: 'Current Book Notes',
                no_book_selected: 'No book selected. Import an EPUB to get started.',
                upcoming_meetings: 'Upcoming Meetings',
                configure_meetings: 'Configure your meeting schedule in Settings.',
                convention_sessions: 'Convention Sessions',
                enable_convention: 'Enable Convention Mode in Settings.',
                search_placeholder: 'Search notes, highlights, scriptures...',
                scriptures: 'Scriptures',
                publications: 'Publications',
                search_empty: 'Enter a search term to find notes, highlights, and scriptures.',
                no_book_open: 'No book open',
                import_epub_instruction: 'Import an EPUB file to start reading and taking notes.',
                scripture_placeholder: 'Type scripture reference (e.g., John 3:16)',
                insert: 'Insert',
                add_note: 'Add Note',
                selected_text: 'Selected Text:',
                note: 'Note:',
                tags: 'Tags:',
                tags_placeholder: 'comma, separated, tags',
                cancel: 'Cancel',
                delete: 'Delete',
                save: 'Save',
                meeting_note: 'Meeting Note',
                title: 'Title:',
                date: 'Date:',
                type: 'Type:',
                midweek: 'Midweek',
                weekend: 'Weekend',
                content: 'Content:',
                edit: 'Edit',
                preview: 'Preview',
                convention_session: 'Convention Session',
                speaker: 'Speaker:',
                theme: 'Theme:',
                time: 'Time:',
                bible_import_notice: 'Import your personal Bible EPUB. This will be used for scripture lookups and navigation.',
                export_import: 'Export / Import',
                export: 'Export',
                export_options: 'Export Options',
                highlights: 'Highlights',
                meeting_notes: 'Meeting Notes',
                convention_notes: 'Convention Notes',
                export_format: 'Export Format',
                import_warning: 'Importing data will merge with existing data. Duplicates will be handled by timestamp.',
                select_file: 'Select JSON file:',
                general: 'General',
                language: 'Language',
                theme: 'Theme',
                light: 'Light',
                dark: 'Dark',
                enable_pwa: 'Enable offline mode (PWA)',
                midweek_meetings: 'Midweek Meetings',
                add_midweek: 'Add Midweek Meeting',
                weekend_meetings: 'Weekend Meetings',
                add_weekend: 'Add Weekend Meeting',
                enable_convention_mode: 'Enable Convention Mode',
                start_date: 'Start Date:',
                end_date: 'End Date:',
                welcome: 'Welcome to Study Companion',
                choose_language: 'Choose Your Language',
                language_description: 'Select your preferred language for the interface and scripture parsing.',
                configure_meetings: 'Configure Your Meeting Schedule',
                meeting_description: 'Set up your congregation\'s meeting times. You can add multiple meetings for each type.',
                convention_setup: 'Convention Setup (Optional)',
                convention_description: 'Enable convention mode to plan and take notes for upcoming conventions.',
                previous: 'Previous',
                next: 'Next',
                finish: 'Finish',
                monday: 'Monday',
                tuesday: 'Tuesday',
                wednesday: 'Wednesday',
                thursday: 'Thursday',
                friday: 'Friday',
                saturday: 'Saturday',
                sunday: 'Sunday'
            },
            es: {
                app_name: 'Compañero de Estudio',
                loading: 'Cargando...',
                import: 'Importar',
                import_epub: 'Importar EPUB',
                import_bible: 'Importar Biblia',
                import_data: 'Importar Datos',
                settings: 'Configuración',
                notes: 'Notas',
                meetings: 'Reuniones',
                convention: 'Asamblea',
                search: 'Buscar',
                current_book_notes: 'Notas del Libro Actual',
                no_book_selected: 'Ningún libro seleccionado. Importa un EPUB para comenzar.',
                upcoming_meetings: 'Próximas Reuniones',
                configure_meetings: 'Configura tu horario de reuniones en Configuración.',
                convention_sessions: 'Sesiones de Asamblea',
                enable_convention: 'Habilita el Modo Asamblea en Configuración.',
                search_placeholder: 'Buscar notas, destacados, escrituras...',
                scriptures: 'Escrituras',
                publications: 'Publicaciones',
                search_empty: 'Ingresa un término de búsqueda para encontrar notas, destacados y escrituras.',
                no_book_open: 'Ningún libro abierto',
                import_epub_instruction: 'Importa un archivo EPUB para comenzar a leer y tomar notas.',
                scripture_placeholder: 'Escribe referencia bíblica (ej., Juan 3:16)',
                insert: 'Insertar',
                add_note: 'Agregar Nota',
                selected_text: 'Texto Seleccionado:',
                note: 'Nota:',
                tags: 'Etiquetas:',
                tags_placeholder: 'etiquetas, separadas, por, comas',
                cancel: 'Cancelar',
                delete: 'Eliminar',
                save: 'Guardar',
                meeting_note: 'Nota de Reunión',
                title: 'Título:',
                date: 'Fecha:',
                type: 'Tipo:',
                midweek: 'Entre Semana',
                weekend: 'Fin de Semana',
                content: 'Contenido:',
                edit: 'Editar',
                preview: 'Vista Previa',
                convention_session: 'Sesión de Asamblea',
                speaker: 'Orador:',
                theme: 'Tema:',
                time: 'Hora:',
                bible_import_notice: 'Importa tu EPUB personal de la Biblia. Se usará para búsquedas y navegación de escrituras.',
                export_import: 'Exportar / Importar',
                export: 'Exportar',
                export_options: 'Opciones de Exportación',
                highlights: 'Destacados',
                meeting_notes: 'Notas de Reunión',
                convention_notes: 'Notas de Asamblea',
                export_format: 'Formato de Exportación',
                import_warning: 'Importar datos se combinará con los datos existentes. Los duplicados se manejarán por marca de tiempo.',
                select_file: 'Seleccionar archivo JSON:',
                general: 'General',
                language: 'Idioma',
                theme: 'Tema',
                light: 'Claro',
                dark: 'Oscuro',
                enable_pwa: 'Habilitar modo sin conexión (PWA)',
                midweek_meetings: 'Reuniones Entre Semana',
                add_midweek: 'Agregar Reunión Entre Semana',
                weekend_meetings: 'Reuniones de Fin de Semana',
                add_weekend: 'Agregar Reunión de Fin de Semana',
                enable_convention_mode: 'Habilitar Modo Asamblea',
                start_date: 'Fecha de Inicio:',
                end_date: 'Fecha de Fin:',
                welcome: 'Bienvenido a Compañero de Estudio',
                choose_language: 'Elige Tu Idioma',
                language_description: 'Selecciona tu idioma preferido para la interfaz y análisis de escrituras.',
                configure_meetings: 'Configura Tu Horario de Reuniones',
                meeting_description: 'Configura los horarios de reunión de tu congregación. Puedes agregar múltiples reuniones para cada tipo.',
                convention_setup: 'Configuración de Asamblea (Opcional)',
                convention_description: 'Habilita el modo asamblea para planificar y tomar notas para próximas asambleas.',
                previous: 'Anterior',
                next: 'Siguiente',
                finish: 'Finalizar',
                monday: 'Lunes',
                tuesday: 'Martes',
                wednesday: 'Miércoles',
                thursday: 'Jueves',
                friday: 'Viernes',
                saturday: 'Sábado',
                sunday: 'Domingo'
            }
        };
    }

    translate(key, fallback = key) {
        return this.translations[this.currentLanguage]?.[key] || this.translations['en']?.[key] || fallback;
    }

    updateLanguageUI() {
        // Update current language indicator
        document.getElementById('current-language').textContent = this.currentLanguage.toUpperCase();
        
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = this.translate(key);
        });
        
        // Update placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.translate(key);
        });
        
        // Update select options
        document.querySelectorAll('option[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = this.translate(key);
        });
    }

    async setLanguage(lang) {
        if (lang === this.currentLanguage) return;
        
        this.currentLanguage = lang;
        this.updateLanguageUI();
        
        // Reinitialize scripture module for new language
        await scripture.setLanguage(lang);
        
        // Update UI
        notes.refreshDisplay();
        schedule.refreshDisplay();
        
        // Save to settings
        const settings = await storage.getSettings();
        settings.lang = lang;
        await storage.saveSettings(settings);
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme();
        this.updateThemeUI();
        
        // Save to settings
        storage.getSettings().then(settings => {
            settings.theme = this.currentTheme;
            storage.saveSettings(settings);
        });
    }

    applyTheme() {
        document.documentElement.setAttribute('data-bs-theme', this.currentTheme);
    }

    updateThemeUI() {
        const themeToggle = document.getElementById('theme-toggle');
        const icon = themeToggle.querySelector('i');
        
        if (this.currentTheme === 'dark') {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    }

    setupEventListeners() {
        // Hash change for routing
        window.addEventListener('hashchange', () => this.handleRoute());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        if (document.querySelector('.modal.show')) {
                            // Save current modal content
                            const activeModal = document.querySelector('.modal.show');
                            if (activeModal.id === 'highlightModal') {
                                notes.saveHighlight();
                            } else if (activeModal.id === 'meetingNoteModal') {
                                notes.saveMeetingNote();
                            }
                        }
                        break;
                    case 'f':
                        e.preventDefault();
                        document.getElementById('search-input').focus();
                        document.getElementById('search-tab').click();
                        break;
                    case 'o':
                        e.preventDefault();
                        reader.importEpub();
                        break;
                }
            }
            
            // Escape key to close modals
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.modal.show');
                if (activeModal) {
                    const modal = bootstrap.Modal.getInstance(activeModal);
                    modal?.hide();
                }
            }
        });
        
        // Search input
        const searchInput = document.getElementById('search-input');
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                search.performSearch();
            }, 300);
        });
        
        // Enter key for search
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                search.performSearch();
            }
        });
        
        // Scripture input
        const scriptureInput = document.getElementById('scripture-input');
        let scriptureTimeout;
        scriptureInput.addEventListener('input', () => {
            clearTimeout(scriptureTimeout);
            scriptureTimeout = setTimeout(() => {
                scripture.previewScripture();
            }, 300);
        });
        
        // Enter key for scripture insert
        scriptureInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                scripture.insertScripture();
            }
        });
        
        // Language selection in onboarding
        document.querySelectorAll('.lang-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.lang-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                const lang = option.getAttribute('data-lang');
                this.setLanguage(lang);
            });
        });
        
        // Convention mode toggle in onboarding
        document.getElementById('onboarding-convention-enabled').addEventListener('change', (e) => {
            const config = document.getElementById('onboarding-convention-config');
            config.style.display = e.target.checked ? 'block' : 'none';
        });
        
        // Convention mode toggle in settings
        document.getElementById('convention-enabled').addEventListener('change', (e) => {
            const config = document.getElementById('convention-config');
            config.style.display = e.target.checked ? 'block' : 'none';
        });
        
        // File input changes
        document.getElementById('epub-file-input').addEventListener('change', reader.handleEpubFile.bind(reader));
        document.getElementById('bible-file-input').addEventListener('change', reader.handleBibleFile.bind(reader));
    }

    handleRoute() {
        const hash = window.location.hash || '#notes';
        this.currentRoute = hash;
        
        // Activate correct tab
        const tabId = hash.replace('#', '') + '-tab';
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.click();
        }
    }

    showOnboarding() {
        const modal = new bootstrap.Modal(document.getElementById('onboardingModal'));
        modal.show();
        this.onboardingStep = 0;
        this.updateOnboardingStep();
    }

    updateOnboardingStep() {
        const tabs = document.querySelectorAll('#onboarding-tabs .nav-link');
        const prevBtn = document.getElementById('onboarding-prev');
        const nextBtn = document.getElementById('onboarding-next');
        const finishBtn = document.getElementById('onboarding-finish');
        
        // Update tab states
        tabs.forEach((tab, index) => {
            if (index < this.onboardingStep) {
                tab.classList.add('completed');
            } else if (index === this.onboardingStep) {
                tab.click();
            }
        });
        
        // Update button states
        prevBtn.style.display = this.onboardingStep > 0 ? 'inline-block' : 'none';
        nextBtn.style.display = this.onboardingStep < 2 ? 'inline-block' : 'none';
        finishBtn.style.display = this.onboardingStep === 2 ? 'inline-block' : 'none';
    }

    onboardingNext() {
        if (this.onboardingStep < 2) {
            this.onboardingStep++;
            this.updateOnboardingStep();
        }
    }

    onboardingPrev() {
        if (this.onboardingStep > 0) {
            this.onboardingStep--;
            this.updateOnboardingStep();
        }
    }

    async finishOnboarding() {
        try {
            // Collect onboarding data
            const settings = await storage.getSettings();
            
            // Language is already set
            
            // Meeting schedule
            settings.meetingSchedule = {
                midweek: schedule.getOnboardingMeetings('midweek'),
                weekend: schedule.getOnboardingMeetings('weekend')
            };
            
            // Convention settings
            const conventionEnabled = document.getElementById('onboarding-convention-enabled').checked;
            if (conventionEnabled) {
                settings.convention = {
                    enabled: true,
                    startISO: document.getElementById('onboarding-convention-start').value,
                    endISO: document.getElementById('onboarding-convention-end').value,
                    sessions: []
                };
            }
            
            // Mark setup as complete
            settings.setupComplete = true;
            
            // Save settings
            await storage.saveSettings(settings);
            
            // Hide modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('onboardingModal'));
            modal.hide();
            
            // Initialize schedule with new settings
            await schedule.init();
            
            this.showSuccess('Setup completed successfully!');
            
        } catch (error) {
            console.error('Failed to finish onboarding:', error);
            this.showError('Failed to save settings. Please try again.');
        }
    }

    async saveSettings() {
        try {
            const settings = await storage.getSettings();
            
            // General settings
            const newLang = document.getElementById('settings-language').value;
            const newTheme = document.getElementById('settings-theme').value;
            const pwaDn = document.getElementById('settings-pwa').checked;
            
            settings.lang = newLang;
            settings.theme = newTheme;
            settings.pwaEnabled = pwaEnabled;
            
            // Meeting schedule
            settings.meetingSchedule = {
                midweek: schedule.getSettingsMeetings('midweek'),
                weekend: schedule.getSettingsMeetings('weekend')
            };
            
            // Convention settings
            const conventionEnabled = document.getElementById('convention-enabled').checked;
            settings.convention = settings.convention || {};
            settings.convention.enabled = conventionEnabled;
            
            if (conventionEnabled) {
                settings.convention.startISO = document.getElementById('convention-start').value;
                settings.convention.endISO = document.getElementById('convention-end').value;
            }
            
            // Save settings
            await storage.saveSettings(settings);
            
            // Apply changes
            if (newLang !== this.currentLanguage) {
                await this.setLanguage(newLang);
            }
            
            if (newTheme !== this.currentTheme) {
                this.currentTheme = newTheme;
                this.applyTheme();
                this.updateThemeUI();
            }
            
            // Reinitialize schedule
            await schedule.init();
            
            // Hide modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
            modal.hide();
            
            this.showSuccess('Settings saved successfully!');
            
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showError('Failed to save settings. Please try again.');
        }
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        // Create toast element
        const toastContainer = document.getElementById('toast-container') || this.createToastContainer();
        
        const toastId = 'toast-' + Date.now();
        const toastEl = document.createElement('div');
        toastEl.id = toastId;
        toastEl.className = `toast align-items-center text-white border-0`;
        
        if (type === 'success') {
            toastEl.classList.add('bg-success');
        } else if (type === 'error') {
            toastEl.classList.add('bg-danger');
        } else {
            toastEl.classList.add('bg-primary');
        }
        
        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;
        
        toastContainer.appendChild(toastEl);
        
        const toast = new bootstrap.Toast(toastEl, {
            autohide: true,
            delay: type === 'error' ? 5000 : 3000
        });
        
        toast.show();
        
        // Clean up after hide
        toastEl.addEventListener('hidden.bs.toast', () => {
            toastEl.remove();
        });
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '1055';
        document.body.appendChild(container);
        return container;
    }
}

// Create global app instance
const app = new App();

// Make app available globally for onclick handlers
window.app = app;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

export { app };
