// Main Application Entry Point
// ============================

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize the map first
    MapManager.initializeMap();
    
    // Initialize the UI controls and event handlers
    UIControls.initializeApp();
    
    // Initialize the predictive modeling panel
    PredictiveManager.initializePredictivePanel();
    
    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Error initializing application:', error);
  }
});

