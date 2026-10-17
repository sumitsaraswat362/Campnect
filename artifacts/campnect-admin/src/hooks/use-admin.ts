import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchMeta } from '@/lib/api';

// Types
export interface DashboardSummary {
  users: { total: number; verified: number; active_7d: number };
  content: { posts: number; communities: number };
  queues: { pending_verifications: number; pending_reports: number };
}

export interface Account {
  id: string;
  email: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  bio?: string;
  skills?: string;
  relationship_status?: string;
  college_name?: string;
  verification_status: string;
  is_college_verified?: boolean;
  is_suspended: boolean;
  is_banned: boolean;
  is_shadowbanned: boolean;
  warnings_count: number;
  last_seen: string;
  created_at: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
}

export interface AccountDetailsResponse {
  user: Account;
  posts?: any[];
  comments?: any[];
  events?: any[];
  stories?: any[];
  reports?: any[];
  moderation_actions?: any[];
}

export interface Report {
  id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  status: string;
  created_at: string;
  description?: string;
  reporter_username?: string;
  reporter_name?: string;
}

export interface ReportDetail {
  report: Report;
  target: Record<string, any> | null;
  media: Array<{ id: string; purpose: string; mime_type: string; original_name?: string; byte_size?: number }>;
}

export interface Appeal {
  id: string;
  user_id: string;
  username?: string;
  full_name?: string;
  status: 'pending' | 'assigned' | 'under_review' | 'need_more_information' | 'approved' | 'rejected' | 'expired';
  evidence: string;
  decision?: string;
  moderator_notes?: string;
  submitted_at: string;
  decided_at?: string;
  category?: string;
  target_type?: string;
  target_id?: string;
  operation?: 'create' | 'edit' | string;
  parent_id?: string | null;
  comment_content?: string;
  comment_text?: string;
  target_content?: string;
  post_type?: string;
  post_content?: string;
}

export interface CommentReviewSubmission {
  id: string;
  user_id: string;
  post_id: string;
  parent_id?: string | null;
  target_comment_id?: string | null;
  operation: 'create' | 'edit' | string;
  content_text: string;
  category: string;
  severity: string;
  decision: string;
  review_resolution?: string | null;
  created_at: string;
  target_username?: string | null;
  target_name?: string | null;
  post_content?: string | null;
  parent_content?: string | null;
}

export interface ModerationCase {
  id: string;
  case_type: string;
  category: string;
  target_type: string;
  target_id: string;
  status: string;
  priority: string;
  summary?: string;
  target_username?: string | null;
  target_name?: string | null;
  created_at: string;
  updated_at?: string;
  submission?: CommentReviewSubmission | null;
  comment_submission?: CommentReviewSubmission | null;
  commentSubmission?: CommentReviewSubmission | null;
  notes?: unknown[];
  actions?: unknown[];
  reports?: unknown[];
  appeals?: unknown[];
}

export interface VerificationRequest {
  id: string;
  user_id: string;
  username?: string;
  full_name?: string;
  verification_type?: string;
  status: string;
  submitted_at?: string;
  created_at?: string;
  notes?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  reason?: string;
  created_at: string;
  admin_id: string;
}

export interface ContentModItem {
  id: string;
  content_type?: string;
  type?: string;
  content?: string;
  status?: string;
  created_at: string;
  [key: string]: any;
}

// Hooks
export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiFetch('/v1/admin/dashboard/summary'),
  });
}

export function useAccounts(params: { q?: string; status?: string; page?: number; limit?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status) search.set('status', params.status);
  if (params.page) search.set('page', params.page.toString());
  if (params.limit) search.set('limit', params.limit.toString());
  
  return useQuery({
    queryKey: ['accounts', params],
    queryFn: () => apiFetchMeta<Account[]>(`/v1/admin/users?${search.toString()}`),
  });
}

export function useAccount(id: string) {
  return useQuery<AccountDetailsResponse>({
    queryKey: ['account', id],
    queryFn: () => apiFetch(`/v1/admin/users/${id}`),
    enabled: !!id,
  });
}

export function useAccountAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: string; reason?: string }) => 
      apiFetch(`/v1/admin/users/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['account', variables.id] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    }
  });
}

export function usePermanentDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmationUsername, reason }: { id: string; confirmationUsername: string; reason: string }) =>
      apiFetch(`/v1/admin/users/${id}/permanent`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmation_username: confirmationUsername, reason }),
      }),
    onSuccess: (_, variables) => {
      qc.removeQueries({ queryKey: ['account', variables.id] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useShadowban() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active, reason }: { id: string; active: boolean; reason?: string }) => 
      apiFetch(`/v1/admin/users/${id}/shadowban`, {
        method: 'PATCH',
        body: JSON.stringify({ active, reason })
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['account', variables.id] });
    }
  });
}

export function useReports(params: { page?: number; limit?: number } = {}) {
  const search = new URLSearchParams({
    status: 'pending',
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 25),
  });
  return useQuery({
    queryKey: ['reports', 'pending', params.page ?? 1, params.limit ?? 25],
    queryFn: () => apiFetchMeta<Report[]>(`/v1/admin/reports?${search.toString()}`),
  });
}

export function useReport(id: string) {
  return useQuery<ReportDetail>({
    queryKey: ['report', id],
    queryFn: () => apiFetch(`/v1/admin/reports/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) => 
      apiFetch(`/v1/admin/reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, resolution_reason: reason, reason })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
    }
  });
}

export function useAppeals(params: { status?: string; page?: number; limit?: number } = {}) {
  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 50),
  });
  if (params.status && params.status !== 'all') search.set('status', params.status);
  return useQuery({
    queryKey: ['appeals', params],
    queryFn: () => apiFetchMeta<Appeal[]>(`/v1/admin/appeals?${search.toString()}`),
  });
}

export function useUpdateAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason, decision, moderator_notes }: {
      id: string; status: Appeal['status']; reason: string; decision?: string; moderator_notes?: string;
    }) => apiFetch<Appeal>(`/v1/admin/appeals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason, decision, moderator_notes }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appeals'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['account'] });
    },
  });
}

export function useCases(
  params: { status?: string; category?: string; page?: number; limit?: number } = {},
  enabled = true,
) {
  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 50),
  });
  if (params.status && params.status !== 'all') search.set('status', params.status);
  if (params.category) search.set('category', params.category);
  return useQuery({
    queryKey: ['cases', params],
    queryFn: () => apiFetchMeta<ModerationCase[]>(`/v1/admin/cases?${search.toString()}`),
    enabled,
  });
}

export function useCase(id: string, enabled = true) {
  return useQuery<ModerationCase>({
    queryKey: ['case', id],
    queryFn: () => apiFetch(`/v1/admin/cases/${encodeURIComponent(id)}`),
    enabled: Boolean(id) && enabled,
  });
}

export function useResolveCommentReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, reason }: {
      id: string;
      decision: 'approved' | 'rejected';
      reason: string;
    }) => apiFetch(`/v1/admin/cases/${encodeURIComponent(id)}/comment-review`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, reason }),
    }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['case', variables.id] });
      qc.invalidateQueries({ queryKey: ['appeals'] });
    },
  });
}

export function useVerificationRequests() {
  return useQuery<VerificationRequest[]>({
    queryKey: ['verifications', 'pending'],
    queryFn: () => apiFetch('/v1/admin/verifications?status=pending'),
  });
}

export function useReviewVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, review_notes }: { id: string; status: 'approved' | 'rejected'; review_notes?: string }) =>
      apiFetch(`/v1/admin/verifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, review_notes }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['verifications'] }),
  });
}

export function useUpdateUsername() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, username, reason }: { id: string; username: string; reason: string }) =>
      apiFetch(`/v1/admin/users/${id}/username`, {
        method: 'PATCH',
        body: JSON.stringify({ username, reason }),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['account', variables.id] });
    },
  });
}

export function useCollegeVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verified, reason }: { id: string; verified: boolean; reason: string }) =>
      apiFetch(`/v1/admin/users/${id}/${verified ? 'verify' : 'unverify'}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['account', variables.id] });
      qc.invalidateQueries({ queryKey: ['verifications'] });
    },
  });
}

export function useContentModeration() {
  return useQuery<ContentModItem[]>({
    queryKey: ['content-moderation'],
    queryFn: () => apiFetch('/v1/admin/content-moderation'),
  });
}


export function useUpdateContentModeration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, contentType, action, reason }: { id: string; contentType: string; action: string; reason: string }) => 
      apiFetch(`/v1/admin/content/${contentType}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, reason })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-moderation'] });
      qc.invalidateQueries({ queryKey: ['account'] });
      qc.invalidateQueries({ queryKey: ['admin-post'] });
    }
  });
}

export function useAuditLogs() {
  return useQuery<AuditLog[]>({
    queryKey: ['audit'],
    queryFn: () => apiFetch('/v1/admin/audit'),
  });
}

export function useSystemHealth() {
  return useQuery<any>({
    queryKey: ['system', 'health'],
    queryFn: () => apiFetch('/v1/admin/system/health'),
  });
}

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  updatedAt: string;
}

export function useMaintenanceStatus() {
  return useQuery<MaintenanceState>({
    queryKey: ['system', 'maintenance'],
    queryFn: () => apiFetch('/v1/admin/system/maintenance'),
  });
}

export function useSetMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ enabled, message, reason }: { enabled: boolean; message: string; reason?: string }) =>
      apiFetch('/v1/admin/system/maintenance', {
        method: 'PATCH',
        body: JSON.stringify({ enabled, message, reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system', 'maintenance'] });
    },
  });
}

export interface AppUpdateState {
  enabled: boolean;
  mode: 'soft' | 'force';
  title: string;
  message: string;
  storeUrl: string;
  minimumVersionCode: number;
  updatedAt: string;
}

export function useAppUpdateStatus() {
  return useQuery<AppUpdateState>({
    queryKey: ['system', 'app-update'],
    queryFn: () => apiFetch('/v1/admin/system/app-update'),
  });
}

export function useSetAppUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<AppUpdateState, 'updatedAt'> & { reason?: string }) =>
      apiFetch('/v1/admin/system/app-update', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system', 'app-update'] });
    },
  });
}
