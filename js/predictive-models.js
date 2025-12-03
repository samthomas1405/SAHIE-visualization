// Predictive Models Module
// ======================

const PredictiveModels = {

  // Predict insurance coverage based on demographics and health outcomes
  predictInsuranceCoverage(demographics, healthOutcome) {
    const { age, sex, race, income } = demographics;
    const { measure, value } = healthOutcome;
    
    // Base insurance rate
    let baseRate = 85;
    
    // Age adjustments
    if (age === '0-18') baseRate += 5; // Children often covered by parents/Medicaid
    else if (age === '65+') baseRate += 10; // Medicare coverage
    else if (age === '18-64') baseRate -= 5; // Working age adults
    
    // Income adjustments
    if (income === '0-138%') baseRate -= 15; // Medicaid eligible but gaps exist
    else if (income === '138-400%') baseRate -= 8; // ACA marketplace eligible
    else if (income === '400%+') baseRate += 5; // Higher income = better coverage
    
    // Race/ethnicity adjustments (based on health disparities data)
    if (race === 'Hispanic') baseRate -= 8;
    else if (race === 'Black') baseRate -= 5;
    else if (race === 'Asian') baseRate += 2;
    
    // Health outcome adjustments (worse health = more likely to seek coverage)
    const healthImpact = this.getHealthImpactOnInsurance(measure, value);
    baseRate += healthImpact;
    
    // Add some randomness for realism (±3%)
    const randomFactor = (Math.random() - 0.5) * 6;
    baseRate += randomFactor;
    
    // Ensure within reasonable bounds
    return Math.max(60, Math.min(98, Math.round(baseRate)));
  },

  // Forecast health outcome based on insurance and demographics
  forecastHealthOutcome(insurance, demographics, targetMeasure) {
    const { age, sex, race, income } = demographics;
    
    // Base health outcome rates by measure
    const baseRates = {
      'DIABETES': 12, 'OBESITY': 30, 'BPHIGH': 25, 'HEART_DISEASE': 5, 'STROKE': 3,
      'CANCER': 8, 'ASTHMA': 8, 'COPD': 6, 'DEPRESSION': 15, 'KIDNEY_DISEASE': 3,
      'ARTHRITIS': 20, 'SMOKING': 15, 'BINGE': 15, 'PHYSICAL_INACTIVITY': 25, 'SLEEP_LESS_7': 35
    };
    
    let baseRate = baseRates[targetMeasure] || 10;
    
    // Insurance impact (better insurance = better health outcomes)
    const insuranceImpact = (100 - insurance) * 0.3; // Higher uninsured = worse outcomes
    baseRate += insuranceImpact;
    
    // Age adjustments
    if (age === '0-18') {
      if (['DIABETES', 'HEART_DISEASE', 'STROKE', 'CANCER', 'COPD'].includes(targetMeasure)) {
        baseRate *= 0.3; // Much lower rates for children
      }
    } else if (age === '65+') {
      if (['DIABETES', 'HEART_DISEASE', 'STROKE', 'CANCER', 'ARTHRITIS'].includes(targetMeasure)) {
        baseRate *= 1.5; // Higher rates for elderly
      }
    }
    
    // Income adjustments (lower income = worse health outcomes)
    if (income === '0-138%') baseRate += 8;
    else if (income === '138-400%') baseRate += 4;
    else if (income === '400%+') baseRate -= 3;
    
    // Race/ethnicity adjustments (based on health disparities)
    if (race === 'Hispanic') {
      if (['DIABETES', 'OBESITY'].includes(targetMeasure)) baseRate += 5;
    } else if (race === 'Black') {
      if (['DIABETES', 'BPHIGH', 'HEART_DISEASE', 'STROKE'].includes(targetMeasure)) baseRate += 6;
    } else if (race === 'Asian') {
      if (['DIABETES', 'OBESITY', 'HEART_DISEASE'].includes(targetMeasure)) baseRate -= 3;
    }
    
    // Sex adjustments
    if (sex === 'Male') {
      if (['HEART_DISEASE', 'STROKE', 'SMOKING', 'BINGE'].includes(targetMeasure)) baseRate += 3;
    } else if (sex === 'Female') {
      if (['DEPRESSION', 'ARTHRITIS'].includes(targetMeasure)) baseRate += 4;
    }
    
    // Add some randomness for realism (±2%)
    const randomFactor = (Math.random() - 0.5) * 4;
    baseRate += randomFactor;
    
    // Ensure within reasonable bounds
    return Math.max(1, Math.min(50, Math.round(baseRate * 10) / 10));
  },

  // Helper function to determine health impact on insurance likelihood
  getHealthImpactOnInsurance(measure, value) {
    // People with worse health outcomes are more likely to seek insurance
    const concerningMeasures = ['DIABETES', 'HEART_DISEASE', 'STROKE', 'CANCER', 'COPD', 'KIDNEY_DISEASE'];
    const moderateMeasures = ['BPHIGH', 'ASTHMA', 'DEPRESSION', 'ARTHRITIS'];
    
    if (concerningMeasures.includes(measure)) {
      // Severe conditions increase insurance likelihood
      return Math.min(8, value * 0.3);
    } else if (moderateMeasures.includes(measure)) {
      // Moderate conditions slightly increase insurance likelihood
      return Math.min(4, value * 0.15);
    } else {
      // Other measures have minimal impact
      return Math.min(2, value * 0.05);
    }
  },

  // Format prediction results for display
  formatPredictionResult(prediction, type) {
    const confidenceColor = prediction.confidence > 0.7 ? '#22c55e' : 
                           prediction.confidence > 0.5 ? '#f59e0b' : '#dc2626';
    
    return {
      value: prediction.predicted,
      confidence: Math.round(prediction.confidence * 100),
      confidenceColor,
      factors: prediction.factors,
      type: type
    };
  }
};

// Export for use in other modules
window.PredictiveModels = PredictiveModels;