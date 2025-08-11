// Data export/import module
import { storage } from './storage.js';

class Exporter {
    constructor() {
        this.exportOptions = {
            highlights: true,
            meetingNotes: true,
            conventionNotes: true
        };
        this.exportFormat = 'markdown';
    }

    async init() {
        console.log('Initializing exporter module...');
        console.log('Exporter module initialized');
    }

    showExportModal() {
        const modal = new bootstrap.Modal(document.getElementById('importExportModal'));
        modal.show();
        
        // Activate export tab
        document.getElementById('export-tab').click();
    }

    async exportData() {
        try {
            // Get export options
            this.exportOptions.highlights = document.getElementById('export-highlights').checked;
            this.exportOptions.meetingNotes = document.getElementById('export-meeting-notes').checked;
            this.exportOptions.conventionNotes = document.getElementById('export-convention-notes').checked;
            
            // Get export format
            const formatRadios = document.querySelectorAll('input[name="export-format"]');
            this.exportFormat = [...formatRadios].find(radio => radio.checked)?.value || 'markdown';

            // Collect data
            const data = await this.collectExportData();
            
            if (!data || Object.keys(data).length === 0) {
                window.app.showError('No data to export with current options.');
                return;
            }

            // Generate export content
            let content, filename, mimeType;
            
            if (this.exportFormat === 'json') {
                content = JSON.stringify(data, null, 2);
                filename = `study-companion-export-${new Date().toISOString().split('T')[0]}.json`;
                mimeType = 'application/json';
            } else {
                content = this.generateMarkdownContent(data);
                filename = `study-companion-export-${new Date().toISOString().split('T')[0]}.md`;
                mimeType = 'text/markdown';
            }

            // Download file
            this.downloadFile(content, filename, mimeType);
            
            window.app.showSuccess('Data exported successfully!');

        } catch (error) {
            console.error('Export failed:', error);
            window.app.showError('Export failed. Please try again.');
        }
    }

    async collectExportData() {
        const data = {
            exportInfo: {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                options: this.exportOptions,
                format: this.exportFormat
            }
        };

        try {
            // Export highlights/annotations
            if (this.exportOptions.highlights) {
                const documents = await storage.getDocuments();
                const annotations = await storage.getAllAnnotations();
                
                data.highlights = {
                    documents: documents.filter(doc => doc.type === 'epub'),
                    annotations: annotations
                };
            }

            // Export meeting notes
            if (this.exportOptions.meetingNotes) {
                const meetingNotes = await storage.getMeetingNotes();
                data.meetingNotes = meetingNotes.filter(note => 
                    note.meetingType === 'Midweek' || note.meetingType === 'Weekend'
                );
            }

            // Export convention notes
            if (this.exportOptions.conventionNotes) {
                const meetingNotes = await storage.getMeetingNotes();
                const settings = await storage.getSettings();
                
                data.conventionNotes = {
                    settings: settings.convention,
                    notes: meetingNotes.filter(note => note.meetingType === 'Convention')
                };
            }

        } catch (error) {
            console.error('Error collecting export data:', error);
            throw error;
        }

        return data;
    }

    generateMarkdownContent(data) {
        let markdown = `# Study Companion Export\n\n`;
        markdown += `Exported on: ${new Date().toLocaleDateString()}\n\n`;

        // Export highlights
        if (data.highlights && data.highlights.annotations.length > 0) {
            markdown += `## Highlights and Notes\n\n`;
            
            // Group annotations by document
            const annotationsByDoc = data.highlights.annotations.reduce((acc, ann) => {
                if (!acc[ann.documentId]) acc[ann.documentId] = [];
                acc[ann.documentId].push(ann);
                return acc;
            }, {});

            for (const [docId, annotations] of Object.entries(annotationsByDoc)) {
                const document = data.highlights.documents.find(d => d.id === docId);
                const docTitle = document ? document.title : 'Unknown Document';
                
                markdown += `### ${docTitle}\n\n`;
                
                // Sort annotations by creation date
                annotations.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                
                for (const annotation of annotations) {
                    markdown += `#### Highlight\n\n`;
                    markdown += `> ${annotation.quote}\n\n`;
                    
                    if (annotation.note) {
                        markdown += `**Note:** ${annotation.note}\n\n`;
                    }
                    
                    if (annotation.tags && annotation.tags.length > 0) {
                        markdown += `**Tags:** ${annotation.tags.join(', ')}\n\n`;
                    }
                    
                    markdown += `*Added: ${new Date(annotation.createdAt).toLocaleDateString()}*\n\n`;
                    markdown += `---\n\n`;
                }
            }
        }

        // Export meeting notes
        if (data.meetingNotes && data.meetingNotes.length > 0) {
            markdown += `## Meeting Notes\n\n`;
            
            // Sort by date
            data.meetingNotes.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
            
            for (const note of data.meetingNotes) {
                markdown += `### ${note.title}\n\n`;
                markdown += `**Date:** ${new Date(note.dateISO).toLocaleDateString()}\n`;
                markdown += `**Type:** ${note.meetingType}\n\n`;
                
                if (note.tags && note.tags.length > 0) {
                    markdown += `**Tags:** ${note.tags.join(', ')}\n\n`;
                }
                
                markdown += `${note.bodyMarkdown}\n\n`;
                markdown += `---\n\n`;
            }
        }

        // Export convention notes
        if (data.conventionNotes && data.conventionNotes.notes.length > 0) {
            markdown += `## Convention Notes\n\n`;
            
            if (data.conventionNotes.settings) {
                const settings = data.conventionNotes.settings;
                markdown += `**Convention Dates:** ${settings.startISO} to ${settings.endISO}\n\n`;
            }
            
            // Sort by date
            data.conventionNotes.notes.sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));
            
            // Group by date
            const notesByDate = data.conventionNotes.notes.reduce((acc, note) => {
                if (!acc[note.dateISO]) acc[note.dateISO] = [];
                acc[note.dateISO].push(note);
                return acc;
            }, {});

            for (const [dateISO, notes] of Object.entries(notesByDate)) {
                markdown += `### ${new Date(dateISO).toLocaleDateString()}\n\n`;
                
                for (const note of notes) {
                    markdown += `#### ${note.title}\n\n`;
                    
                    if (note.tags && note.tags.length > 0) {
                        markdown += `**Tags:** ${note.tags.join(', ')}\n\n`;
                    }
                    
                    markdown += `${note.bodyMarkdown}\n\n`;
                }
                
                markdown += `---\n\n`;
            }
        }

        return markdown;
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        
        // Append to body, click, and remove
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up object URL
        URL.revokeObjectURL(url);
    }

    async importData() {
        const fileInput = document.getElementById('import-file');
        const file = fileInput.files[0];
        
        if (!file) {
            window.app.showError('Please select a JSON file to import.');
            return;
        }

        if (!file.name.toLowerCase().endsWith('.json')) {
            window.app.showError('Please select a valid JSON file.');
            return;
        }

        try {
            const content = await this.readFileContent(file);
            const data = JSON.parse(content);
            
            // Validate data structure
            if (!data.version && !data.exportedAt && !data.exportInfo) {
                throw new Error('Invalid export file format');
            }

            // Show confirmation
            const confirmMessage = `
Import data from ${data.exportedAt || data.exportInfo?.exportedAt || 'unknown date'}?

This will merge with your existing data. Duplicates will be handled by timestamp.
            `.trim();
            
            if (!confirm(confirmMessage)) return;

            // Import data
            await storage.importData(data);
            
            // Refresh UI
            if (window.notes) await window.notes.loadAnnotations();
            if (window.schedule) await window.schedule.init();
            if (window.search) await window.search.rebuildIndex();
            
            // Hide modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('importExportModal'));
            modal.hide();
            
            // Clear file input
            fileInput.value = '';
            
            window.app.showSuccess('Data imported successfully!');

        } catch (error) {
            console.error('Import failed:', error);
            
            if (error instanceof SyntaxError) {
                window.app.showError('Invalid JSON file. Please check the file format.');
            } else {
                window.app.showError('Import failed: ' + error.message);
            }
        }
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            
            reader.readAsText(file);
        });
    }

    // Export specific subsets of data
    async exportHighlights(documentId = null) {
        try {
            let annotations;
            let documents;
            
            if (documentId) {
                annotations = await storage.getAnnotations(documentId);
                const document = await storage.getDocument(documentId);
                documents = document ? [document] : [];
            } else {
                annotations = await storage.getAllAnnotations();
                documents = await storage.getDocuments();
            }

            const data = {
                exportInfo: {
                    version: '1.0',
                    exportedAt: new Date().toISOString(),
                    type: 'highlights'
                },
                highlights: {
                    documents: documents.filter(doc => doc.type === 'epub'),
                    annotations: annotations
                }
            };

            const content = this.generateMarkdownContent(data);
            const filename = `highlights-${documentId || 'all'}-${new Date().toISOString().split('T')[0]}.md`;
            
            this.downloadFile(content, filename, 'text/markdown');
            
            return true;

        } catch (error) {
            console.error('Failed to export highlights:', error);
            throw error;
        }
    }

    async exportMeetingNotes(dateFrom = null, dateTo = null) {
        try {
            let meetingNotes = await storage.getMeetingNotes();
            
            // Filter by date range if provided
            if (dateFrom) {
                meetingNotes = meetingNotes.filter(note => note.dateISO >= dateFrom);
            }
            if (dateTo) {
                meetingNotes = meetingNotes.filter(note => note.dateISO <= dateTo);
            }

            const data = {
                exportInfo: {
                    version: '1.0',
                    exportedAt: new Date().toISOString(),
                    type: 'meeting-notes',
                    dateRange: { from: dateFrom, to: dateTo }
                },
                meetingNotes: meetingNotes
            };

            const content = this.generateMarkdownContent(data);
            const filename = `meeting-notes-${dateFrom || 'all'}-${new Date().toISOString().split('T')[0]}.md`;
            
            this.downloadFile(content, filename, 'text/markdown');
            
            return true;

        } catch (error) {
            console.error('Failed to export meeting notes:', error);
            throw error;
        }
    }
}

// Create and export exporter instance
const exporter = new Exporter();
window.exporter = exporter; // For global access

export { exporter };
