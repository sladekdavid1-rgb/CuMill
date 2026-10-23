// Knihovna výsledků testů: materiál + nástroj → osvědčené F, zanoření, S, krok, hloubka.
const LS = 'cumill.materials.v1';
const listeners = new Set();
function load() { try { const a = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function store(a) { try { localStorage.setItem(LS, JSON.stringify(a)); } catch { } for (const f of listeners) try { f(); } catch { } }
export const onChange = f => listeners.add(f);
export const list = () => load().sort((a, b) => (a.material || '').localeCompare(b.material || '', 'cs') || b.t - a.t);
export const byTool = toolId => list().filter(r => r.toolId === toolId);
export const names = () => [...new Set(load().map(r => r.material).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
// nejnovější záznam pro materiál a nástroj
export const best = (material, toolId) => load().filter(r => r.toolId === toolId && (r.material || '').toLowerCase() === (material || '').trim().toLowerCase()).sort((a, b) => b.t - a.t)[0] || null;
export function add(rec) { const a = load(); const r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: Date.now(), ...rec }; a.push(r); store(a); return r; }
export function update(id, patch) { const a = load(); const r = a.find(x => x.id === id); if (r) Object.assign(r, patch); store(a); }
export function remove(id) { store(load().filter(r => r.id !== id)); }
