import { Card, useLabelT } from './kit';
import { useWorkspace } from '../contexts/WorkspaceContext';

/**
 * Route guard — fail-closed when none of `anyOf` match (or when `ownerOnly`).
 * Owner always allowed unless `ownerOnly` is set (then only OWNER).
 * LOADING ≠ ALLOW and ≠ permanent FORBIDDEN — wait for workspace bootstrap.
 */
export default function RequireCapability({ anyOf = [], ownerOnly = false, children }) {
  const lt = useLabelT();
  const { can, membershipType, wsBootstrapping } = useWorkspace();

  if (wsBootstrapping) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3" data-testid="capability-loading">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-ink" />
        <p className="text-[13px] text-ink-soft">{lt('Checking access…')}</p>
      </div>
    );
  }

  const allowed = ownerOnly
    ? membershipType === 'OWNER'
    : (
      membershipType === 'OWNER'
      || (Array.isArray(anyOf) && anyOf.some((k) => can(k)))
    );

  if (!allowed) {
    return (
      <Card className="p-5" data-testid="capability-denied">
        <p className="text-sm font-medium text-ink">
          {lt('Not allowed. Ask your Workspace administrator.')}
        </p>
      </Card>
    );
  }
  return children;
}
