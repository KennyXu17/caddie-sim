/**
 * Entry: ?dashboard=1 -> load dashboard (React, simulator embedded in center).
 * Otherwise -> load original simulator only.
 */
const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
if (params.get('dashboard') === '1') {
  import('/dashboard/src/main.tsx');
} else {
  import('/src/main_sim.js');
}
