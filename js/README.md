# JavaScript Module Structure

This directory contains the modularized JavaScript code for the SAHIE Map Visualization application. The code has been organized into logical modules for better maintainability and readability.

## Module Overview

### 1. `config.js` - Configuration and Constants
- **Purpose**: Centralized configuration and global state management
- **Contains**: 
  - Global state variables (mapLevel, dataLayer, selectedYear, etc.)
  - State FIPS mapping
  - FIPS name cache
  - Configuration getters and setters

### 2. `dom-references.js` - DOM Element References
- **Purpose**: Centralized DOM element references
- **Contains**: 
  - All DOM element references used across the application
  - Exported as `window.DOMRefs` for use by other modules

### 3. `data-manager.js` - Data Management
- **Purpose**: Handles all data fetching and processing
- **Contains**:
  - CDC PLACES data integration
  - SAHIE data fetching
  - Data processing and transformation functions
  - Color calculation functions
  - Legend management

### 4. `map-manager.js` - Map Management
- **Purpose**: Handles Leaflet map initialization and rendering
- **Contains**:
  - Map initialization
  - Map rendering with data visualization
  - Custom zoom controls
  - Map styling functions

### 5. `scatterplot-manager.js` - Scatterplot Visualization
- **Purpose**: Handles scatterplot creation and interactions
- **Contains**:
  - Scatterplot data building
  - Scatterplot rendering with D3-like functionality
  - Zoom and pan interactions
  - Point highlighting
  - Correlation calculations

### 6. `analytics-manager.js` - Analytics Panel
- **Purpose**: Manages the analytics panel and statistics
- **Contains**:
  - Statistics calculations
  - Analytics panel updates
  - Data summarization functions
  - Top/bottom rankings

### 7. `ui-controls.js` - UI Controls and Event Handlers
- **Purpose**: Manages all UI interactions and event handling
- **Contains**:
  - Search functionality
  - Event handlers for all controls
  - View mode management
  - Application initialization

### 8. `app.js` - Main Application Entry Point
- **Purpose**: Application initialization and coordination
- **Contains**:
  - DOM ready event handler
  - Application startup sequence

## Module Dependencies

```
app.js
├── config.js (loaded first)
├── dom-references.js (loaded second)
├── data-manager.js (depends on config, dom-references)
├── map-manager.js (depends on config, dom-references, data-manager)
├── scatterplot-manager.js (depends on config, dom-references, data-manager)
├── analytics-manager.js (depends on config, dom-references, data-manager)
└── ui-controls.js (depends on all above modules)
```

## Global Objects

Each module exports its functionality to the global scope:

- `window.AppConfig` - Configuration and state management
- `window.DOMRefs` - DOM element references
- `window.DataManager` - Data management functions
- `window.MapManager` - Map management functions
- `window.ScatterplotManager` - Scatterplot functions
- `window.AnalyticsManager` - Analytics functions
- `window.UIControls` - UI control functions

## Benefits of This Structure

1. **Separation of Concerns**: Each module has a single responsibility
2. **Maintainability**: Easier to locate and modify specific functionality
3. **Reusability**: Modules can be easily reused or replaced
4. **Debugging**: Easier to debug specific functionality
5. **Collaboration**: Multiple developers can work on different modules
6. **Testing**: Individual modules can be tested in isolation

## Usage

The modules are automatically loaded in the correct order via the HTML file. The application initializes when the DOM is ready, and all modules work together seamlessly.

## Future Enhancements

- Consider using ES6 modules with import/export
- Add TypeScript for better type safety
- Implement unit tests for each module
- Add module-level documentation with JSDoc


