// Search module using lunr.js
import { storage } from './storage.js';
import { notes } from './notes.js';
import { reader } from './reader.js';
import { scripture } from './scripture.js';

class Search {
    constructor() {
        this.index = null;
        this.documents = [];
        this.lastQuery = '';
        this.lastResults = null;
        this.indexBuilt = false;
    }

    async init() {
        console.log('Initializing search module...');
        
        // Load cached index if available
        await this.loadCachedIndex();
        
        // Build index if not available or outdated
        if (!this.indexBuilt) {
            await this.buildIndex();
        }
        
        console.log('Search module initialized');
    }

    async loadCachedIndex() {
        try {
            const cachedIndex = await storage.getSearchIndex();
            if (cachedIndex && cachedIndex.serializedIndex) {
                this.index = lunr.Index.load(JSON.parse(cachedIndex.serializedIndex));
                this.documents = cachedIndex.documents || [];
                this.indexBuilt = true;
                console.log('Loaded cached search index');
            }
        } catch (error) {
            console.error('Failed to load cached search index:', error);
            this.indexBuilt = false;
        }
    }

    async buildIndex() {
        try {
            console.log('Building search index...');
            
            const indexData = await this.collectIndexData();
            this.documents = indexData.documents;
            
            // Build lunr.js index
            this.index = lunr(function() {
                this.ref('id');
                this.field('title', { boost: 10 });
                this.field('content', { boost: 5 });
                this.field('quote', { boost: 8 });
                this.field('note', { boost: 6 });
                this.field('tags', { boost: 4 });
                this.field('docTitle', { boost: 3 });
                
                indexData.documents.forEach((doc) => {
                    this.add(doc);
                });
            });

            // Cache the index
            await this.cacheIndex();
            
            this.indexBuilt = true;
            console.log(`Search index built with ${this.documents.length} documents`);
            
        } catch (error) {
            console.error('Failed to build search index:', error);
        }
    }

    async collectIndexData() {
        const documents = [];
        let idCounter = 1;

        try {
            // Get all documents from storage
            const storedDocs = await storage.getDocuments();
            const allAnnotations = await storage.getAllAnnotations();
            const meetingNotes = await storage.getMeetingNotes();

            // Index annotations
            for (const annotation of allAnnotations) {
                const parentDoc = storedDocs.find(d => d.id === annotation.documentId);
                
                documents.push({
                    id: `ann_${idCounter++}`,
                    type: 'annotation',
                    title: (annotation.quote || '').substring(0, 50) + '...',
                    content: annotation.note || '',
                    quote: annotation.quote || '',
                    note: annotation.note || '',
                    tags: (annotation.tags || []).join(' '),
                    docTitle: parentDoc ? parentDoc.title : '',
                    documentId: annotation.documentId,
                    annotationId: annotation.id,
                    cfiRange: annotation.cfiRange,
                    createdAt: annotation.createdAt,
                    updatedAt: annotation.updatedAt
                });
            }

            // Index meeting notes
            for (const note of meetingNotes) {
                documents.push({
                    id: `note_${idCounter++}`,
                    type: 'meeting_note',
                    title: note.title || '',
                    content: note.bodyMarkdown || '',
                    quote: '',
                    note: note.bodyMarkdown || '',
                    tags: (note.tags || []).join(' '),
                    docTitle: `${note.meetingType} Meeting`,
                    meetingType: note.meetingType,
                    dateISO: note.dateISO,
                    sessionId: note.sessionId,
                    noteId: note.id,
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt
                });
                
                // Index scripture references found in meeting notes
                const scriptureRefs = scripture.findReferencesInText(note.bodyMarkdown || '');
                for (const ref of scriptureRefs) {
                    documents.push({
                        id: `scripture_${idCounter++}`,
                        type: 'scripture',
                        title: ref.formatted,
                        content: ref.formatted,
                        quote: ref.original,
                        note: `Found in: ${note.title}`,
                        tags: 'scripture',
                        docTitle: ref.book,
                        canonical: ref.canonical,
                        chapter: ref.chapter,
                        startVerse: ref.startVerse,
                        endVerse: ref.endVerse,
                        sourceNoteId: note.id,
                        createdAt: note.createdAt
                    });
                }
            }

        } catch (error) {
            console.error('Error collecting index data:', error);
        }

        return { documents };
    }

    async cacheIndex() {
        try {
            const cacheData = {
                serializedIndex: JSON.stringify(this.index.toJSON()),
                documents: this.documents,
                builtAt: new Date().toISOString()
            };
            
            await storage.saveSearchIndex(cacheData);
        } catch (error) {
            console.error('Failed to cache search index:', error);
        }
    }

    async performSearch() {
        const query = document.getElementById('search-input').value.trim();
        
        if (!query) {
            this.clearResults();
            return;
        }

        if (query === this.lastQuery && this.lastResults) {
            // Use cached results
            this.displayResults(this.lastResults);
            return;
        }

        try {
            // Ensure index is built
            if (!this.indexBuilt) {
                await this.buildIndex();
            }

            if (!this.index) {
                throw new Error('Search index not available');
            }

            // Perform search
            const results = this.index.search(query);
            
            // Enhance results with document data
            const enhancedResults = results.map(result => {
                const doc = this.documents.find(d => d.id === result.ref);
                return {
                    ...result,
                    document: doc
                };
            }).filter(result => result.document);

            // Group results by type
            const groupedResults = {
                annotations: enhancedResults.filter(r => r.document.type === 'annotation'),
                meetingNotes: enhancedResults.filter(r => r.document.type === 'meeting_note'),
                scriptures: enhancedResults.filter(r => r.document.type === 'scripture')
            };

            this.lastQuery = query;
            this.lastResults = groupedResults;

            this.displayResults(groupedResults);

        } catch (error) {
            console.error('Search failed:', error);
            window.app.showError('Search failed. Please try again.');
        }
    }

    displayResults(results) {
        const { annotations, meetingNotes, scriptures } = results;

        // Update tab counters
        document.getElementById('notes-count').textContent = annotations.length;
        document.getElementById('scriptures-count').textContent = scriptures.length;
        document.getElementById('publications-count').textContent = meetingNotes.length;

        // Show results container
        document.getElementById('search-result-tabs').style.display = 'flex';
        document.getElementById('search-empty').style.display = 'none';

        // Populate results
        this.populateNotesResults(annotations);
        this.populateScripturesResults(scriptures);
        this.populatePublicationsResults(meetingNotes);
    }

    populateNotesResults(results) {
        const container = document.getElementById('notes-results');
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <p>No notes found matching your search.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = results.map(result => 
            this.renderNoteResult(result)
        ).join('');
    }

    populateScripturesResults(results) {
        const container = document.getElementById('scriptures-results');
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <p>No scriptures found matching your search.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = results.map(result => 
            this.renderScriptureResult(result)
        ).join('');
    }

    populatePublicationsResults(results) {
        const container = document.getElementById('publications-results');
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <p>No publications found matching your search.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = results.map(result => 
            this.renderPublicationResult(result)
        ).join('');
    }

    renderNoteResult(result) {
        const doc = result.document;
        const snippet = this.createHighlightedSnippet(doc, this.lastQuery);
        const date = new Date(doc.updatedAt || doc.createdAt).toLocaleDateString();

        return `
            <div class="search-result" onclick="search.openNoteResult('${doc.annotationId}', '${doc.documentId}')" tabindex="0">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h6 class="mb-1">${this.escapeHtml(doc.title)}</h6>
                    <small class="text-muted">${date}</small>
                </div>
                <div class="search-snippet mb-2">${snippet}</div>
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted">${this.escapeHtml(doc.docTitle)}</small>
                    <span class="badge bg-primary">Note</span>
                </div>
            </div>
        `;
    }

    renderScriptureResult(result) {
        const doc = result.document;
        const snippet = this.createHighlightedSnippet(doc, this.lastQuery);

        return `
            <div class="search-result" onclick="search.openScriptureResult('${doc.canonical}')" tabindex="0">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h6 class="mb-1">${this.escapeHtml(doc.title)}</h6>
                    <span class="badge bg-success">Scripture</span>
                </div>
                <div class="search-snippet mb-2">${snippet}</div>
                <small class="text-muted">${this.escapeHtml(doc.note)}</small>
            </div>
        `;
    }

    renderPublicationResult(result) {
        const doc = result.document;
        const snippet = this.createHighlightedSnippet(doc, this.lastQuery);
        const date = new Date(doc.dateISO).toLocaleDateString();

        return `
            <div class="search-result" onclick="search.openPublicationResult('${doc.noteId}')" tabindex="0">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h6 class="mb-1">${this.escapeHtml(doc.title)}</h6>
                    <small class="text-muted">${date}</small>
                </div>
                <div class="search-snippet mb-2">${snippet}</div>
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted">${this.escapeHtml(doc.docTitle)}</small>
                    <span class="badge bg-info">Meeting</span>
                </div>
            </div>
        `;
    }

    createHighlightedSnippet(doc, query) {
        const content = (doc.content + ' ' + (doc.note || '') + ' ' + (doc.quote || '')).toLowerCase();
        const queryLower = query.toLowerCase();
        const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
        
        let snippet = content;
        
        // Find best matching position
        let bestPos = -1;
        let bestScore = 0;
        
        for (const term of queryTerms) {
            const pos = content.indexOf(term);
            if (pos !== -1) {
                const score = queryTerms.filter(t => content.substring(pos, pos + 100).includes(t)).length;
                if (score > bestScore) {
                    bestScore = score;
                    bestPos = pos;
                }
            }
        }
        
        // Extract snippet around best position
        if (bestPos !== -1) {
            const start = Math.max(0, bestPos - 50);
            const end = Math.min(content.length, bestPos + 150);
            snippet = content.substring(start, end);
            
            if (start > 0) snippet = '...' + snippet;
            if (end < content.length) snippet = snippet + '...';
        } else {
            snippet = content.substring(0, 200);
            if (content.length > 200) snippet += '...';
        }
        
        // Highlight query terms
        for (const term of queryTerms) {
            const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
            snippet = snippet.replace(regex, '<span class="search-highlight">$1</span>');
        }
        
        return snippet;
    }

    async openNoteResult(annotationId, documentId) {
        try {
            // Switch to notes tab
            document.getElementById('notes-tab').click();
            
            // If the document is not currently open, open it
            const currentDoc = reader.getCurrentDocument();
            if (!currentDoc || currentDoc.id !== documentId) {
                await reader.openDocument(documentId);
            }
            
            // Jump to the annotation
            await notes.jumpToAnnotation(annotationId);
            
        } catch (error) {
            console.error('Failed to open note result:', error);
            window.app.showError('Failed to open note.');
        }
    }

    async openScriptureResult(canonical) {
        try {
            await scripture.openScripture(canonical);
        } catch (error) {
            console.error('Failed to open scripture result:', error);
            window.app.showError('Failed to open scripture.');
        }
    }

    async openPublicationResult(noteId) {
        try {
            const note = await storage.getMeetingNote(noteId);
            if (note) {
                // Switch to meetings tab
                document.getElementById('meetings-tab').click();
                
                // Open the meeting note
                await notes.openMeetingNote(note.meetingType, note.dateISO, note.sessionId);
            }
        } catch (error) {
            console.error('Failed to open publication result:', error);
            window.app.showError('Failed to open meeting note.');
        }
    }

    clearResults() {
        document.getElementById('search-result-tabs').style.display = 'none';
        document.getElementById('search-empty').style.display = 'block';
        
        // Clear result containers
        document.getElementById('notes-results').innerHTML = '';
        document.getElementById('scriptures-results').innerHTML = '';
        document.getElementById('publications-results').innerHTML = '';
        
        // Reset counters
        document.getElementById('notes-count').textContent = '0';
        document.getElementById('scriptures-count').textContent = '0';
        document.getElementById('publications-count').textContent = '0';
        
        this.lastQuery = '';
        this.lastResults = null;
    }

    async rebuildIndex() {
        this.indexBuilt = false;
        await storage.clearSearchIndex();
        await this.buildIndex();
        
        // Re-run current search if any
        if (this.lastQuery) {
            await this.performSearch();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeRegex(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Create and export search instance
const search = new Search();
window.search = search; // For global access

export { search };
