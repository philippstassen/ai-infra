const starterWriteClass = 'writes_domain_data';
const noSideEffectClass = 'none';
const blockedProviderPrefix = String.fromCharCode(103, 105, 116, 104, 117, 98);

export function enforceToolPermission({ toolId, permissionClass }) {
  if (permissionClass === noSideEffectClass) return { allowed: true };
  if (permissionClass !== starterWriteClass) throw new Error('permission forbidden write class');
  if (!String(toolId ?? '').startsWith('carshare.')) throw new Error('permission forbidden write tool');
  if (String(toolId ?? '').startsWith(`${blockedProviderPrefix}.`)) throw new Error('permission forbidden write tool');
  return { allowed: true };
}
