// EPUB reader module using epub.js
import { storage } from './storage.js';
import { notes } from './notes.js';
import { scripture } from './scripture.js';

class Reader {
    constructor() {
        this.book = null;
        this.rendition = null;
        this.currentDocument = null;
        this.currentLocation = null;
        this.highlights = [];
        this.selectionInfo = null;
    }

    async init() {
        console.log('Initializing EPUB reader...');
        
        // Initialize epub.js viewer
        this.setupViewer();
        
        // Load last opened book if exists
        await this.loadLastBook();
        
        console.log('EPUB reader initialized');
    }

    setupViewer() {
        const viewerElement = document.getElementById('viewer');
        
        // Clear viewer
        viewerElement.innerHTML = '';
        
        // Add empty state
        this.showEmptyState();
    }

    showEmptyState() {
        const viewer = document.getElementById('viewer');
        viewer.innerHTML = `
            <div class="d-flex align-items-center justify-content-center h-100 text-muted">
                <div class="text-center">
                    <i class="fas fa-book-open fa-3x mb-3"></i>
                    <h5 data-i18n="no_book_open">No book open</h5>
                    <p data-i18n="import_epub_instruction">Import an EPUB file to start reading and taking notes.</p>
                    <button class="btn btn-primary" onclick="reader.importEpub()">
                        <i class="fas fa-upload"></i> <span data-i18n="import_epub">Import EPUB</span>
                    </button>
                </div>
            </div>
        `;
    }

    async loadLastBook() {
        try {
            const documents = await storage.getDocuments();
            const lastEpub = documents.find(doc => doc.type === 'epub' && doc.lastOpened);
            
            if (lastEpub) {
                await this.openDocument(lastEpub.id);
            }
        } catch (error) {
            console.error('Failed to load last book:', error);
        }
    }

    importEpub() {
        const fileInput = document.getElementById('epub-file-input');
        fileInput.click();
    }

    async handleEpubFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.epub')) {
            window.app.showError('Please select a valid EPUB file.');
            return;
        }

        try {
            // Show loading
            this.showLoadingState('Importing EPUB...');

            // Read file
            const arrayBuffer = await file.arrayBuffer();
            
            // Generate unique file key
            const fileKey = storage.generateId('epub');
            
            // Store file data
            await storage.saveFile(fileKey, arrayBuffer);
            
            // Create document record
            const document = {
                title: file.name.replace('.epub', ''),
                fileKey: fileKey,
                type: 'epub',
                size: file.size,
                fileName: file.name,
                importedAt: new Date().toISOString(),
                lastOpened: new Date().toISOString()
            };
            
            await storage.saveDocument(document);
            
            // Open the document
            await this.openDocument(document.id);
            
            // Show success
            window.app.showSuccess('EPUB imported successfully!');
            
            // Clear file input
            event.target.value = '';
            
        } catch (error) {
            console.error('Failed to import EPUB:', error);
            window.app.showError('Failed to import EPUB. Please try again.');
            this.showEmptyState();
        }
    }

    async openDocument(documentId) {
        try {
            const document = await storage.getDocument(documentId);
            if (!document) {
                throw new Error('Document not found');
            }

            // Show loading
            this.showLoadingState('Opening book...');

            // Get file data
            const arrayBuffer = await storage.getFile(document.fileKey);
            if (!arrayBuffer) {
                throw new Error('Book file not found');
            }

            // Create epub.js book
            this.book = new ePub(arrayBuffer);
            this.currentDocument = document;

            // Update last opened
            document.lastOpened = new Date().toISOString();
            await storage.saveDocument(document);

            // Initialize rendition
            await this.setupRendition();
            
            // Load highlights
            await this.loadHighlights();
            
            // Update UI
            this.updateBookUI();
            notes.setCurrentDocument(document);
            
        } catch (error) {
            console.error('Failed to open document:', error);
            window.app.showError('Failed to open book. The file may be corrupted.');
            this.showEmptyState();
        }
    }

    async setupRendition() {
        const viewer = document.getElementById('viewer');
        viewer.innerHTML = '';
        
        // Create rendition
        this.rendition = this.book.renderTo(viewer, {
            width: '100%',
            height: '100%',
            spread: 'none',
            flow: 'paginated'
        });

        // Display book
        await this.rendition.display();

        // Set up event listeners
        this.setupReaderEvents();
        
        // Apply theme
        this.applyReaderTheme();
    }

    setupReaderEvents() {
        // Selection events for highlighting
        this.rendition.on('selected', (cfiRange, contents) => {
            this.handleTextSelection(cfiRange, contents);
        });

        // Location change events
        this.rendition.on('relocated', (location) => {
            this.currentLocation = location;
            this.updateLocationDisplay();
        });

        // Key events for navigation
        this.rendition.on('keyup', (event) => {
            if (event.key === 'ArrowLeft') {
                this.prevPage();
            } else if (event.key === 'ArrowRight') {
                this.nextPage();
            }
        });

        // Click events for highlights
        this.rendition.on('markClicked', (cfiRange, data, contents) => {
            this.showHighlightPopover(cfiRange, data);
        });
    }

    async handleTextSelection(cfiRange, contents) {
        try {
            // Get selected text
            const selectedText = await this.book.getRange(cfiRange).toString();
            
            if (selectedText.trim().length === 0) return;

            // Store selection info
            this.selectionInfo = {
                cfiRange: cfiRange,
                quote: selectedText.trim(),
                contents: contents
            };

            // Clear previous selection data
            document.getElementById('highlight-quote').textContent = selectedText.trim();
            document.getElementById('highlight-note').value = '';
            document.getElementById('highlight-tags').value = '';
            document.getElementById('delete-highlight-btn').style.display = 'none';

            // Show highlight modal
            const modal = new bootstrap.Modal(document.getElementById('highlightModal'));
            modal.show();

        } catch (error) {
            console.error('Failed to handle text selection:', error);
        }
    }

    async loadHighlights() {
        if (!this.currentDocument) return;

        try {
            const annotations = await storage.getAnnotations(this.currentDocument.id);
            this.highlights = annotations;

            // Apply highlights to rendition
            for (const annotation of annotations) {
                if (annotation.cfiRange) {
                    await this.addHighlightToRendition(annotation.cfiRange, annotation);
                }
            }

        } catch (error) {
            console.error('Failed to load highlights:', error);
        }
    }

    async addHighlightToRendition(cfiRange, annotation) {
        try {
            // Create highlight mark
            this.rendition.annotations.highlight(cfiRange, {
                id: annotation.id
            }, null, 'epub-highlight', {
                'data-annotation-id': annotation.id
            });

        } catch (error) {
            console.error('Failed to add highlight to rendition:', error);
        }
    }

    async removeHighlightFromRendition(annotationId) {
        try {
            // Remove highlight mark
            this.rendition.annotations.remove(annotationId, 'highlight');
        } catch (error) {
            console.error('Failed to remove highlight from rendition:', error);
        }
    }

    showHighlightPopover(cfiRange, data) {
        // Find annotation by ID
        const annotation = this.highlights.find(h => h.id === data.id);
        if (!annotation) return;

        // Populate modal with existing data
        document.getElementById('highlight-quote').textContent = annotation.quote;
        document.getElementById('highlight-note').value = annotation.note || '';
        document.getElementById('highlight-tags').value = (annotation.tags || []).join(', ');
        document.getElementById('delete-highlight-btn').style.display = 'inline-block';

        // Store current annotation info
        this.selectionInfo = {
            id: annotation.id,
            cfiRange: annotation.cfiRange,
            quote: annotation.quote
        };

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('highlightModal'));
        modal.show();
    }

    async jumpToCfi(cfi) {
        if (!this.rendition) return;

        try {
            await this.rendition.display(cfi);
        } catch (error) {
            console.error('Failed to jump to CFI:', error);
            window.app.showError('Failed to navigate to location.');
        }
    }

    nextPage() {
        if (this.rendition) {
            this.rendition.next();
        }
    }

    prevPage() {
        if (this.rendition) {
            this.rendition.prev();
        }
    }

    updateBookUI() {
        if (!this.currentDocument) return;

        // Update header
        document.getElementById('current-book-title-header').textContent = this.currentDocument.title;
        document.getElementById('viewer-header').style.display = 'flex';

        // Update notes panel
        document.getElementById('current-book-title').textContent = this.currentDocument.title;
    }

    updateLocationDisplay() {
        if (!this.currentLocation) return;

        const locationText = this.formatLocation(this.currentLocation);
        document.getElementById('current-location').textContent = locationText;
    }

    formatLocation(location) {
        if (location.start && location.start.displayed) {
            const page = location.start.displayed.page;
            const total = location.start.displayed.total;
            return `Page ${page} of ${total}`;
        }
        return '';
    }

    applyReaderTheme() {
        if (!this.rendition) return;

        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        
        if (isDark) {
            this.rendition.themes.default({
                'body': {
                    'color': '#dee2e6',
                    'background': '#2b3035'
                },
                'p': {
                    'color': '#dee2e6'
                }
            });
        } else {
            this.rendition.themes.default({
                'body': {
                    'color': '#212529',
                    'background': 'white'
                }
            });
        }
    }

    showLoadingState(message = 'Loading...') {
        const viewer = document.getElementById('viewer');
        viewer.innerHTML = `
            <div class="d-flex align-items-center justify-content-center h-100">
                <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-3">${message}</p>
                </div>
            </div>
        `;
    }

    // Bible import functionality
    importBible() {
        const modal = new bootstrap.Modal(document.getElementById('importBibleModal'));
        modal.show();
    }

    async handleBibleFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.epub')) {
            window.app.showError('Please select a valid EPUB file.');
            return;
        }

        // Close modal and show progress
        const modal = bootstrap.Modal.getInstance(document.getElementById('importBibleModal'));
        modal.hide();

        try {
            // Show loading
            this.showBibleImportProgress('Processing Bible EPUB...');

            // Read file
            const arrayBuffer = await file.arrayBuffer();
            
            // Generate unique file key
            const fileKey = storage.generateId('bible');
            
            // Store file data
            await storage.saveFile(fileKey, arrayBuffer);
            
            // Create document record
            const document = {
                title: file.name.replace('.epub', '') + ' (Bible)',
                fileKey: fileKey,
                type: 'bible',
                size: file.size,
                fileName: file.name,
                importedAt: new Date().toISOString()
            };
            
            await storage.saveDocument(document);
            
            // Build Bible index
            await this.buildBibleIndex(document.id, arrayBuffer);
            
            // Show success
            window.app.showSuccess('Bible imported successfully!');
            
            // Update scripture module
            await scripture.loadBibleIndex();
            
            // Clear file input
            event.target.value = '';
            
        } catch (error) {
            console.error('Failed to import Bible:', error);
            window.app.showError('Failed to import Bible. Please try again.');
        }
    }

    async processBibleImport() {
        const fileInput = document.getElementById('bible-file-input');
        if (!fileInput.files[0]) {
            window.app.showError('Please select a Bible EPUB file.');
            return;
        }

        await this.handleBibleFile({ target: fileInput });
    }

    async buildBibleIndex(documentId, arrayBuffer) {
        try {
            this.updateBibleImportProgress('Building scripture index...', 10);

            // Create temporary book for indexing
            const book = new ePub(arrayBuffer);
            await book.ready;

            const index = {
                documentId: documentId,
                map: {},
                completeness: 0
            };

            // Get navigation structure
            const navigation = await book.loaded.navigation;
            const spine = await book.loaded.spine;
            
            let processed = 0;
            const total = spine.items.length;

            // Process each chapter
            for (const item of spine.items) {
                try {
                    const doc = await book.load(item.href);
                    const content = doc.documentElement.textContent || '';
                    
                    // Simple pattern matching for book/chapter detection
                    // This is a basic implementation - would need refinement for production
                    const chapterMatch = content.match(/(?:Chapter|Capítulo)\s+(\d+)/i);
                    if (chapterMatch) {
                        const chapter = parseInt(chapterMatch[1]);
                        
                        // Try to identify book name from title or content
                        const bookMatch = this.identifyBibleBook(item.href, content);
                        if (bookMatch) {
                            if (!index.map[bookMatch.code]) {
                                index.map[bookMatch.code] = {};
                            }
                            index.map[bookMatch.code][chapter] = item.href;
                        }
                    }

                    processed++;
                    const progress = Math.round((processed / total) * 90) + 10;
                    this.updateBibleImportProgress(`Processing chapter ${processed}/${total}...`, progress);

                } catch (error) {
                    console.warn('Failed to process spine item:', item.href, error);
                }
            }

            // Calculate completeness
            const bookCount = Object.keys(index.map).length;
            index.completeness = bookCount > 0 ? Math.min(bookCount / 66, 1) : 0;

            // Save index
            await storage.saveBibleIndex(index);

            this.updateBibleImportProgress('Index completed!', 100);

            console.log('Bible index built:', index);

        } catch (error) {
            console.error('Failed to build Bible index:', error);
            throw error;
        }
    }

    identifyBibleBook(href, content) {
        // Simple book identification logic
        // In production, this would be more sophisticated
        const bibleBooks = {
            'genesis': 'GEN',
            'exodus': 'EXO',
            'matthew': 'MAT',
            'john': 'JHN',
            'romans': 'ROM',
            'revelation': 'REV'
            // Add more mappings as needed
        };

        const hrefLower = href.toLowerCase();
        const contentLower = content.toLowerCase();

        for (const [name, code] of Object.entries(bibleBooks)) {
            if (hrefLower.includes(name) || contentLower.includes(name)) {
                return { name, code };
            }
        }

        return null;
    }

    showBibleImportProgress(message, progress = 0) {
        const progressDiv = document.getElementById('bible-import-progress');
        const progressBar = progressDiv.querySelector('.progress-bar');
        const statusDiv = document.getElementById('bible-import-status');

        progressDiv.style.display = 'block';
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
        statusDiv.textContent = message;
    }

    updateBibleImportProgress(message, progress) {
        this.showBibleImportProgress(message, progress);
    }

    getCurrentDocument() {
        return this.currentDocument;
    }

    getCurrentHighlights() {
        return this.highlights;
    }

    async refreshHighlights() {
        if (this.currentDocument) {
            await this.loadHighlights();
        }
    }
}

// Create and export reader instance
const reader = new Reader();
window.reader = reader; // For global access

export { reader };
