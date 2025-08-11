// Notes management module
import { storage } from './storage.js';
import { reader } from './reader.js';
import { scripture } from './scripture.js';

class Notes {
    constructor() {
        this.currentDocument = null;
        this.currentAnnotations = [];
        this.currentHighlight = null;
        this.currentMeetingNote = null;
        this.marked = null;
    }

    async init() {
        console.log('Initializing notes module...');
        
        // Initialize marked.js for Markdown rendering
        if (typeof marked !== 'undefined') {
            this.marked = marked;
            this.marked.setOptions({
                breaks: true,
                sanitize: false,
                smartypants: true
            });
        }
        
        console.log('Notes module initialized');
    }

    setCurrentDocument(document) {
        this.currentDocument = document;
        this.loadAnnotations();
    }

    async loadAnnotations() {
        if (!this.currentDocument) {
            this.currentAnnotations = [];
            this.refreshDisplay();
            return;
        }

        try {
            this.currentAnnotations = await storage.getAnnotations(this.currentDocument.id);
            this.refreshDisplay();
        } catch (error) {
            console.error('Failed to load annotations:', error);
            this.currentAnnotations = [];
        }
    }

    refreshDisplay() {
        this.updateNotesDisplay();
    }

    updateNotesDisplay() {
        const container = document.getElementById('notes-list');
        
        if (!this.currentDocument) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-book-open fa-2x mb-2"></i>
                    <p data-i18n="no_book_selected">No book selected. Import an EPUB to get started.</p>
                </div>
            `;
            return;
        }

        if (this.currentAnnotations.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-sticky-note fa-2x mb-2"></i>
                    <p>No notes yet. Select text in the book to add highlights and notes.</p>
                </div>
            `;
            return;
        }

        // Sort annotations by creation date
        const sortedAnnotations = this.currentAnnotations.sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        container.innerHTML = sortedAnnotations.map(annotation => 
            this.renderAnnotationItem(annotation)
        ).join('');
    }

    renderAnnotationItem(annotation) {
        const tags = (annotation.tags || []).map(tag => 
            `<span class="note-tag">${this.escapeHtml(tag)}</span>`
        ).join('');

        const createdDate = new Date(annotation.createdAt).toLocaleDateString();
        
        return `
            <div class="note-item" data-annotation-id="${annotation.id}" tabindex="0" 
                 onclick="notes.jumpToAnnotation('${annotation.id}')"
                 onkeypress="if(event.key==='Enter') notes.jumpToAnnotation('${annotation.id}')">
                
                <div class="note-quote">
                    "${this.escapeHtml(annotation.quote)}"
                </div>
                
                ${annotation.note ? `
                    <div class="note-content">
                        ${this.escapeHtml(annotation.note)}
                    </div>
                ` : ''}
                
                ${tags ? `<div class="note-tags">${tags}</div>` : ''}
                
                <div class="note-meta d-flex justify-content-between align-items-center">
                    <small class="text-muted">${createdDate}</small>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary btn-sm" 
                                onclick="event.stopPropagation(); notes.editAnnotation('${annotation.id}')"
                                title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm" 
                                onclick="event.stopPropagation(); notes.deleteAnnotationConfirm('${annotation.id}')"
                                title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async jumpToAnnotation(annotationId) {
        const annotation = this.currentAnnotations.find(a => a.id === annotationId);
        if (!annotation || !annotation.cfiRange) return;

        // Jump to location in reader
        await reader.jumpToCfi(annotation.cfiRange);

        // Highlight the note item temporarily
        const noteItem = document.querySelector(`[data-annotation-id="${annotationId}"]`);
        if (noteItem) {
            noteItem.classList.add('active');
            setTimeout(() => noteItem.classList.remove('active'), 2000);
        }
    }

    async editAnnotation(annotationId) {
        const annotation = this.currentAnnotations.find(a => a.id === annotationId);
        if (!annotation) return;

        // Populate modal
        document.getElementById('highlight-quote').textContent = annotation.quote;
        document.getElementById('highlight-note').value = annotation.note || '';
        document.getElementById('highlight-tags').value = (annotation.tags || []).join(', ');
        document.getElementById('delete-highlight-btn').style.display = 'inline-block';

        // Set current highlight for saving
        this.currentHighlight = annotation;

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('highlightModal'));
        modal.show();
    }

    async saveHighlight() {
        try {
            const note = document.getElementById('highlight-note').value.trim();
            const tagsText = document.getElementById('highlight-tags').value.trim();
            const tags = tagsText ? tagsText.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

            let annotation;

            if (this.currentHighlight) {
                // Update existing annotation
                annotation = { ...this.currentHighlight };
                annotation.note = note;
                annotation.tags = tags;
            } else if (reader.selectionInfo) {
                // Create new annotation
                annotation = {
                    cfiRange: reader.selectionInfo.cfiRange,
                    quote: reader.selectionInfo.quote,
                    note: note,
                    tags: tags
                };
            } else {
                throw new Error('No selection or annotation to save');
            }

            // Save to storage
            await storage.saveAnnotation(this.currentDocument.id, annotation);

            // Refresh display
            await this.loadAnnotations();
            await reader.refreshHighlights();

            // Hide modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('highlightModal'));
            modal.hide();

            // Clear current highlight
            this.currentHighlight = null;
            reader.selectionInfo = null;

            window.app.showSuccess('Note saved successfully!');

        } catch (error) {
            console.error('Failed to save highlight:', error);
            window.app.showError('Failed to save note. Please try again.');
        }
    }

    async deleteHighlight() {
        if (!this.currentHighlight) return;

        if (!confirm('Are you sure you want to delete this note?')) return;

        try {
            // Remove from storage
            await storage.deleteAnnotation(this.currentDocument.id, this.currentHighlight.id);

            // Remove from rendition
            await reader.removeHighlightFromRendition(this.currentHighlight.id);

            // Refresh display
            await this.loadAnnotations();

            // Hide modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('highlightModal'));
            modal.hide();

            // Clear current highlight
            this.currentHighlight = null;

            window.app.showSuccess('Note deleted successfully!');

        } catch (error) {
            console.error('Failed to delete highlight:', error);
            window.app.showError('Failed to delete note. Please try again.');
        }
    }

    async deleteAnnotationConfirm(annotationId) {
        if (!confirm('Are you sure you want to delete this note?')) return;

        try {
            const annotation = this.currentAnnotations.find(a => a.id === annotationId);
            if (!annotation) return;

            // Remove from storage
            await storage.deleteAnnotation(this.currentDocument.id, annotationId);

            // Remove from rendition
            await reader.removeHighlightFromRendition(annotationId);

            // Refresh display
            await this.loadAnnotations();

            window.app.showSuccess('Note deleted successfully!');

        } catch (error) {
            console.error('Failed to delete annotation:', error);
            window.app.showError('Failed to delete note. Please try again.');
        }
    }

    // Meeting Notes functionality
    async openMeetingNote(meetingType, date, sessionId = null) {
        try {
            // Clear previous data
            this.currentMeetingNote = null;

            // Try to find existing note
            const notes = await storage.getMeetingNotes();
            const existingNote = notes.find(note => 
                note.dateISO === date && 
                note.meetingType === meetingType &&
                (!sessionId || note.sessionId === sessionId)
            );

            if (existingNote) {
                this.currentMeetingNote = existingNote;
                this.populateMeetingNoteModal(existingNote);
            } else {
                // Create new note template
                this.populateMeetingNoteModal({
                    title: `${meetingType} Meeting`,
                    dateISO: date,
                    meetingType: meetingType,
                    sessionId: sessionId,
                    bodyMarkdown: '',
                    tags: []
                });
            }

            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('meetingNoteModal'));
            modal.show();

        } catch (error) {
            console.error('Failed to open meeting note:', error);
            window.app.showError('Failed to open meeting note.');
        }
    }

    populateMeetingNoteModal(note) {
        document.getElementById('meeting-title').value = note.title || '';
        document.getElementById('meeting-date').value = note.dateISO || '';
        document.getElementById('meeting-type').value = note.meetingType || 'Midweek';
        document.getElementById('meeting-content').value = note.bodyMarkdown || '';
        document.getElementById('meeting-tags').value = (note.tags || []).join(', ');

        // Show/hide delete button
        const deleteBtn = document.getElementById('delete-meeting-note-btn');
        deleteBtn.style.display = note.id ? 'inline-block' : 'none';
    }

    async saveMeetingNote() {
        try {
            const title = document.getElementById('meeting-title').value.trim();
            const date = document.getElementById('meeting-date').value;
            const type = document.getElementById('meeting-type').value;
            const content = document.getElementById('meeting-content').value.trim();
            const tagsText = document.getElementById('meeting-tags').value.trim();
            
            if (!title || !date || !content) {
                window.app.showError('Please fill in all required fields.');
                return;
            }

            const tags = tagsText ? tagsText.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

            const note = {
                ...(this.currentMeetingNote || {}),
                title: title,
                dateISO: date,
                meetingType: type,
                bodyMarkdown: content,
                tags: tags,
                links: this.extractScriptureLinks(content)
            };

            await storage.saveMeetingNote(note);

            // Hide modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('meetingNoteModal'));
            modal.hide();

            // Refresh meetings display
            // Note: This would be handled by the schedule module
            
            window.app.showSuccess('Meeting note saved successfully!');

        } catch (error) {
            console.error('Failed to save meeting note:', error);
            window.app.showError('Failed to save meeting note. Please try again.');
        }
    }

    async deleteMeetingNote() {
        if (!this.currentMeetingNote || !this.currentMeetingNote.id) return;

        if (!confirm('Are you sure you want to delete this meeting note?')) return;

        try {
            await storage.deleteMeetingNote(this.currentMeetingNote.id);

            // Hide modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('meetingNoteModal'));
            modal.hide();

            window.app.showSuccess('Meeting note deleted successfully!');

        } catch (error) {
            console.error('Failed to delete meeting note:', error);
            window.app.showError('Failed to delete meeting note. Please try again.');
        }
    }

    // Markdown editing helpers
    insertMarkdown(before, after) {
        const textarea = document.getElementById('meeting-content');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selectedText = text.substring(start, end);

        const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
        textarea.value = newText;
        
        // Set cursor position
        const newCursor = start + before.length + selectedText.length + after.length;
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
    }

    insertScriptureRef() {
        const scriptureText = prompt('Enter scripture reference (e.g., John 3:16):');
        if (!scriptureText) return;

        const parsed = scripture.parseReference(scriptureText);
        if (parsed) {
            const markdownLink = `[${scriptureText}](scripture://${parsed.canonical})`;
            this.insertMarkdown('', markdownLink);
        } else {
            this.insertMarkdown('', scriptureText);
        }
    }

    updatePreview() {
        const content = document.getElementById('meeting-content').value;
        const preview = document.getElementById('markdown-preview');
        
        if (this.marked) {
            let html = this.marked.parse(content);
            
            // Process scripture links
            html = this.processScriptureLinks(html);
            
            preview.innerHTML = html;
        } else {
            preview.innerHTML = '<p>Markdown renderer not available</p>';
        }
    }

    processScriptureLinks(html) {
        // Convert scripture:// links to clickable links
        return html.replace(/scripture:\/\/([^"'\s<>]+)/g, (match, canonical) => {
            const reference = scripture.formatCanonical(canonical);
            return `<a href="#" class="scripture-ref" onclick="scripture.openScripture('${canonical}')">${reference}</a>`;
        });
    }

    extractScriptureLinks(content) {
        const links = [];
        const regex = /scripture:\/\/([^"\s<>]+)/g;
        let match;

        while ((match = regex.exec(content)) !== null) {
            links.push({
                type: 'verse',
                value: match[1]
            });
        }

        // Also look for scripture references in text
        const scriptureRefs = scripture.findReferencesInText(content);
        for (const ref of scriptureRefs) {
            links.push({
                type: 'verse',
                value: ref.canonical
            });
        }

        return links;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create and export notes instance
const notes = new Notes();
window.notes = notes; // For global access

export { notes };
