import { create } from 'zustand'
import { DEMO_MODE, DEMO_AUTH_KEY } from '../demo/config'
import { persist } from 'zustand/middleware'
import client from '../api/client'
import { syncOneSignalUser } from '../capacitor/oneSignal'
import { clearAuthenticatedMediaCache, setAuthenticatedMediaScope } from '../hooks/useAuthMedia'
import { clearContentCache } from '../cache/contentCache'

export interface AuthUser {
  id: string
  email: string
  username: string
  full_name: string
  avatar_url?: string
  cover_url?: string
  college_name?: string
  college_id?: string
  department?: string
  course?: string
  institute_post?: string
  semester?: number
  year?: number
  bio?: string
  interests?: string
  skills?: string
  social_links?: string
  relationship_status?: 'single' | 'mingle' | 'hidden'
  is_email_verified: number
  is_college_verified: number
  verification_status?: string
  is_admin?: number
  admin_role?: string | null
  admin_permissions?: string[]
  is_private?: number
  who_can_message?: string
  account_type?: string
  user_role?: 'student' | 'teacher' | 'faculty'
  is_suspended?: number
  suspension_reason?: string
  suspension_ends_at?: string
  warnings_count?: number
  followers_count?: number
  following_count?: number
  posts_count?: number
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  refreshToken: string | null

  // Derived convenience
  isAuthenticated: boolean
  isEmailVerified: boolean
  isCollegeVerified: boolean

  // Actions
  login: (identifier: string, password: string) => Promise<void>
  signup: (data: { email: string; password: string; full_name: string; policy_accepted: true }) => Promise<{ email: string; collegeName: string }>
  verifyEmail: (email: string, otp: string) => Promise<void>
  verifyLogin: (email: string, otp: string) => Promise<void>
  logout: () => void
  setUser: (user: AuthUser) => void
  updateUserMedia: (media: Pick<AuthUser, 'avatar_url' | 'cover_url'>) => void
  setTokens: (token: string, refreshToken: string) => void
  setVerificationStatus: (status: { isEmailVerified?: boolean; isCollegeVerified?: boolean; verificationStatus?: string }) => void
  refreshUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isEmailVerified: false,
      isCollegeVerified: false,

      login: async (identifier, password) => {
        // Keep `email` for older API deployments while the current API uses
        // the more accurate identifier field for email-or-username login.
        const res = await client.post('/auth/login', { identifier, email: identifier, password })
        if (res.data?.code === 'LOGIN_OTP_REQUIRED') {
          const error = new Error('A login code was sent to your email.')
          Object.assign(error, { response: { data: res.data, status: res.status } })
          throw error
        }
        const { token, refreshToken, user } = res.data.data
        set({
          token,
          refreshToken,
          user,
          isAuthenticated: true,
          isEmailVerified: Boolean(user.is_email_verified),
          isCollegeVerified: Boolean(user.is_college_verified),
        })
      },

      signup: async (data) => {
        const res = await client.post('/auth/signup', data)
        return {
          email: res.data.data.email,
          collegeName: res.data.data.collegeName || '',
        }
      },

      verifyEmail: async (email, otp) => {
        const res = await client.post('/auth/verify-email', { email, otp })
        const { token, refreshToken, user } = res.data.data
        set({
          token,
          refreshToken,
          user,
          isAuthenticated: true,
          isEmailVerified: true,
          isCollegeVerified: Boolean(user.is_college_verified),
        })
      },

      verifyLogin: async (email, otp) => {
        const res = await client.post('/auth/verify-login', { email, otp })
        const { token, refreshToken, user } = res.data.data
        set({
          token, refreshToken, user, isAuthenticated: true,
          isEmailVerified: Boolean(user.is_email_verified),
          isCollegeVerified: Boolean(user.is_college_verified),
        })
      },

      logout: () => {
        const { token, refreshToken, user } = get()
        if (token) {
          client.post('/auth/logout', { refreshToken }).catch(() => {})
        }
        void syncOneSignalUser(null)
        clearContentCache(user?.id)
        clearAuthenticatedMediaCache()
        setAuthenticatedMediaScope(null)
        void import('./feedStore').then(({ useFeedStore }) => useFeedStore.getState().clearFeed())
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isEmailVerified: false,
          isCollegeVerified: false,
        })
      },

      setUser: (user) =>
        set({
          user,
          isEmailVerified: Boolean(user.is_email_verified),
          isCollegeVerified: Boolean(user.is_college_verified),
        }),

      updateUserMedia: (media) => {
        const current = get().user
        if (!current) return
        set({ user: { ...current, ...media } })
      },

      setTokens: (token, refreshToken) => set({ token, refreshToken }),

      setVerificationStatus: ({ isEmailVerified, isCollegeVerified, verificationStatus }) => {
        const { user } = get()
        if (!user) return
        const updated: AuthUser = {
          ...user,
          is_email_verified: isEmailVerified !== undefined ? (isEmailVerified ? 1 : 0) : user.is_email_verified,
          is_college_verified: isCollegeVerified !== undefined ? (isCollegeVerified ? 1 : 0) : user.is_college_verified,
          verification_status: verificationStatus ?? user.verification_status,
        }
        set({
          user: updated,
          isEmailVerified: Boolean(updated.is_email_verified),
          isCollegeVerified: Boolean(updated.is_college_verified),
        })
      },

      refreshUser: async () => {
        try {
          const res = await client.get('/users/me')
          const user: AuthUser | undefined = res.data?.data
          if (!user || typeof user.id !== 'string' || typeof user.email !== 'string') {
            throw new Error('Invalid session response')
          }
          set({
            user,
            isEmailVerified: Boolean(user.is_email_verified),
            isCollegeVerified: Boolean(user.is_college_verified),
          })
        } catch (error: any) {
          // Only a confirmed auth rejection invalidates a session. Preview
          // reconnects, brief API startup windows, timeouts, and other
          // transient failures must not log a user out or send them back to
          // the landing screen while they are trying to use the app.
          const status = error?.response?.status
          if (status === 401 || status === 403) {
            get().logout()
          }
        }
      },
    }),
    {
      name: DEMO_MODE ? DEMO_AUTH_KEY : 'campnect-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        isEmailVerified: state.isEmailVerified,
        isCollegeVerified: state.isCollegeVerified,
      }),
    }
  )
)
