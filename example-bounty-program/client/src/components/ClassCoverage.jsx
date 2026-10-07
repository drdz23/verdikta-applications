import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Server } from 'lucide-react';
import { apiService } from '../services/api';
import './ClassCoverage.css';

/**
 * Live arbiter coverage for the class picked in the create wizard, read from the
 * on-chain registry (GET /api/classes/:classId/coverage). Classes are
 * permissionless, so any class ID can be chosen; this shows whether arbiters can
 * actually serve it at the bounty's fee before the creator funds anything.
 *
 * @param {number} props.classId
 * @param {string} [props.maxOracleFee] decimal ETH; arbiters priced above it can't be selected
 * @param {(result: {servable: boolean|null, listed: boolean|null}) => void} [props.onResult]
 */
export default function ClassCoverage({ classId, maxOracleFee, onResult }) {
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    if (!classId) return undefined;
    let cancelled = false;
    setState({ loading: true, data: null });
    // Debounced: the fee field changes on every keystroke.
    const timer = setTimeout(async () => {
      let data = null;
      try {
        data = await apiService.getClassCoverage(classId, maxOracleFee);
      } catch {
        data = null; // older server without the endpoint, or a network error: say nothing
      }
      if (cancelled) return;
      setState({ loading: false, data });
      onResult?.({ servable: data ? data.servable : null, listed: data ? data.listed : null });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // onResult is a callback prop; re-running on its identity would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, maxOracleFee]);

  const { loading, data } = state;
  if (loading) {
    return (
      <div className="class-coverage muted" role="status">
        <Loader2 size={14} className="spin" /> Checking arbiters for class {classId}…
      </div>
    );
  }
  if (!data) return null;

  const { coverage, servable, refusal, warnings = [], listed } = data;
  const unlistedNote = listed === false && (
    <p className="class-coverage-note">
      Class {classId} isn&apos;t in the Verdikta class registry. That&apos;s allowed: anyone can run arbiters for a new
      class. Enter the provider and model (or tool) identifiers its arbiter operators advertise below. They can&apos;t be
      checked here, and a bounty can&apos;t be edited after it&apos;s created.
    </p>
  );

  if (servable === false) {
    return (
      <div className="class-coverage error" role="alert" data-testid="class-coverage">
        {unlistedNote}
        <p><AlertTriangle size={14} className="inline-icon" /> {refusal}</p>
      </div>
    );
  }

  if (!coverage?.checked) {
    return (
      <div className="class-coverage muted" data-testid="class-coverage">
        {unlistedNote}
        <p>Couldn&apos;t check arbiter coverage for class {classId} right now.</p>
      </div>
    );
  }

  const operators = coverage.distinctOwnersEligible;
  return (
    <div className={`class-coverage ${warnings.length ? 'warning' : 'ok'}`} data-testid="class-coverage">
      {unlistedNote}
      <p className="class-coverage-summary">
        {warnings.length ? <Server size={14} className="inline-icon" /> : <CheckCircle size={14} className="inline-icon" />}{' '}
        <strong>{coverage.eligibleCount}</strong> arbiter{coverage.eligibleCount === 1 ? '' : 's'} can serve class {classId}
        {' '}at a {coverage.maxOracleFeeEth} ETH fee limit, run by <strong>{operators}</strong> operator{operators === 1 ? '' : 's'}.
      </p>
      {warnings.length > 0 && (
        <ul className="class-coverage-warnings">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
