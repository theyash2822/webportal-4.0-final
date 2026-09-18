import { useMemo } from 'react';
import ModuleLayout, { SETTINGS_SECTIONS } from './ModuleLayout';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { filterSettingsSections } from '../config/settingsCapabilities';

/** Settings module shell — filters nav sections by workspace capabilities. */
export default function SettingsLayout() {
  const { can, membershipType, invitations } = useWorkspace();
  const pendingInvites = (invitations || []).length;
  const sections = useMemo(() => {
    const filtered = filterSettingsSections(SETTINGS_SECTIONS, can, { membershipType });
    if (!pendingInvites) return filtered;
    return filtered.map((section) => ({
      ...section,
      items: (section.items || []).map((item) => (
        item.to === '/settings/invitations'
          ? { ...item, badge: pendingInvites }
          : item
      )),
    }));
  }, [can, membershipType, pendingInvites]);
  return <ModuleLayout title="Settings" sections={sections} testid="settings-module" />;
}
