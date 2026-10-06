import { useEffect, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { apiService } from '../services/api';
import { classMapService } from '../services/classMapService';

/**
 * What a hunter should know about who can judge this bounty, shown in the jury
 * section of the bounty and submit pages. Silent for the common case (a registry
 * class served by several operators); speaks up when:
 *  - the class is outside the Verdikta class registry (allowed, but the jury
 *    can't have been checked against a model list),
 *  - one operator runs every arbiter that can evaluate it, or
 *  - the bounty's creator operates some of those arbiters.
 * Facts come from GET /api/jobs/:id/oracle-check (on-chain arbiter registry).
 *
 * @param {string|number} props.jobId
 * @param {number} props.classId
 */
export default function ClassTrustNote({ jobId, classId }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (jobId == null || classId == null) return undefined;
    let cancelled = false;
    (async () => {
      let check = null;
      try {
        check = await apiService.getOracleCheck(jobId);
      } catch {
        check = null;
      }
      // Servers without classListed on oracle-check: ask the class endpoint.
      let listed = check?.classListed;
      if (listed === undefined) {
        try {
          listed = (await classMapService.getAvailableModels(classId)).status !== 'CUSTOM';
        } catch {
          listed = null;
        }
      }
      if (!cancelled) setInfo({ check: check?.available ? check : null, listed });
    })();
    return () => { cancelled = true; };
  }, [jobId, classId]);

  if (!info) return null;
  const { check, listed } = info;
  const eligible = check?.eligibleCount;
  const operators = check?.distinctOwnersEligible;
  const creatorOperated = check?.creatorOperatedCount || 0;
  const singleOperator = check && eligible > 0 && operators === 1;

  const lines = [];
  if (listed === false) {
    lines.push(
      `Custom class ${classId}: it isn't in the Verdikta class registry, so this jury wasn't checked against a model list.` +
      (check ? ` ${eligible} arbiter${eligible === 1 ? '' : 's'} can evaluate it, run by ${operators} operator${operators === 1 ? '' : 's'}.` : '')
    );
  } else if (singleOperator) {
    lines.push(`All ${eligible} arbiter${eligible === 1 ? '' : 's'} that can evaluate class ${classId} are run by one operator.`);
  }
  if (creatorOperated > 0) {
    lines.push(`The bounty's creator operates ${creatorOperated} of the ${eligible} arbiter${eligible === 1 ? '' : 's'} that can evaluate it.`);
  }
  if (lines.length === 0) return null;

  const caution = creatorOperated > 0 || singleOperator;
  return (
    <div className={`class-trust-note ${caution ? 'caution' : ''}`} data-testid="class-trust-note">
      {caution ? <AlertTriangle size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}
      <div>
        {lines.map((line) => <p key={line}>{line}</p>)}
      </div>
    </div>
  );
}
