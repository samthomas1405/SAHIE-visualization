/**
 * Pure-JS inference for the global tree ensemble (exported by scripts/train-xgboost-model.mjs).
 * Walks serialized ml-cart regression trees without ml-cart at runtime.
 */
(function (global) {
  /**
   * @param {object} node - serialized TreeNode (leaf has distribution number)
   * @param {number[]} row - feature vector
   */
  function classifyNode(node, row) {
    if (!node) return null;
    if (node.distribution !== undefined && node.distribution !== null && node.left == null && node.right == null) {
      const d = node.distribution;
      return typeof d === 'number' ? d : parseFloat(d) || 0;
    }
    if (node.left != null && node.right != null) {
      const col = node.splitColumn;
      const th = node.splitValue;
      if (row[col] < th) return classifyNode(node.left, row);
      return classifyNode(node.right, row);
    }
    const d = node.distribution;
    return typeof d === 'number' ? d : parseFloat(d) || 0;
  }

  function predictOne(model, features) {
    if (!model || !model.trees || !features) return null;
    let s = model.initialMean != null ? model.initialMean : 0;
    const lr = model.learningRate != null ? model.learningRate : 0.08;
    for (const tr of model.trees) {
      const root = tr && tr.root ? tr.root : tr;
      const v = classifyNode(root, features);
      if (v != null && !isNaN(v)) s += lr * v;
    }
    return Math.max(0, Math.min(100, s));
  }

  global.XGBoostScorer = {
    predictOne,
    classifyNode
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
