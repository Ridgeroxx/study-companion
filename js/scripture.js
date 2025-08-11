// Scripture reference parsing and management module
import { storage } from './storage.js';

class Scripture {
    constructor() {
        this.language = 'en';
        this.books = {};
        this.bibleIndex = null;
        this.currentBibleDoc = null;
        this.abbreviationMap = new Map();
        this.canonicalMap = new Map();
    }

    async init() {
        console.log('Initializing scripture module...');
        
        // Load book data for current language
        await this.setLanguage(this.language);
        
        // Load Bible index if available
        await this.loadBibleIndex();
        
        console.log('Scripture module initialized');
    }

    async setLanguage(lang) {
        this.language = lang;
        await this.loadBooks();
        this.buildMaps();
    }

    async loadBooks() {
        try {
            const response = await fetch(`data/books-${this.language}.json`);
            if (response.ok) {
                this.books = await response.json();
            } else {
                console.warn(`Failed to load books for language ${this.language}, falling back to English`);
                const fallbackResponse = await fetch('data/books-en.json');
                this.books = await fallbackResponse.json();
            }
        } catch (error) {
            console.error('Failed to load scripture books:', error);
            // Fallback to minimal book data
            this.books = this.getMinimalBooks();
        }
    }

    getMinimalBooks() {
        // Minimal fallback book data
        return {
            books: {
                'GEN': { name: 'Genesis', chapters: 50 },
                'EXO': { name: 'Exodus', chapters: 40 },
                'MAT': { name: 'Matthew', chapters: 28 },
                'JHN': { name: 'John', chapters: 21 },
                'ROM': { name: 'Romans', chapters: 16 },
                'REV': { name: 'Revelation', chapters: 22 }
            },
            abbreviations: {
                'gen': 'GEN', 'genesis': 'GEN',
                'exo': 'EXO', 'ex': 'EXO', 'exodus': 'EXO',
                'mat': 'MAT', 'mt': 'MAT', 'matthew': 'MAT',
                'jhn': 'JHN', 'jn': 'JHN', 'john': 'JHN',
                'rom': 'ROM', 'ro': 'ROM', 'romans': 'ROM',
                'rev': 'REV', 're': 'REV', 'revelation': 'REV'
            }
        };
    }

    buildMaps() {
        this.abbreviationMap.clear();
        this.canonicalMap.clear();

        if (this.books.abbreviations) {
            for (const [abbrev, canonical] of Object.entries(this.books.abbreviations)) {
                this.abbreviationMap.set(abbrev.toLowerCase(), canonical);
            }
        }

        if (this.books.books) {
            for (const [canonical, info] of Object.entries(this.books.books)) {
                this.canonicalMap.set(canonical, info);
            }
        }
    }

    async loadBibleIndex() {
        try {
            this.bibleIndex = await storage.getBibleIndex();
            
            if (this.bibleIndex) {
                this.currentBibleDoc = await storage.getDocument(this.bibleIndex.documentId);
                console.log('Bible index loaded:', this.bibleIndex.completeness * 100 + '% complete');
            }
        } catch (error) {
            console.error('Failed to load Bible index:', error);
        }
    }

    parseReference(text) {
        if (!text || typeof text !== 'string') return null;

        // Clean up the text
        text = text.trim().replace(/\s+/g, ' ');

        // Try different parsing patterns
        const patterns = [
            // Full format: "1 John 3:16-18"
            /^(\d+\s+)?([a-z]+\.?)\s+(\d+):(\d+)(?:[-–](\d+))?(?:\s*,\s*(\d+))?$/i,
            // Simple format: "John 3:16"
            /^([a-z]+\.?)\s+(\d+):(\d+)(?:[-–](\d+))?(?:\s*,\s*(\d+))?$/i,
            // Chapter only: "John 3"
            /^(\d+\s+)?([a-z]+\.?)\s+(\d+)$/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return this.processMatch(match, text);
            }
        }

        return null;
    }

    processMatch(match, originalText) {
        let bookPart, chapter, startVerse, endVerse, additionalVerse;
        
        if (match.length === 4) {
            // Chapter only format
            bookPart = (match[1] || '') + match[2];
            chapter = parseInt(match[3]);
        } else {
            // Verse format
            bookPart = (match[1] || '') + match[2];
            chapter = parseInt(match[3]);
            startVerse = parseInt(match[4]);
            endVerse = match[5] ? parseInt(match[5]) : startVerse;
            additionalVerse = match[6] ? parseInt(match[6]) : null;
        }

        // Clean book part
        bookPart = bookPart.trim().toLowerCase().replace(/\.$/, '');

        // Find canonical book code
        const canonical = this.abbreviationMap.get(bookPart);
        if (!canonical) return null;

        // Validate chapter
        const bookInfo = this.canonicalMap.get(canonical);
        if (!bookInfo || chapter > bookInfo.chapters) return null;

        return {
            original: originalText,
            canonical: canonical,
            book: bookInfo.name,
            chapter: chapter,
            startVerse: startVerse,
            endVerse: endVerse,
            additionalVerse: additionalVerse,
            formatted: this.formatReference(canonical, chapter, startVerse, endVerse, additionalVerse)
        };
    }

    formatReference(canonical, chapter, startVerse, endVerse, additionalVerse) {
        const bookInfo = this.canonicalMap.get(canonical);
        if (!bookInfo) return '';

        let formatted = `${bookInfo.name} ${chapter}`;
        
        if (startVerse) {
            formatted += `:${startVerse}`;
            
            if (endVerse && endVerse !== startVerse) {
                formatted += `–${endVerse}`;
            }
            
            if (additionalVerse) {
                formatted += `, ${additionalVerse}`;
            }
        }

        return formatted;
    }

    formatCanonical(canonicalId) {
        // Parse canonical ID like "JHN.3.16" or "JHN.3.16-18"
        const parts = canonicalId.split('.');
        if (parts.length < 2) return canonicalId;

        const bookCode = parts[0];
        const chapter = parts[1];
        const verse = parts[2];

        const bookInfo = this.canonicalMap.get(bookCode);
        if (!bookInfo) return canonicalId;

        let formatted = `${bookInfo.name} ${chapter}`;
        
        if (verse) {
            // Handle verse ranges
            if (verse.includes('-')) {
                const [start, end] = verse.split('-');
                formatted += `:${start}–${end}`;
            } else {
                formatted += `:${verse}`;
            }
        }

        return formatted;
    }

    findReferencesInText(text) {
        const references = [];
        const words = text.split(/\s+/);
        
        // Look for potential scripture references
        for (let i = 0; i < words.length - 1; i++) {
            // Try different word combinations
            for (let len = 2; len <= Math.min(4, words.length - i); len++) {
                const phrase = words.slice(i, i + len).join(' ');
                const parsed = this.parseReference(phrase);
                
                if (parsed) {
                    references.push(parsed);
                    i += len - 1; // Skip processed words
                    break;
                }
            }
        }

        return references;
    }

    async previewScripture() {
        const input = document.getElementById('scripture-input');
        const preview = document.getElementById('scripture-preview');
        const text = input.value.trim();

        if (!text) {
            preview.style.display = 'none';
            return;
        }

        const parsed = this.parseReference(text);
        if (!parsed) {
            preview.style.display = 'none';
            return;
        }

        // Show parsed reference
        preview.innerHTML = `
            <div class="scripture-preview">
                <div class="d-flex justify-content-between align-items-center">
                    <strong>${parsed.formatted}</strong>
                    ${this.bibleIndex ? 
                        `<button class="btn btn-sm btn-outline-primary" onclick="scripture.openScripture('${parsed.canonical}.${parsed.chapter}')">
                            <i class="fas fa-external-link-alt"></i> Open
                        </button>` : 
                        '<small class="text-muted">Bible not imported</small>'
                    }
                </div>
                ${this.getScripturePreviewText(parsed)}
            </div>
        `;
        
        preview.style.display = 'block';
    }

    getScripturePreviewText(parsed) {
        // This would fetch actual scripture text if available
        // For now, just show the parsed reference info
        return `<small class="text-muted">Reference parsed successfully</small>`;
    }

    insertScripture() {
        const input = document.getElementById('scripture-input');
        const text = input.value.trim();

        if (!text) return;

        const parsed = this.parseReference(text);
        if (parsed) {
            // Insert into active text area if available
            const activeTextarea = document.querySelector('textarea:focus') || document.getElementById('meeting-content');
            
            if (activeTextarea) {
                const canonical = `${parsed.canonical}.${parsed.chapter}${parsed.startVerse ? '.' + parsed.startVerse : ''}`;
                const markdownLink = `[${parsed.formatted}](scripture://${canonical})`;
                
                const start = activeTextarea.selectionStart;
                const end = activeTextarea.selectionEnd;
                const currentValue = activeTextarea.value;
                
                activeTextarea.value = currentValue.substring(0, start) + markdownLink + currentValue.substring(end);
                
                // Clear input
                input.value = '';
                document.getElementById('scripture-preview').style.display = 'none';
                
                window.app.showSuccess('Scripture reference inserted!');
            } else {
                window.app.showError('No text field is active. Click in a text area first.');
            }
        } else {
            window.app.showError('Could not parse scripture reference. Please check the format.');
        }
    }

    async openScripture(reference) {
        if (!this.bibleIndex) {
            window.app.showError('Bible not imported. Please import a Bible EPUB first.');
            return;
        }

        try {
            // Parse reference if it's a string
            let bookCode, chapter;
            
            if (typeof reference === 'string') {
                if (reference.includes('.')) {
                    const parts = reference.split('.');
                    bookCode = parts[0];
                    chapter = parseInt(parts[1]);
                } else {
                    // Try to parse as full reference
                    const parsed = this.parseReference(reference);
                    if (parsed) {
                        bookCode = parsed.canonical;
                        chapter = parsed.chapter;
                    }
                }
            }

            if (!bookCode || !chapter) {
                throw new Error('Invalid scripture reference');
            }

            // Check if we have this chapter in the index
            if (!this.bibleIndex.map[bookCode] || !this.bibleIndex.map[bookCode][chapter]) {
                window.app.showError('This chapter is not available in the imported Bible.');
                return;
            }

            // Get the CFI or href for this chapter
            const chapterLocation = this.bibleIndex.map[bookCode][chapter];
            
            // If a Bible document is currently open in the reader, navigate to it
            if (reader.currentDocument && reader.currentDocument.id === this.bibleIndex.documentId) {
                await reader.jumpToCfi(chapterLocation);
            } else {
                // Open the Bible document first
                await reader.openDocument(this.bibleIndex.documentId);
                // Then navigate to the chapter
                setTimeout(() => reader.jumpToCfi(chapterLocation), 1000);
            }

            // Switch to the reader view
            window.location.hash = '#notes';

        } catch (error) {
            console.error('Failed to open scripture:', error);
            window.app.showError('Failed to open scripture reference.');
        }
    }

    // Debug function for testing parsing
    debugParse() {
        const input = document.getElementById('debug-scripture-input');
        const output = document.getElementById('debug-output');
        const text = input.value.trim();

        if (!text) {
            output.innerHTML = 'Enter a scripture reference to test parsing.';
            return;
        }

        const parsed = this.parseReference(text);
        
        if (parsed) {
            output.innerHTML = `
                <strong>Parsing successful!</strong><br>
                Original: ${parsed.original}<br>
                Book: ${parsed.book} (${parsed.canonical})<br>
                Chapter: ${parsed.chapter}<br>
                ${parsed.startVerse ? `Verse: ${parsed.startVerse}${parsed.endVerse && parsed.endVerse !== parsed.startVerse ? '–' + parsed.endVerse : ''}` : ''}<br>
                ${parsed.additionalVerse ? `Additional: ${parsed.additionalVerse}` : ''}<br>
                Formatted: ${parsed.formatted}
            `;
        } else {
            output.innerHTML = `
                <strong>Parsing failed.</strong><br>
                Could not parse: "${text}"<br>
                <small>Try formats like: John 3:16, 1 Cor 13:4-7, Psalm 23</small>
            `;
        }
    }
}

// Create and export scripture instance
const scripture = new Scripture();
window.scripture = scripture; // For global access

export { scripture };
