// Storage module using localForage for IndexedDB abstraction
class Storage {
    constructor() {
        this.dbName = 'StudyCompanionDB';
        this.version = 1;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        try {
            // Configure localForage
            localforage.config({
                driver: localforage.INDEXEDDB,
                name: this.dbName,
                version: this.version,
                storeName: 'study_companion',
                description: 'Study Companion local database'
            });
            
            // Test connection
            await localforage.ready();
            
            // Run migrations if needed
            await this.runMigrations();
            
            this.initialized = true;
            console.log('Storage initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize storage:', error);
            throw new Error('Storage initialization failed');
        }
    }

    async runMigrations() {
        try {
            const currentVersion = await this.getItem('_schema_version') || 0;
            
            if (currentVersion < this.version) {
                console.log(`Running migrations from version ${currentVersion} to ${this.version}`);
                
                // Migration logic would go here
                // For now, just update version
                await this.setItem('_schema_version', this.version);
            }
        } catch (error) {
            console.error('Migration failed:', error);
        }
    }

    // Basic key-value operations
    async getItem(key) {
        try {
            return await localforage.getItem(key);
        } catch (error) {
            console.error(`Failed to get item ${key}:`, error);
            return null;
        }
    }

    async setItem(key, value) {
        try {
            await localforage.setItem(key, value);
            return true;
        } catch (error) {
            console.error(`Failed to set item ${key}:`, error);
            return false;
        }
    }

    async removeItem(key) {
        try {
            await localforage.removeItem(key);
            return true;
        } catch (error) {
            console.error(`Failed to remove item ${key}:`, error);
            return false;
        }
    }

    async clear() {
        try {
            await localforage.clear();
            return true;
        } catch (error) {
            console.error('Failed to clear storage:', error);
            return false;
        }
    }

    async keys() {
        try {
            return await localforage.keys();
        } catch (error) {
            console.error('Failed to get keys:', error);
            return [];
        }
    }

    // Settings operations
    async getSettings() {
        const settings = await this.getItem('settings') || {};
        
        // Ensure default structure
        return {
            id: 'settings',
            lang: 'en',
            theme: 'light',
            pwaEnabled: false,
            setupComplete: false,
            meetingSchedule: {
                midweek: [],
                weekend: []
            },
            convention: {
                enabled: false,
                startISO: '',
                endISO: '',
                sessions: []
            },
            ...settings
        };
    }

    async saveSettings(settings) {
        settings.updatedAt = new Date().toISOString();
        return await this.setItem('settings', settings);
    }

    // Document operations
    async getDocuments() {
        const documents = await this.getItem('documents') || [];
        return documents;
    }

    async saveDocument(document) {
        const documents = await this.getDocuments();
        
        if (!document.id) {
            document.id = this.generateId('doc');
        }
        
        document.updatedAt = new Date().toISOString();
        
        const existingIndex = documents.findIndex(d => d.id === document.id);
        if (existingIndex >= 0) {
            documents[existingIndex] = document;
        } else {
            document.createdAt = document.updatedAt;
            documents.push(document);
        }
        
        return await this.setItem('documents', documents);
    }

    async deleteDocument(documentId) {
        const documents = await this.getDocuments();
        const filteredDocs = documents.filter(d => d.id !== documentId);
        await this.setItem('documents', filteredDocs);
        
        // Also delete related data
        await this.deleteAnnotations(documentId);
        await this.removeBibleIndex(documentId);
        
        return true;
    }

    async getDocument(documentId) {
        const documents = await this.getDocuments();
        return documents.find(d => d.id === documentId);
    }

    // Annotation operations
    async getAnnotations(documentId) {
        const key = `annotations_${documentId}`;
        return await this.getItem(key) || [];
    }

    async saveAnnotation(documentId, annotation) {
        const annotations = await this.getAnnotations(documentId);
        
        if (!annotation.id) {
            annotation.id = this.generateId('ann');
        }
        
        annotation.documentId = documentId;
        annotation.updatedAt = new Date().toISOString();
        
        const existingIndex = annotations.findIndex(a => a.id === annotation.id);
        if (existingIndex >= 0) {
            annotations[existingIndex] = annotation;
        } else {
            annotation.createdAt = annotation.updatedAt;
            annotations.push(annotation);
        }
        
        const key = `annotations_${documentId}`;
        return await this.setItem(key, annotations);
    }

    async deleteAnnotation(documentId, annotationId) {
        const annotations = await this.getAnnotations(documentId);
        const filteredAnnotations = annotations.filter(a => a.id !== annotationId);
        
        const key = `annotations_${documentId}`;
        return await this.setItem(key, filteredAnnotations);
    }

    async deleteAnnotations(documentId) {
        const key = `annotations_${documentId}`;
        return await this.removeItem(key);
    }

    async getAllAnnotations() {
        const keys = await this.keys();
        const annotationKeys = keys.filter(key => key.startsWith('annotations_'));
        
        const allAnnotations = [];
        for (const key of annotationKeys) {
            const annotations = await this.getItem(key) || [];
            allAnnotations.push(...annotations);
        }
        
        return allAnnotations;
    }

    // Meeting notes operations
    async getMeetingNotes() {
        return await this.getItem('meetingNotes') || [];
    }

    async saveMeetingNote(note) {
        const notes = await this.getMeetingNotes();
        
        if (!note.id) {
            note.id = this.generateId('note');
        }
        
        note.updatedAt = new Date().toISOString();
        
        const existingIndex = notes.findIndex(n => n.id === note.id);
        if (existingIndex >= 0) {
            notes[existingIndex] = note;
        } else {
            note.createdAt = note.updatedAt;
            notes.push(note);
        }
        
        return await this.setItem('meetingNotes', notes);
    }

    async deleteMeetingNote(noteId) {
        const notes = await this.getMeetingNotes();
        const filteredNotes = notes.filter(n => n.id !== noteId);
        return await this.setItem('meetingNotes', filteredNotes);
    }

    async getMeetingNote(noteId) {
        const notes = await this.getMeetingNotes();
        return notes.find(n => n.id === noteId);
    }

    // Bible index operations
    async getBibleIndex() {
        return await this.getItem('bibleIndex') || null;
    }

    async saveBibleIndex(index) {
        index.updatedAt = new Date().toISOString();
        return await this.setItem('bibleIndex', index);
    }

    async removeBibleIndex(documentId) {
        const index = await this.getBibleIndex();
        if (index && index.documentId === documentId) {
            return await this.removeItem('bibleIndex');
        }
        return true;
    }

    // Search index operations
    async getSearchIndex() {
        return await this.getItem('searchIndex') || null;
    }

    async saveSearchIndex(index) {
        index.builtAt = new Date().toISOString();
        return await this.setItem('searchIndex', index);
    }

    async clearSearchIndex() {
        return await this.removeItem('searchIndex');
    }

    // File operations (for storing EPUB contents)
    async saveFile(fileKey, arrayBuffer) {
        const key = `file_${fileKey}`;
        return await this.setItem(key, arrayBuffer);
    }

    async getFile(fileKey) {
        const key = `file_${fileKey}`;
        return await this.getItem(key);
    }

    async deleteFile(fileKey) {
        const key = `file_${fileKey}`;
        return await this.removeItem(key);
    }

    // Utility methods
    generateId(prefix = 'item') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `${prefix}_${timestamp}_${random}`;
    }

    async getDataStats() {
        try {
            const keys = await this.keys();
            const stats = {
                totalKeys: keys.length,
                documents: 0,
                annotations: 0,
                meetingNotes: 0,
                files: 0,
                other: 0
            };
            
            // Count items by type
            for (const key of keys) {
                if (key === 'documents') {
                    const docs = await this.getItem(key) || [];
                    stats.documents = docs.length;
                } else if (key.startsWith('annotations_')) {
                    const annotations = await this.getItem(key) || [];
                    stats.annotations += annotations.length;
                } else if (key === 'meetingNotes') {
                    const notes = await this.getItem(key) || [];
                    stats.meetingNotes = notes.length;
                } else if (key.startsWith('file_')) {
                    stats.files++;
                } else {
                    stats.other++;
                }
            }
            
            return stats;
        } catch (error) {
            console.error('Failed to get data stats:', error);
            return null;
        }
    }

    async exportData() {
        try {
            const data = {
                version: this.version,
                exportedAt: new Date().toISOString(),
                settings: await this.getSettings(),
                documents: await this.getDocuments(),
                annotations: await this.getAllAnnotations(),
                meetingNotes: await this.getMeetingNotes(),
                bibleIndex: await this.getBibleIndex()
            };
            
            return data;
        } catch (error) {
            console.error('Failed to export data:', error);
            throw error;
        }
    }

    async importData(data, mergeStrategy = 'last-writer-wins') {
        try {
            console.log('Importing data with strategy:', mergeStrategy);
            
            // Validate data structure
            if (!data.version || !data.exportedAt) {
                throw new Error('Invalid data format');
            }
            
            // Import settings (always overwrite)
            if (data.settings) {
                await this.saveSettings(data.settings);
            }
            
            // Import documents
            if (data.documents && Array.isArray(data.documents)) {
                const currentDocs = await this.getDocuments();
                const mergedDocs = this.mergeArrays(currentDocs, data.documents, mergeStrategy);
                await this.setItem('documents', mergedDocs);
            }
            
            // Import annotations
            if (data.annotations && Array.isArray(data.annotations)) {
                // Group by document ID
                const annotationsByDoc = data.annotations.reduce((acc, ann) => {
                    if (!acc[ann.documentId]) acc[ann.documentId] = [];
                    acc[ann.documentId].push(ann);
                    return acc;
                }, {});
                
                for (const [docId, annotations] of Object.entries(annotationsByDoc)) {
                    const currentAnnotations = await this.getAnnotations(docId);
                    const mergedAnnotations = this.mergeArrays(currentAnnotations, annotations, mergeStrategy);
                    await this.setItem(`annotations_${docId}`, mergedAnnotations);
                }
            }
            
            // Import meeting notes
            if (data.meetingNotes && Array.isArray(data.meetingNotes)) {
                const currentNotes = await this.getMeetingNotes();
                const mergedNotes = this.mergeArrays(currentNotes, data.meetingNotes, mergeStrategy);
                await this.setItem('meetingNotes', mergedNotes);
            }
            
            // Import Bible index (if newer)
            if (data.bibleIndex) {
                const currentIndex = await this.getBibleIndex();
                if (!currentIndex || (data.bibleIndex.updatedAt > currentIndex.updatedAt)) {
                    await this.saveBibleIndex(data.bibleIndex);
                }
            }
            
            // Clear search index to force rebuild
            await this.clearSearchIndex();
            
            console.log('Data import completed successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to import data:', error);
            throw error;
        }
    }

    mergeArrays(currentArray, newArray, strategy) {
        if (strategy === 'last-writer-wins') {
            const merged = [...currentArray];
            
            for (const newItem of newArray) {
                const existingIndex = merged.findIndex(item => item.id === newItem.id);
                
                if (existingIndex >= 0) {
                    // Compare timestamps
                    const existing = merged[existingIndex];
                    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0);
                    const newTime = new Date(newItem.updatedAt || newItem.createdAt || 0);
                    
                    if (newTime > existingTime) {
                        merged[existingIndex] = newItem;
                    }
                } else {
                    merged.push(newItem);
                }
            }
            
            return merged;
        }
        
        // Default: append new items
        return [...currentArray, ...newArray];
    }

    async clearAllData() {
        if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            try {
                await this.clear();
                console.log('All data cleared');
                return true;
            } catch (error) {
                console.error('Failed to clear data:', error);
                return false;
            }
        }
        return false;
    }

    async showDataStats() {
        const stats = await this.getDataStats();
        if (stats) {
            const message = `
Data Statistics:
- Total items: ${stats.totalKeys}
- Documents: ${stats.documents}
- Annotations: ${stats.annotations}
- Meeting notes: ${stats.meetingNotes}
- Files: ${stats.files}
- Other: ${stats.other}
            `.trim();
            
            alert(message);
        }
    }
}

// Create and export storage instance
const storage = new Storage();
window.storage = storage; // For debugging

export { storage };
