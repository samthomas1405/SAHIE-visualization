/**
 * Bayesian AR(1) with linear trend; Metropolis-Hastings posterior + predictive simulation.
 * y_t = mu_t + r_t, mu_t = alpha + beta * (t - t0), r_t = phi * r_{t-1} + eps_t.
 * Innovations: Student-t (nu=5) by default for robustness to occasional SAHIE shocks; Gaussian optional.
 * Priors: alpha ~ N(75, 20^2), beta ~ N(0, 2^2), phi ~ Uniform(-a,a) via tanh reparam, sigma ~ HalfNormal(5) via log sigma.
 * Includes stationary marginal for r_0 when |phi| is below a stability threshold.
 */
(function (global) {
  'use strict';

  const PHI_MAX = 0.989;
  const STATIONARY_PHI_CAP = 0.985;
  const DEFAULT_STUDENT_NU = 5;

  /** log Γ(z), z > 0: recurrence to z ≥ 12 then Stirling with 1/(12z) correction. */
  function logGamma(z) {
    if (z <= 0) return Infinity;
    let acc = 0;
    let x = z;
    while (x < 12) {
      acc -= Math.log(x);
      x += 1;
    }
    const invX = 1 / x;
    return (
      acc +
      (x - 0.5) * Math.log(x) -
      x +
      0.5 * Math.log(2 * Math.PI) +
      invX / 12 -
      (invX * invX * invX) / 360
    );
  }

  /** Standard normal / sqrt(Chi2_nu / nu) — integer nu >= 1. */
  function randStudentT(rand, nu) {
    const n = Math.max(1, Math.round(nu));
    const z = randn(rand);
    let w = 0;
    for (let k = 0; k < n; k++) {
      const u = randn(rand);
      w += u * u;
    }
    return z / Math.sqrt(w / n);
  }

  function createRng(seed) {
    let t = seed >>> 0;
    return function rand() {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randn(rand) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function logHalfNormal(sigma, scale) {
    if (sigma <= 1e-9) return -Infinity;
    return (
      Math.log(2) -
      0.5 * Math.log(2 * Math.PI) -
      Math.log(scale) -
      (sigma * sigma) / (2 * scale * scale)
    );
  }

  function logPriorAlphaBeta(alpha, beta) {
    const PRIOR_ALPHA_MEAN = 75;
    const PRIOR_ALPHA_SD = 20;
    const PRIOR_BETA_SD = 2;
    return (
      -0.5 * Math.pow((alpha - PRIOR_ALPHA_MEAN) / PRIOR_ALPHA_SD, 2) -
      0.5 * Math.pow(beta / PRIOR_BETA_SD, 2)
    );
  }

  /** Uniform(-PHI_MAX, PHI_MAX) on phi = PHI_MAX * tanh(etaPhi); Jacobian folded into prior on eta. */
  function logPriorEtaPhi(etaPhi) {
    const t2 = Math.tanh(etaPhi);
    const jac = Math.log(PHI_MAX) + Math.log(Math.max(1e-12, 1 - t2 * t2));
    return -Math.log(2 * PHI_MAX) + jac;
  }

  function logPriorEtaSigma(etaSig, sigmaScale) {
    const sigma = Math.exp(etaSig);
    if (sigma <= 1e-9) return -Infinity;
    return logHalfNormal(sigma, sigmaScale) + etaSig;
  }

  /** Lower bound on innovation scale inside the likelihood avoids +∞ log-density when residuals are ~0. */
  function likSigma(sigma) {
    return Math.max(sigma, 1e-3);
  }

  function logLikelihoodInnovationGaussian(diff, sigma) {
    const se = likSigma(sigma);
    const sig2 = se * se;
    return -0.5 * Math.log(2 * Math.PI * sig2) - (diff * diff) / (2 * sig2);
  }

  /** Student-t observation noise (scale sigma), nu > 2. Heavier tails than Gaussian. */
  function logLikelihoodInnovationStudent(diff, sigma, nu) {
    if (sigma <= 1e-9) return -Infinity;
    const se = likSigma(sigma);
    const halfNu = nu / 2;
    const logConst =
      logGamma((nu + 1) / 2) - logGamma(halfNu) - 0.5 * Math.log(nu * Math.PI) - Math.log(se);
    const z2 = (diff * diff) / (se * se);
    return logConst - ((nu + 1) / 2) * Math.log(1 + z2 / nu);
  }

  /**
   * @param {object} likOpts - { studentT: boolean, nu: number, stationaryInit: boolean }
   */
  function logLikelihood(series, alpha, beta, phi, sigma, likOpts) {
    const opts = likOpts || {};
    const useT = opts.studentT !== false;
    const nu = opts.nu != null ? opts.nu : DEFAULT_STUDENT_NU;
    const stationaryInit = opts.stationaryInit !== false;

    const n = series.length;
    if (n < 3 || sigma <= 1e-9) return -Infinity;
    const t0 = series[0].year;
    const r = series.map((d) => d.value - (alpha + beta * (d.year - t0)));

    const innovLog = useT
      ? (d) => logLikelihoodInnovationStudent(d, sigma, nu)
      : (d) => logLikelihoodInnovationGaussian(d, sigma);

    let ll = 0;

    if (stationaryInit && Math.abs(phi) < STATIONARY_PHI_CAP) {
      const se = likSigma(sigma);
      const v0 = (se * se) / Math.max(1e-8, 1 - phi * phi);
      ll += -0.5 * Math.log(2 * Math.PI * v0) - (r[0] * r[0]) / (2 * v0);
      for (let i = 1; i < n; i++) {
        const diff = r[i] - phi * r[i - 1];
        ll += innovLog(diff);
      }
    } else {
      for (let i = 1; i < n; i++) {
        const diff = r[i] - phi * r[i - 1];
        ll += innovLog(diff);
      }
    }
    return ll;
  }

  function logPosteriorUnconstrained(series, alpha, beta, etaPhi, etaSig, likOpts) {
    const phi = PHI_MAX * Math.tanh(etaPhi);
    const sigma = Math.exp(etaSig);
    let lp =
      logPriorAlphaBeta(alpha, beta) +
      logPriorEtaPhi(etaPhi) +
      logPriorEtaSigma(etaSig, 5) +
      logLikelihood(series, alpha, beta, phi, sigma, likOpts);
    if (!isFinite(lp)) lp = -1e12;
    else lp = Math.min(lp, 1e8);
    return { logP: lp, phi, sigma };
  }

  /** Log posterior at (alpha,beta,phi,sigma) matching default fit (Student-t + stationary init). */
  function logPosterior(series, alpha, beta, phi, sigma) {
    if (Math.abs(phi) >= PHI_MAX) return -Infinity;
    const etaPhi = 0.5 * Math.log((1 + phi / PHI_MAX) / (1 - phi / PHI_MAX));
    const etaSig = Math.log(Math.max(sigma, 1e-9));
    return logPosteriorUnconstrained(series, alpha, beta, etaPhi, etaSig, {
      studentT: true,
      stationaryInit: true,
      nu: DEFAULT_STUDENT_NU
    }).logP;
  }

  function lastResidualFromTrend(series, alpha, beta) {
    const n = series.length;
    const t0 = series[0].year;
    const last = series[n - 1];
    return last.value - (alpha + beta * (last.year - t0));
  }

  function initialGuess(series) {
    const n = series.length;
    const years = series.map((d) => d.year);
    const vals = series.map((d) => d.value);
    const meanV = vals.reduce((s, v) => s + v, 0) / n;
    const meanT = years.reduce((s, y) => s + y, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const dx = years[i] - meanT;
      num += dx * (vals[i] - meanV);
      den += dx * dx;
    }
    const beta = den !== 0 ? num / den : 0;
    const alpha = meanV - beta * meanT;
    const t0 = series[0].year;
    const alpha0 = meanV - beta * (meanT - t0);
    const r = series.map((d) => d.value - (alpha0 + beta * (d.year - t0)));
    let numP = 0;
    let denP = 0;
    for (let i = 1; i < n; i++) {
      numP += r[i] * r[i - 1];
      denP += r[i - 1] * r[i - 1];
    }
    let phi = denP > 1e-9 ? numP / denP : 0;
    phi = Math.max(-0.92, Math.min(0.92, phi));
    let s2 = 0;
    let cnt = 0;
    for (let i = 1; i < n; i++) {
      const e = r[i] - phi * r[i - 1];
      s2 += e * e;
      cnt++;
    }
    const sigma = Math.sqrt(Math.max(0.25, s2 / Math.max(1, cnt)));
    return { alpha: alpha0, beta, phi, sigma: Math.min(12, Math.max(0.25, sigma)) };
  }

  function toInternalState(guess) {
    const phi = Math.max(-PHI_MAX + 1e-4, Math.min(PHI_MAX - 1e-4, guess.phi));
    const etaPhi = 0.5 * Math.log((1 + phi / PHI_MAX) / (1 - phi / PHI_MAX));
    const etaSig = Math.log(Math.max(guess.sigma, 1e-4));
    return { alpha: guess.alpha, beta: guess.beta, etaPhi, etaSig };
  }

  function percentile(arr, p) {
    if (!arr.length) return NaN;
    const a = [...arr].sort((x, y) => x - y);
    const idx = (a.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return a[lo];
    return a[lo] + (a[hi] - a[lo]) * (idx - lo);
  }

  /**
   * @param {Array<{year:number,value:number}>} series - sorted by year
   * @param {object} opts
   */
  function fitAR1Trend(series, opts) {
    const options = opts || {};
    const seed = options.seed != null ? options.seed : 42;
    const nIter = options.nIter != null ? options.nIter : 8000;
    const burnIn = options.burnIn != null ? options.burnIn : 2000;
    const thin = options.thin != null ? options.thin : 5;
    const likOpts = {
      studentT: options.studentT !== false,
      nu: options.studentNu != null ? options.studentNu : DEFAULT_STUDENT_NU,
      stationaryInit: options.stationaryInit !== false
    };

    const sorted = [...series].sort((a, b) => a.year - b.year);
    if (sorted.length < 3) {
      return { samples: [], acceptRate: 0, logPostLast: -Infinity, error: 'Insufficient data' };
    }

    const rand = createRng(seed >>> 0);
    let cur = toInternalState(initialGuess(sorted));
    let post = logPosteriorUnconstrained(sorted, cur.alpha, cur.beta, cur.etaPhi, cur.etaSig, likOpts);
    let logP = post.logP;
    if (!isFinite(logP)) {
      cur = toInternalState({ alpha: 75, beta: 0, phi: 0, sigma: 2 });
      post = logPosteriorUnconstrained(sorted, cur.alpha, cur.beta, cur.etaPhi, cur.etaSig, likOpts);
      logP = post.logP;
    }

    /** Component-wise MH on unconstrained (etaPhi, log sigma); fewer rejections near |phi|→1. */
    let props = { da: 1.6, db: 0.2, detaPhi: 0.35, detaSig: 0.2 };
    let accepts = 0;
    let tries = 0;
    let windowAcc = 0;
    let windowTry = 0;
    const samples = [];

    const mhStep = (next) => {
      tries++;
      windowTry++;
      const prop = logPosteriorUnconstrained(
        sorted,
        next.alpha,
        next.beta,
        next.etaPhi,
        next.etaSig,
        likOpts
      );
      const logPProp = prop.logP;
      if (!isFinite(logPProp) || !isFinite(logP)) return;
      if (Math.log(rand()) < logPProp - logP) {
        cur = next;
        logP = logPProp;
        accepts++;
        windowAcc++;
      }
    };

    for (let iter = 0; iter < nIter; iter++) {
      mhStep({ ...cur, alpha: cur.alpha + randn(rand) * props.da });
      mhStep({ ...cur, beta: cur.beta + randn(rand) * props.db });
      mhStep({ ...cur, etaPhi: cur.etaPhi + randn(rand) * props.detaPhi });
      mhStep({ ...cur, etaSig: cur.etaSig + randn(rand) * props.detaSig });

      if (iter + 1 <= burnIn && (iter + 1) % 200 === 0) {
        const ar = windowTry > 0 ? windowAcc / windowTry : 0;
        windowAcc = 0;
        windowTry = 0;
        const scale = ar < 0.23 ? 0.92 : ar > 0.44 ? 1.08 : 1;
        props.da *= scale;
        props.db *= scale;
        props.detaPhi *= scale;
        props.detaSig *= scale;
        props.da = Math.max(0.06, Math.min(5.5, props.da));
        props.db = Math.max(0.015, Math.min(1.0, props.db));
        props.detaPhi = Math.max(0.08, Math.min(0.65, props.detaPhi));
        props.detaSig = Math.max(0.05, Math.min(0.5, props.detaSig));
      }

      if (iter >= burnIn && (iter - burnIn) % thin === 0) {
        const phi = PHI_MAX * Math.tanh(cur.etaPhi);
        const sigma = Math.exp(cur.etaSig);
        samples.push({
          alpha: cur.alpha,
          beta: cur.beta,
          phi,
          sigma
        });
      }
    }

    return {
      samples,
      acceptRate: tries > 0 ? accepts / tries : 0,
      logPostLast: logP
    };
  }

  function clampPct(x) {
    return Math.max(0, Math.min(100, x));
  }

  /**
   * @param {Array<{year:number,value:number}>} historicalData
   * @param {number} yearsAhead
   * @param {number|null} anchorYearOverride
   * @param {object} opts
   */
  function forecastAR1Trend(historicalData, yearsAhead, anchorYearOverride, opts) {
    const options = opts || {};
    const seed = options.seed != null ? options.seed : 42;
    const FM = typeof ForecastingModels !== 'undefined' ? ForecastingModels : global.ForecastingModels;
    if (!FM || !historicalData || historicalData.length < 3) {
      return { forecast: [], error: 'Insufficient data' };
    }

    const sorted = [...historicalData].sort((a, b) => a.year - b.year);
    const { anchorYear } = FM.resolveAnchorYear(sorted, anchorYearOverride);
    const working = sorted.filter((d) => d.year <= anchorYear);
    if (working.length < 3) {
      return { forecast: [], error: 'Insufficient data' };
    }

    const fit = fitAR1Trend(working, options);
    if (!fit.samples || fit.samples.length === 0) {
      return { forecast: [], error: fit.error || 'MCMC failed' };
    }

    const useT = options.studentT !== false;
    const nu = options.studentNu != null ? options.studentNu : DEFAULT_STUDENT_NU;
    const nuInt = Math.max(2, Math.round(nu));

    const year0 = working[0].year;
    const simRand = createRng((seed + 90210) >>> 0);
    const forecast = [];

    for (let h = 1; h <= yearsAhead; h++) {
      const targetYear = anchorYear + h;
      const preds = [];
      for (let s = 0; s < fit.samples.length; s++) {
        const sample = fit.samples[s];
        let r = lastResidualFromTrend(working, sample.alpha, sample.beta);
        for (let step = 0; step < h; step++) {
          const shock = useT
            ? randStudentT(simRand, nuInt) * sample.sigma
            : randn(simRand) * sample.sigma;
          r = sample.phi * r + shock;
        }
        const mu =
          sample.alpha + sample.beta * (targetYear - year0);
        preds.push(clampPct(mu + r));
      }

      const predicted = percentile(preds, 0.5);
      const lower = percentile(preds, 0.025);
      const upper = percentile(preds, 0.975);

      forecast.push({
        year: targetYear,
        predicted,
        lowerBound: lower,
        upperBound: upper,
        confidence: 0.62,
        method: 'mcmc_ar1'
      });
    }

    return {
      forecast,
      samples: fit.samples,
      acceptRate: fit.acceptRate,
      rSquared: 0.5,
      method: 'mcmc_ar1'
    };
  }

  const McmcForecasting = {
    createRng,
    fitAR1Trend,
    forecastAR1Trend,
    lastResidualFromTrend,
    logPosterior
  };

  const g = typeof globalThis !== 'undefined' ? globalThis : global;
  g.McmcForecasting = McmcForecasting;
})(typeof globalThis !== 'undefined' ? globalThis : this);
