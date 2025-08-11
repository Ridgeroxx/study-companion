# Study Companion

## Overview

Study Companion is a client-side Progressive Web Application (PWA) designed to help users study religious literature, take notes, and prepare for meetings. The application provides comprehensive tools for EPUB reading, note-taking, scripture reference management, meeting scheduling, and convention planning. All data is stored locally using IndexedDB, ensuring complete offline functionality and user privacy.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Pure Web Technologies**: Built with vanilla HTML5, CSS3, and ES6 JavaScript modules to ensure lightweight performance and broad compatibility
- **Hybrid UI Framework**: Combines Bootstrap 5 for component structure with Tailwind CSS for utility styling (with preflight disabled to prevent conflicts)
- **Module-Based Architecture**: Organized into specialized ES6 modules (app.js, storage.js, reader.js, notes.js, scripture.js, search.js, schedule.js, exporter.js) for maintainable code separation
- **Single Page Application**: Dynamic content switching without page reloads, managed by a central routing system

### Data Storage Strategy
- **Local-First Design**: All user data remains on the device using IndexedDB through localForage abstraction
- **Offline Capability**: Complete functionality without internet connectivity after initial load
- **Data Persistence**: Stores EPUB files, annotations, meeting notes, convention sessions, user settings, and search indexes locally
- **Migration System**: Built-in schema versioning for future data structure updates

### EPUB Reading System
- **epub.js Integration**: Uses epub.js library for rendering EPUB files with CFI (Canonical Fragment Identifier) support
- **Annotation Anchoring**: Highlights and notes are anchored to specific text locations using CFI for reliable positioning
- **Text Selection**: Modal-based annotation creation with tag support and automatic highlight persistence
- **Multi-Book Support**: Can handle multiple EPUB files with per-book annotation storage

### Scripture Reference Engine
- **Multi-Language Support**: Handles English and Spanish scripture abbreviations and formats
- **Flexible Parsing**: Recognizes various formats (ranges, multiple verses, different punctuation styles)
- **Bible Integration**: Optional Bible EPUB import with automatic chapter indexing for quick reference
- **Normalization System**: Converts various abbreviation formats to canonical book IDs for consistent storage

### Meeting and Convention Management
- **User-Configurable Scheduling**: Flexible meeting times (not fixed to specific days/times)
- **Dynamic Meeting Generation**: Creates upcoming meetings based on user's custom schedule
- **Convention Mode**: Separate planning system for multi-day events with session management
- **Note Templates**: Pre-structured templates for different meeting types with Markdown support

### Search Implementation
- **Client-Side Indexing**: Uses lunr.js for fast, offline search capabilities
- **Multi-Source Search**: Searches across notes, highlights, scripture references, and publication content
- **Cached Indexes**: Persistent search indexes stored locally for improved performance
- **Tabbed Results**: Organized search results by content type (notes, scriptures, publications)

### Progressive Web App Features
- **Service Worker**: Caches static assets for offline functionality
- **Web App Manifest**: Enables installation as a native-like app
- **Responsive Design**: Works across desktop, tablet, and mobile devices
- **Loading States**: Proper loading indicators and error handling throughout the application

## External Dependencies

### Core Libraries
- **Bootstrap 5**: UI component framework for consistent styling and responsive layout
- **Tailwind CSS**: Utility-first CSS framework for custom styling (configured to avoid conflicts)
- **epub.js (v0.3.x)**: EPUB rendering library with CFI support for text anchoring
- **localForage**: IndexedDB abstraction library for simplified local storage operations
- **lunr.js**: Client-side search engine for indexing and searching application content
- **marked.js**: Markdown parser and renderer for meeting notes and rich text content
- **Day.js**: Lightweight date manipulation library with timezone and recurrence plugins

### External Resources
- **Font Awesome**: Icon library for consistent iconography throughout the application
- **CDN Dependencies**: All external libraries loaded via CDN for simplified deployment
- **Bible Reference Data**: Static JSON files containing book names and chapter counts for English and Spanish

### Browser APIs
- **File API**: For EPUB file import functionality
- **IndexedDB**: Primary storage mechanism through localForage abstraction
- **Service Worker API**: For PWA offline capabilities and caching
- **Web App Manifest**: For native app-like installation experience

### Optional Integrations
- **PWA Features**: Can be toggled on/off, including service worker registration and manifest
- **Multiple Language Support**: Extensible translation system for UI localization
- **Convention Planning**: Optional feature that can be enabled/disabled per user preference