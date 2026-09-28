import { useState } from 'react';
import { preview } from '../../../../skills/verdikta-discover/scripts/preview-core.mjs';
import claims from '../../../../skills/verdikta-discover/examples/source-check-v1.request.json';
import pack from '../../../../skills/verdikta-discover/examples/evidence-pack-v1.request.json';
import './BuyerPreview.css';

export default function BuyerPreview() {
  const [kind, setKind] = useState('source-check-v1');
  const [text, setText] = useState(JSON.stringify(claims, null, 2));
  const [mode, setMode] = useState('UNSELECTED');
  const [target, setTarget] = useState('');
  const [sharing, setSharing] = useState(false);
  const [local, setLocal] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState('');
  function assess(event) {
    event.preventDefault(); setError(''); setAssessment(null);
    try { setAssessment(preview({ template_id: kind, request: JSON.parse(text), sharing_authorized: sharing, local_sufficient: local, procurement_mode: mode, targetHunter: mode === 'TARGETED' ? target : null })); }
    catch { setError('Enter a valid JSON request. Nothing has been uploaded.'); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(assessment, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'work-order-draft.json'; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="agents-section buyer-preview" id="buyer-preview">
    <h2>Need outside help for a bounded digital task?</h2>
    <p>Preview a work order for up to 20 technical claims or 50 entity-field evidence cells.
      No wallet, API key, upload or spending is required. This form runs locally in your browser.</p>
    <p>Verdikta provides independently evaluated settlement. Commissioning later requires a real supplier agreement,
      explicit funding authorization and a separate transaction review. Supplier availability, price and delivery time are unknown.</p>
    <form onSubmit={assess}>
      <label>Service template <select value={kind} onChange={e => {
        setKind(e.target.value); setText(JSON.stringify(e.target.value === 'source-check-v1' ? claims : pack, null, 2)); setAssessment(null);
      }}>
        <option value="source-check-v1">Technical Claim Source Check</option>
        <option value="evidence-pack-v1">Bounded Evidence Pack</option>
      </select></label>
      <label>Supplier selection <select value={mode} onChange={e => { setMode(e.target.value); setAssessment(null); }}>
        <option value="UNSELECTED">Decide later</option>
        <option value="TARGETED">Target a known supplier</option>
        <option value="OPEN">Intentionally open to submissions</option>
      </select></label>
      {mode === 'TARGETED' && <label>Known supplier wallet address
        <input type="text" value={target} onChange={e => { setTarget(e.target.value); setAssessment(null); }} placeholder="0x…" />
      </label>}
      <p>The prefilled request is a synthetic example. Replace it with your bounded request. A documented unresolved answer is valid; fabricated evidence is not.</p>
      <label>Describe the deliverable (request JSON)
        <textarea rows={14} value={text} onChange={e => { setText(e.target.value); setAssessment(null); }} spellCheck={false} />
      </label>
      <label><input type="checkbox" checked={sharing} onChange={e => { setSharing(e.target.checked); setAssessment(null); }} /> Inputs are public, non-sensitive and approved for external sharing. This grants no spending authority.</label>
      <label><input type="checkbox" checked={local} onChange={e => { setLocal(e.target.checked); setAssessment(null); }} /> My available local tools and sources already meet the need.</label>
      <button type="submit" className="btn btn-primary">Preview a work order</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {assessment && <div aria-live="polite">
      <h3>{assessment.quote_status}: {assessment.decision}</h3>
      <p>{assessment.reason}</p>
      <p>Procurement: {assessment.procurement.mode}{assessment.procurement.targetHunter ? ` — ${assessment.procurement.targetHunter}` : ''}</p>
      <p>Supplier: UNKNOWN · Price: UNKNOWN · Availability: UNKNOWN. No live quote or funding authorization exists.</p>
      {assessment.inputs_needed.length > 0 && <ul>{assessment.inputs_needed.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      <p>{assessment.next_action}</p>
      <details><summary>Deliverable, criteria and commissioning requirements</summary><pre>{JSON.stringify(assessment, null, 2)}</pre></details>
      <button type="button" onClick={download}>Save draft locally</button>
    </div>}
  </section>;
}
