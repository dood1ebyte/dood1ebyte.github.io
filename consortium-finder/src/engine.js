// Consortium Finder engine for the browser (and Node): the compact index from bundle.js, ranked exactly as
// finder.js ranks with { compact }. No network access; the page passes the loaded bundle in.
import { terms } from './text.js';

export const COORDINATOR_WEIGHT = 1.5;

function readVarints(b64) {
  const bin = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64') : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const out = [];
  let v = 0;
  let shift = 0;
  for (const byte of bin) {
    v |= (byte & 127) << shift;
    if (byte & 128) shift += 7;
    else {
      out.push(v >>> 0);
      v = 0;
      shift = 0;
    }
  }
  return out;
}

/** Loads a bundle ({ meta, vocab, docs, projects, orgs, members }) into a searchable engine. */
export function createEngine(bundle, { similar = 50, k1 = 1.2, b = 0.75 } = {}) {
  const { vocab, projects, orgs } = bundle;
  const N = projects.length;
  const postings = new Map(); // term -> [[doc, tf], ...], in document order as bm25() builds them
  const len = new Float64Array(N);
  const ds = readVarints(bundle.docs);
  let pos = 0;
  for (let i = 0; i < N; i++) {
    const n = ds[pos++];
    let id = 0;
    for (let j = 0; j < n; j++) {
      id += ds[pos++];
      const f = ds[pos++];
      const t = vocab[id];
      let p = postings.get(t);
      if (!p) postings.set(t, (p = []));
      p.push([i, f]);
      len[i] += f;
    }
  }
  const avg = len.reduce((s, x) => s + x, 0) / Math.max(1, N);
  const members = [];
  const ms = readVarints(bundle.members);
  pos = 0;
  for (let i = 0; i < N; i++) {
    const n = ms[pos++];
    members.push(ms.slice(pos, pos + n));
    pos += n;
  }
  return {
    meta: bundle.meta,
    countries: [...new Set(orgs.map((o) => o[2]).filter(Boolean))].sort(),
    find(text, { top = 20, country, type, sme } = {}) {
      const scores = new Map();
      for (const w of new Set(terms(text))) {
        const p = postings.get(w);
        if (!p) continue;
        const idf = Math.log(1 + (N - p.length + 0.5) / (p.length + 0.5));
        for (const [i, f] of p) scores.set(i, (scores.get(i) || 0) + idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * len[i]) / avg))));
      }
      const hits = [...scores].map(([i, score]) => ({ i, score })).sort((x, y) => y.score - x.score || x.i - y.i).slice(0, similar);
      const max = hits[0]?.score || 1;
      const ranked = new Map();
      for (const { i, score } of hits) {
        const [pid, acronym, title, start] = projects[i];
        for (const code of members[i]) {
          const [orgId, name, ctry, otype, isSme] = orgs[code >> 1];
          if (country && ctry !== country) continue;
          if (type && otype !== type) continue;
          if (sme && !isSme) continue;
          const coord = (code & 1) === 1;
          let r = ranked.get(orgId);
          if (!r) ranked.set(orgId, (r = { orgId, name, country: ctry, type: otype, sme: Boolean(isSme), score: 0, coordinated: 0, projects: [] }));
          r.score += (score / max) * (coord ? COORDINATOR_WEIGHT : 1);
          if (coord) r.coordinated++;
          r.projects.push({ id: pid, acronym, title, start, role: coord ? 'coordinator' : 'participant', similarity: Math.round((score / max) * 100) / 100 });
        }
      }
      return [...ranked.values()].sort((a, b2) => b2.score - a.score || a.orgId.localeCompare(b2.orgId)).slice(0, top)
        .map((r) => ({ ...r, score: Math.round(r.score * 100) / 100 }));
    },
  };
}
