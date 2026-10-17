const fs = require('fs');
const file = 'artifacts/campnect-admin/src/hooks/use-admin.ts';
let code = fs.readFileSync(file, 'utf8');

const hookCode = `
export function useUpdateContentModeration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, contentType, action, reason }: { id: string; contentType: string; action: string; reason: string }) => 
      apiFetch(\`/v1/admin/content/\${contentType}/\${id}\`, {
        method: 'PATCH',
        body: JSON.stringify({ action, reason })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-moderation'] });
    }
  });
}
`;

if (!code.includes('useUpdateContentModeration')) {
  code = code.replace(/export function useAuditLogs\(\) {/, hookCode + '\nexport function useAuditLogs() {');
  fs.writeFileSync(file, code, 'utf8');
}
