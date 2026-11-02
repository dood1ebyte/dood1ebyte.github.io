// Text matching for project descriptions: BM25 over word stems with an inverted index, no model.

// Function words and grant boilerplate that say nothing about a project's subject.
const STOP = new Set(`the and for with from into of on or to by an as at be is are this that its these those their
which will can also has have been was were not but all new more most such using use used based through between within
than other each both well while where when who what how about over under they them our we it in a
project projects proposal research innovation innovative develop development developed developing approach
approaches aim aims objective objectives activities activity results result impact impacts work package european
europe eu horizon action actions call topic partners partner consortium programme program towards key main
novel solutions solution provide providing support supporting state art level levels high including include`
  .split(/\s+/));

/** Lower-case, accent-free word stems of at least three letters, with a light English suffix strip. */
export function terms(text) {
  return String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w))
    .map((w) => (w.length > 5 ? w.replace(/(ations|ation|ings|ing|ies|es|s)$/, '') : w));
}

/** Term frequencies of a text, or of an already tokenized document ([term, ...] or Map term -> tf). */
const termFreq = (t) => {
  if (t instanceof Map) return t;
  const tf = new Map();
  for (const w of Array.isArray(t) ? t : terms(t)) tf.set(w, (tf.get(w) || 0) + 1);
  return tf;
};

/**
 * Keeps each document's `k` highest TF-IDF terms (a compact index small enough to ship to a browser).
 * Returns Maps term -> tf.
 */
export function compactDocs(texts, k = 40) {
  const tfs = texts.map(termFreq);
  const df = new Map();
  for (const tf of tfs) for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  const N = tfs.length;
  return tfs.map((tf) => new Map([...tf].map(([w, f]) => [w, f, f * Math.log(N / df.get(w))])
    .sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1)).slice(0, k).map(([w, f]) => [w, f])));
}

/** BM25 index over texts (or tokenized documents); `search(query, k)` returns the top k as [{ i, score }]. */
export function bm25(texts, { k1 = 1.2, b = 0.75 } = {}) {
  const postings = new Map(); // term -> [[doc, tf], ...]
  const len = new Float64Array(texts.length);
  texts.forEach((t, i) => {
    const tf = termFreq(t);
    let n = 0;
    for (const [w, f] of tf) {
      n += f;
      let p = postings.get(w);
      if (!p) postings.set(w, (p = []));
      p.push([i, f]);
    }
    len[i] = n;
  });
  const avg = len.reduce((s, x) => s + x, 0) / Math.max(1, texts.length);
  const N = texts.length;
  return {
    size: N,
    search(query, k = 50, { exclude } = {}) {
      const scores = new Map();
      for (const w of new Set(terms(query))) {
        const p = postings.get(w);
        if (!p) continue;
        const idf = Math.log(1 + (N - p.length + 0.5) / (p.length + 0.5));
        for (const [i, f] of p) {
          if (exclude && exclude(i)) continue;
          scores.set(i, (scores.get(i) || 0) + idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * len[i]) / avg))));
        }
      }
      return [...scores].map(([i, score]) => ({ i, score })).sort((x, y) => y.score - x.score || x.i - y.i).slice(0, k);
    },
  };
}
