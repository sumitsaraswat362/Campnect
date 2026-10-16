import { DEMO_MODE } from '../../demo/config'
import { LoginScreen } from './LoginScreen'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Mail, Lock, User, GraduationCap, Calendar, Eye, EyeOff, CheckCircle, Loader, UsersRound, Globe2, Camera, Sparkles, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../stores/authStore'
import client from '../../api/client'
import { getCourseCatalogForCollege } from '../../data/courseCatalog'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'
import { legalLinks } from '../../help/helpLinks'
import { containsProhibitedLanguage, USERNAME_BANNED_MESSAGE } from '../../utils/contentSafety'

/* ─── Types ────────────────────────────────────────────────────────────────── */
interface FormData {
  role: 'student' | 'faculty'
  selectedCollege: string
  email: string
  otp: string[]
  username: string
  password: string
  fullName: string
  course: string
  year: string
  dob: string
  institutePost: string
}

const POPULAR_COLLEGES = [
  { id: 'gla-mathura', name: 'GLA University', abbr: 'GLA', city: 'Mathura, Uttar Pradesh', domain: 'gla.ac.in', logo: '/gla-logo.png' },
  { id: 'gla-noida',   name: 'GLA University', abbr: 'GLA', city: 'Noida, Uttar Pradesh',   domain: 'gla.ac.in', logo: '/gla-logo.png' },
  { id: 'gl-bajaj-mathura', name: 'GL Bajaj', abbr: 'GL Bajaj', city: 'Mathura, Uttar Pradesh', domain: 'glbajajgroup.org', logo: '/gl-bajaj-logo.png' },
  { id: 'gl-bajaj-greater-noida', name: 'GL Bajaj', abbr: 'GL Bajaj', city: 'Greater Noida, Uttar Pradesh', domain: 'glbajajgroup.org', logo: '/gl-bajaj-logo.png' },
  { id: 'lpu-phagwara', name: 'Lovely Professional University', abbr: 'LPU', city: 'Phagwara, Punjab', domain: 'lpu.in', logo: '/lpu-logo.png' },
  { id: 'lnmiit-jaipur', name: 'The LNM Institute of Information Technology (LNMIIT)', abbr: 'LNMIIT', city: 'Jaipur, Rajasthan', domain: 'lnmiit.ac.in', logo: '/lnmiit-logo.png' },
  { id: 'dbs-global-dehradun', name: 'DBS Global University', abbr: 'DBS', city: 'Dehradun, Uttrakhand', domain: 'dgu.ac.in', logo: '/dbs-global-university-logo.svg' },
  { id: 'galgotias-greater-noida', name: 'Galgotias University', abbr: 'Galgotias', city: 'Greater Noida, Uttar Pradesh', domain: 'galgotiasuniversity.ac.in', logo: '/galgotias-logo.png' },
  { id: 'bsacet-mathura', name: 'BSA College of Engineering & Technology', abbr: 'BSA CET', city: 'Mathura, Uttar Pradesh', domain: 'bsacet.org', logo: '/bsacet-logo.png' },
  { id: 'mit-wpu-pune', name: 'MIT World Peace University', abbr: 'MIT-WPU', city: 'Pune, Maharashtra', domain: 'mit.edu.in', logo: '/mit-wpu-logo.png' },
  { id: 'shoolini-university-bajhol', name: 'Shoolini University', abbr: 'Shoolini', city: 'Bajhol, Himachal Pradesh', domain: 'shooliniuniversity.com', logo: '/shoolini-university-logo.png' },
  { id: 'chitkara-university-rajpura', name: 'Chitkara University', abbr: 'Chitkara', city: 'Rajpura, Punjab', domain: 'chitkara.edu.in', logo: '/chitkara-university-logo.png' },
  { id: 'thapar-institute-patiala', name: 'Thapar Institute of Engineering & Technology (TIET)', abbr: 'Thapar', city: 'Patiala, Punjab', domain: 'thapar.edu', logo: '/thapar-institute-logo.png' },
  { id: 'cic-delhi-university', name: 'Cluster Innovation Centre (CIC), University of Delhi', abbr: 'CIC', city: 'New Delhi', domain: 'cic.du.ac.in', logo: '/cic-delhi-university-logo.png' },
  { id: 'kiit-bhubaneswar', name: 'Kalinga Institute of Industrial Technology (KIIT)', abbr: 'KIIT', city: 'Bhubaneswar, Odisha', domain: 'student.kiit.ac.in', logo: '/kiit-logo.svg' },
  { id: 'mnnit-allahabad-prayagraj', name: 'Motilal Nehru National Institute of Technology Allahabad', abbr: 'MNNIT', city: 'Prayagraj, Uttar Pradesh', domain: 'mnnit.ac.in', logo: '/mnnit-logo.svg' },
  { id: 'integral-university-lucknow', name: 'Integral University', abbr: 'Integral', city: 'Lucknow, Uttar Pradesh', domain: 'student.iul.ac.in', logo: '/integral-university-logo.png' },
]

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Postgraduate']

const INSTITUTE_POST_GROUPS = [
  {
    label: 'Top Management',
    posts: ['CEO', 'Chancellor', 'Pro-Chancellor', 'Vice-Chancellor', 'Pro-Vice-Chancellor', 'Rector', 'President', 'Vice-President', 'Secretary', 'Treasurer'],
  },
  {
    label: 'Academic Administration',
    posts: ['Dean', 'Associate Dean', 'Assistant Dean', 'Director', 'Associate Director', 'Assistant Director', 'Head of Department (HOD)', 'Deputy Head of Department', 'Programme Coordinator', 'Course Coordinator'],
  },
  {
    label: 'Faculty',
    posts: ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Senior Lecturer', 'Visiting Professor', 'Adjunct Professor', 'Guest Faculty', 'Teaching Assistant'],
  },
  {
    label: 'Research',
    posts: ['Research Professor', 'Research Scientist', 'Postdoctoral Fellow', 'Research Associate', 'Research Assistant', 'Project Scientist', 'Project Fellow', 'Research Scholar', 'PhD Scholar'],
  },
  {
    label: 'Administration',
    posts: ['Registrar', 'Deputy Registrar', 'Assistant Registrar', 'Controller of Examinations', 'Deputy Controller of Examinations', 'Assistant Controller of Examinations', 'Dean of Students', 'Student Welfare Officer', 'Admission Officer', 'Training & Placement Officer', 'Alumni Relations Officer', 'Public Relations Officer', 'Administrative Officer', 'Office Superintendent', 'Administrative Assistant', 'Executive'],
  },
  {
    label: 'Student Services',
    posts: ['Counsellor', 'Career Counsellor', 'Student Affairs Officer', 'Hostel Warden', 'Assistant Warden', 'Sports Officer', 'NSS Officer', 'NCC Officer', 'International Relations Officer', 'International Student Coordinator'],
  },
  {
    label: 'Library',
    posts: ['Librarian', 'Deputy Librarian', 'Assistant Librarian', 'Library Officer'],
  },
  {
    label: 'Finance',
    posts: ['Finance Officer', 'Accounts Officer', 'Accountant', 'Finance Assistant'],
  },
  {
    label: 'IT / Technical',
    posts: ['Chief Information Officer (CIO)', 'IT Director', 'IT Administrator', 'System Administrator', 'Network Administrator', 'Database Administrator', 'Software Developer', 'Technical Officer', 'Technical Assistant'],
  },
  {
    label: 'Laboratory',
    posts: ['Laboratory In-charge', 'Laboratory Officer', 'Senior Lab Technician', 'Lab Technician', 'Lab Assistant'],
  },
]

function CoursePicker({ value, onChange, collegeId }: { value: string; onChange: (course: string) => void; collegeId: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  useBackDismiss(open, () => setOpen(false), 150)
  const catalog = getCourseCatalogForCollege(collegeId)
  const filtered = catalog.filter((course) => course.name.toLowerCase().includes(query.trim().toLowerCase()))

  if (catalog.length === 0) {
    return (
      <Field
        placeholder="Enter your course"
        value={value}
        onChange={onChange}
        maxLength={120}
      />
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%', minHeight: '56px', padding: '0 16px',
          display: 'flex', alignItems: 'center', gap: '12px',
          background: 'var(--color-input-bg)', border: '1.5px solid var(--color-input-border)',
          borderRadius: '14px', color: value ? 'var(--color-input-text)' : 'var(--color-input-icon)',
          fontSize: '15px', textAlign: 'left', cursor: 'pointer',
        }}
      >
        <span style={{ flex: 1 }}>{value || 'Select your course'}</span>
        <span style={{ fontSize: '18px', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}>⌄</span>
      </button>
      {open && (
        <div role="listbox" style={{
          position: 'absolute', zIndex: 30, top: 'calc(100% + 8px)', left: 0, right: 0,
          maxHeight: '300px', overflowY: 'auto', padding: '8px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)',
          borderRadius: '14px', boxShadow: '0 14px 30px rgba(0,0,0,0.38)',
        }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses..."
            aria-label="Search courses"
            style={{
              width: '100%', boxSizing: 'border-box', marginBottom: '6px',
              padding: '11px 12px', borderRadius: '10px', border: '1px solid var(--color-border)',
              background: 'var(--color-input-bg)', color: 'var(--color-input-text)', outline: 'none',
            }}
          />
          {filtered.length === 0 ? (
            <p style={{ padding: '12px', margin: 0, color: 'var(--color-text-muted)', fontSize: '13px' }}>No matching course</p>
          ) : filtered.map((course) => (
            <button
              key={course.name}
              type="button"
              role="option"
              aria-selected={value === course.name}
              onClick={() => { onChange(course.name); setQuery(''); setOpen(false) }}
              style={{
                width: '100%', padding: '11px 12px', border: 'none', borderRadius: '9px',
                background: value === course.name ? 'rgba(187,255,0,0.14)' : 'transparent',
                color: value === course.name ? 'var(--color-lime)' : 'var(--color-text-primary)',
                textAlign: 'left', cursor: 'pointer', fontSize: '13px', lineHeight: 1.35,
              }}
            >
              {course.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function durationForCourse(courseName: string, collegeId: string) {
  return getCourseCatalogForCollege(collegeId).find((course) => course.name === courseName)?.durationYears || ''
}

function maxYearsForCourse(courseName: string, collegeId: string) {
  const duration = durationForCourse(courseName, collegeId)
  const matches = duration.match(/\d+/g)?.map(Number) || []
  if (matches.length === 0) return YEARS.length
  return Math.max(...matches, 1)
}

function StyledSelect({
  value, placeholder, options, onChange,
}: {
  value: string
  placeholder: string
  options: string[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  useBackDismiss(open, () => setOpen(false), 150)
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={placeholder}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
          background: 'var(--color-input-bg)',
          border: '1.5px solid var(--color-input-border)',
          borderRadius: '14px', padding: '0 16px', minHeight: '56px',
          color: value ? 'var(--color-input-text)' : 'var(--color-input-icon)',
          fontSize: '15px', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ flex: 1 }}>{value || placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-input-icon)" strokeWidth="2" strokeLinecap="round" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div role="listbox" aria-label={placeholder} style={{
          position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 8px)',
          padding: '6px', borderRadius: '14px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)',
          boxShadow: '0 14px 30px rgba(0,0,0,0.35)',
        }}>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              onClick={() => { onChange(option); setOpen(false) }}
              style={{
                display: 'block', width: '100%', padding: '12px 14px',
                border: 'none', borderRadius: '10px', textAlign: 'left',
                background: value === option ? 'rgba(187,255,0,0.14)' : 'transparent',
                color: value === option ? 'var(--color-lime)' : 'var(--color-text-primary)',
                fontSize: '15px', fontWeight: value === option ? 700 : 400, cursor: 'pointer',
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({
  placeholder, value, onChange, type = 'text', leftIcon, rightElement, maxLength,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  type?: string
  leftIcon?: React.ReactNode
  rightElement?: React.ReactNode
  maxLength?: number
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      background: 'var(--color-input-bg)',
      border: '1.5px solid var(--color-input-border)',
      borderRadius: '14px', padding: '0 16px', height: '56px',
    }}>
      {leftIcon && <span style={{ color: 'var(--color-input-icon)', flexShrink: 0 }}>{leftIcon}</span>}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none',
          color: 'var(--color-input-text)', fontSize: '15px', caretColor: 'var(--color-lime)',
          fontFamily: 'var(--font-body)',
        }}
      />
      {rightElement}
    </div>
  )
}

/* ─── Main component ───────────────────────────────────────────────────────── */
export function RegisterScreen() {
  return DEMO_MODE ? <LoginScreen /> : <ProductionRegisterScreen />
}

function ProductionRegisterScreen() {
  const navigate  = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [collegeSearch, setCollegeSearch] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [acceptedPolicies, setAcceptedPolicies] = useState(false)
  const [tempToken, setTempToken] = useState<string | null>(null)
  const [tempPwd, setTempPwd] = useState<string>('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [form, setForm] = useState<FormData>({
    role: 'student',
    selectedCollege: '',
    email: '',
    otp: ['', '', '', '', '', ''],
    username: '',
    password: '',
    fullName: '',
    course: '',
    year: '',
    dob: '',
    institutePost: '',
  })

  const set = useCallback(<K extends keyof FormData>(key: K, val: FormData[K]) => {
    setForm((f) => ({ ...f, [key]: val }))
  }, [])

  /* ── Resend OTP timer ── */
  function startTimer() {
    setResendTimer(45)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0 }
        return t - 1
      })
    }, 1000)
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  /* ── Password requirements ── */
  const pwdChecks = {
    length:    form.password.length >= 8,
    number:    /\d/.test(form.password),
    uppercase: /[A-Z]/.test(form.password),
  }

  /* ── Local Back dismissal ── */
  const dismissStep = useCallback(() => {
    if (step === 8) setStep(6)
    else if (step === 10) setStep(8)
    else if (step === 11) setStep(9)
    else setStep((current) => current - 1)
  }, [step])

  // The welcome and completion states belong to the shared route coordinator.
  // All intermediate steps return through their existing visual Back mapping.
  useBackDismiss(step !== 1 && step !== 14, dismissStep)

  /* ── Step 3: validate email domain + send OTP via signup ── */
  async function handleSendOTP() {
    if (!form.email.trim()) { toast.error('Enter your email'); return }
    if (!acceptedPolicies) { toast.error('Please accept the Terms and policies to continue'); return }
    setLoading(true)
    try {
      // Validate email domain
      const check = await client.get(`/colleges/check-email?email=${encodeURIComponent(form.email.toLowerCase())}`)
      const { valid } = check.data.data
      if (!valid) { toast.error('Please use your official college email (.edu, .ac.in, etc.)'); return }

      // Create account with temp password (will be changed in step 6)
      const tempPassword = `Tmp!${Math.random().toString(36).slice(2, 10)}X9`
      setTempPwd(tempPassword)
      await client.post('/auth/signup', {
        email:     form.email.toLowerCase().trim(),
        password:  tempPassword,
        full_name: form.fullName || 'pending',
        user_role: form.role,
        college_id: form.selectedCollege,
        policy_accepted: true,
      })
      startTimer()
      setStep(4)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  /* ── Step 4: verify OTP ── */
  async function handleVerifyOTP() {
    const otp = form.otp.join('')
    if (otp.length < 6) { toast.error('Enter the 6-digit code'); return }
    setLoading(true)
    try {
      const res = await client.post('/auth/verify-email', {
        email: form.email.toLowerCase().trim(),
        otp,
      })
      // Auto-login: store token so we can update profile in later steps
      const token = res.data?.data?.token
      if (token) {
        setTempToken(token)
        // Update auth store silently so PATCH requests work
        client.defaults.headers.common['Authorization'] = `Bearer ${token}`
      }
      setStep(5)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Invalid or expired code')
    } finally {
      setLoading(false)
    }
  }

  /* ── Resend OTP ── */
  async function handleResendOTP() {
    if (resendTimer > 0) return
    setLoading(true)
    try {
      await client.post('/auth/resend-otp', { email: form.email.toLowerCase().trim() })
      startTimer()
      toast.success('New code sent!')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to resend')
    } finally {
      setLoading(false)
    }
  }

  /* ── Step 5: update username ── */
  async function handleSetUsername() {
    const uname = form.username.trim()
    if (!uname || uname.length < 5) {
      toast.error('Username must be at least 5 characters')
      return
    }
    if (uname.length > 30) {
      toast.error('Username must be 30 characters or fewer')
      return
    }
    if (uname.toLowerCase() === 'ceo') {
      toast.error('This username is reserved')
      return
    }
    if (containsProhibitedLanguage(uname)) return
    setLoading(true)
    try {
      await client.patch('/users/me', { username: form.username.trim() })
      setStep(6)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Username already taken')
    } finally {
      setLoading(false)
    }
  }

  /* ── Step 6: set real password ── */
  async function handleSetPassword() {
    if (!pwdChecks.length || !pwdChecks.number || !pwdChecks.uppercase) {
      toast.error('Password does not meet requirements')
      return
    }
    setLoading(true)
    try {
      await client.post('/users/me/change-password', {
        currentPassword: tempPwd,
        newPassword: form.password,
      })
      setStep(8)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to set password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Profile setup ── */
  async function handleFinishProfile() {
    setLoading(true)
    try {
      const yearNumber = form.year ? Math.max(1, YEARS.indexOf(form.year) + 1) : undefined
      await client.patch('/users/me', {
        full_name:  form.fullName.trim() || undefined,
        department: form.role === 'student' ? form.course.trim() || undefined : form.institutePost.trim() || undefined,
        course:     form.role === 'student' ? form.course.trim() || undefined : undefined,
        year:       form.role === 'student' ? yearNumber : undefined,
        institute_post: form.role === 'faculty' ? form.institutePost : undefined,
      })
      setStep(14)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save your profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Step 12: go to feed ── */
  async function handleGoHome() {
    // Trigger full auth refresh
    try {
      const me = await client.get('/users/me')
      const userData = me.data.data
      useAuthStore.setState({
        user: userData,
        isAuthenticated: true,
        isEmailVerified: true,
        token: tempToken || undefined,
      })
    } catch { /* ignore */ }
    navigateToAppRoot(navigate, location.pathname, '/app/feed')
  }

  /* ── OTP inputs ── */
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  function handleOTPInput(i: number, val: string) {
    const digits = val.replace(/\D/g, '')
    if (val && !digits) return
    const next = [...form.otp]
    if (!digits) {
      next[i] = ''
    } else {
      digits.slice(0, 6 - i).split('').forEach((digit, offset) => {
        next[i + offset] = digit
      })
    }
    set('otp', next)
    if (digits) otpRefs.current[Math.min(i + digits.length, 5)]?.focus()
  }

  function handleOTPKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !form.otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus()
    }
  }

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  const bg: React.CSSProperties = {
    minHeight: '100%',
    width: '100%',
    background: 'var(--color-bg)',
    backgroundImage: 'var(--gradient-radial-bg)',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 24px',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0px))',
    position: 'relative',
    overflowY: 'auto',
    animation: 'stepIn 300ms var(--ease-spring)',
  }

  const collegeStepBg: React.CSSProperties = {
    ...bg,
    height: '100%',
    minHeight: 0,
    overflowY: 'hidden',
    boxSizing: 'border-box',
  }

  const stepLabel = step <= 14 ? String(step).padStart(2, '0') : '14'

  /* ── Step header (shared) ── */
  const StepHeader = ({ showStep = true }: { showStep?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', paddingBottom: '8px' }}>
      <button
        onClick={requestAppBack}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--color-surface-hover)',
          border: '1px solid var(--color-border)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-primary)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </button>
      {showStep && (
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
          {stepLabel}
        </span>
      )}
    </div>
  )

  /* ── Icon badge (circular with purple ring) ── */
  const IconBadge = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      width: 80, height: 80, borderRadius: '50%',
      background: 'rgba(24,24,27,0.18)',
      border: '2px solid rgba(24,24,27,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      margin: '0 auto 24px',
      boxShadow: '0 0 32px rgba(24,24,27,0.25)',
    }}>
      {children}
    </div>
  )

  /* ── CTA button (shared) ── */
  const CTAButton = ({ label, onClick, disabled: dis }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={dis || loading}
      style={{
        width: '100%', height: '56px', borderRadius: '14px',
        background: (dis || loading) ? 'var(--color-text-muted)' : 'var(--color-lime)',
        border: 'none', cursor: (dis || loading) ? 'not-allowed' : 'pointer',
        fontSize: '16px', fontWeight: 700, color: '#FFFFFF',
        boxShadow: 'var(--shadow-btn)',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        flexShrink: 0,
        transition: 'all 200ms',
        marginTop: 'auto',
      }}
    >
      {loading ? <Loader size={18} style={{ animation: 'spin 800ms linear infinite' }} /> : label}
    </button>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 1 — Welcome
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 1) return (
    <main className="get-started" aria-label="Welcome to Campnect">
      <div className="get-started__brand">
        <h1>Campnect</h1>
      </div>

      <section className="get-started__intro">
        <h2>The social network<br />for your campus</h2>
        <p>Connect with verified students, join<br />communities, share moments and<br />grow together.</p>
      </section>

      <section className="campus-card" aria-label="Your campus, your community">
        <div className="campus-card__art">
          <svg className="campus-card__orbit" viewBox="0 0 360 190" fill="none" aria-hidden="true">
            <ellipse cx="180" cy="104" rx="151" ry="91" stroke="#D9D9D9" strokeWidth="1"/>
            <path d="M29 104c14 50 76 88 151 88s137-38 151-88" stroke="#ECECEC" strokeWidth="1"/>
            <path d="M55 92c31-42 75-67 125-67s94 25 125 67" stroke="#ECECEC" strokeWidth="1"/>
            <circle cx="180" cy="23" r="2" fill="#8D8D8D"/>
            <circle cx="180" cy="104" r="24" fill="#fff" opacity=".9"/>
            <UsersRound x="169" y="93" width="22" height="22" stroke="#111" strokeWidth="2.3"/>
            <path d="M89 161c14-18 24-23 35-23s21 5 35 23M201 161c14-18 24-23 35-23s21 5 35 23" stroke="#E6E6E6" strokeWidth="1.5"/>
            <path d="M113 153 126 135l12 18M227 153l13-18 12 18" stroke="#D7D7D7" strokeWidth="1.5"/>
            <path d="M108 155h144M122 155v-39h116v39M128 116l52-27 52 27" fill="#F1F1F1" stroke="#BDBDBD" strokeWidth="1.5"/>
            <path d="M138 116h84v39h-84z" fill="#E5E5E5" stroke="#BDBDBD" strokeWidth="1.5"/>
            <path d="M145 155v-28h70v28M154 127v28M166 127v28M178 127v28M190 127v28M202 127v28" stroke="#AFAFAF" strokeWidth="1.5"/>
            <path d="M180 89V74M180 74l10 4-10 4" stroke="#929292" strokeWidth="1.3"/>
            <path d="M82 158v-18M76 145l6-6 6 6M278 158v-18M272 145l6-6 6 6" stroke="#C9C9C9" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <div className="campus-avatar campus-avatar--top"><User size={17}/></div>
          <div className="campus-avatar campus-avatar--left"><User size={17}/></div>
          <div className="campus-avatar campus-avatar--right"><User size={17}/></div>
          <div className="campus-avatar campus-avatar--far-right"><User size={17}/></div>
        </div>
        <div className="campus-card__copy">
          <strong>Your campus, your community</strong>
        </div>
      </section>

      <section className="get-started__features" aria-label="Campnect features">
        <div><span><UsersRound size={24} /></span><strong>Connect</strong><p>Find and connect<br />with students</p></div>
        <div><span><Globe2 size={24} /></span><strong>Communities</strong><p>Join communities<br />that matter to you</p></div>
        <div><span><Camera size={24} /></span><strong>Share</strong><p>Share moments<br />from campus life</p></div>
      </section>

      <button type="button" onClick={() => setStep(2)} className="get-started__cta">
        <Sparkles size={20} fill="white" /> Get Started
      </button>
      <p className="get-started__login-copy">
        Already have an account?{' '}
        <button type="button" onClick={() => navigate('/login')}>Log in <ChevronRight size={14} /></button>
      </p>
    </main>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 2 — Select University
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 2) {
    const filtered = POPULAR_COLLEGES.filter((c) =>
      c.name.toLowerCase().includes(collegeSearch.toLowerCase()) ||
      c.abbr.toLowerCase().includes(collegeSearch.toLowerCase())
    )
    return (
      <div style={collegeStepBg}>
        <StepHeader />
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 20px' }}>
          Select University /{'\n'}College
        </h2>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          I am joining as
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
          {([
            { value: 'student' as const, label: 'Student', detail: 'Campus profile' },
            { value: 'faculty' as const, label: 'Faculty', detail: 'Select your institute post' },
          ]).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => set('role', option.value)}
              style={{
                padding: '13px 10px', borderRadius: '14px', textAlign: 'left', cursor: 'pointer',
                background: form.role === option.value ? 'rgba(187,255,0,0.10)' : 'var(--color-surface)',
                border: form.role === option.value ? '1.5px solid rgba(187,255,0,0.55)' : '1.5px solid var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 700 }}>{option.label}</span>
              <span style={{ display: 'block', marginTop: '3px', fontSize: '11px', color: 'var(--color-text-muted)' }}>{option.detail}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'var(--color-input-bg)',
          border: '1.5px solid var(--color-input-border)',
          borderRadius: '12px', padding: '0 14px', height: '48px', marginBottom: '20px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-input-icon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search your university / college"
            value={collegeSearch}
            onChange={(e) => setCollegeSearch(e.target.value)}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--color-text-primary)', fontSize: '14px', caretColor: 'var(--color-lime)',
            }}
          />
        </div>

        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Available Campuses
        </p>

        {/* College list */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          flex: '1 1 0',
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehaviorY: 'contain',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
          padding: '2px 4px 4px',
          margin: '0 -4px',
        }}>
          {filtered.map((college) => (
            <button
              key={college.id}
              onClick={() => setForm((current) => ({
                ...current,
                selectedCollege: college.id,
                email: current.selectedCollege === college.id ? current.email : '',
                course: current.selectedCollege === college.id ? current.course : '',
                year: current.selectedCollege === college.id ? current.year : '',
              }))}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                background: form.selectedCollege === college.id
                  ? 'rgba(187,255,0,0.08)'
                  : 'var(--color-surface)',
                border: form.selectedCollege === college.id
                  ? '1.5px solid rgba(187,255,0,0.35)'
                  : '1.5px solid var(--color-border)',
                boxShadow: 'var(--shadow-card)',
                cursor: 'pointer',
                padding: '14px 14px', borderRadius: '14px',
                WebkitTapHighlightColor: 'transparent',
                textAlign: 'left',
                transition: 'all 200ms var(--ease-smooth)',
              }}
            >
              {/* College logo */}
              <div style={{
                width: 44, height: 44, borderRadius: '12px',
                background: '#fff',
                border: '1.5px solid var(--color-border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, overflow: 'hidden',
                padding: '4px',
              }}>
                <img
                  src={college.logo}
                  alt={college.abbr}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.25, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                  {college.name}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0 }}>
                  {college.city}
                </p>
              </div>
              {/* Radio circle */}
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: form.selectedCollege === college.id
                  ? '2px solid var(--color-lime)'
                  : '2px solid var(--color-border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {form.selectedCollege === college.id && (
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-lime)' }} />
                )}
              </div>
            </button>
          ))}
        </div>

        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', textAlign: 'center', margin: '16px 0 20px', flexShrink: 0 }}>
          Can't find your college?{' '}
          <a href="mailto:colleges@campnect.app" style={{ color: 'var(--color-lime)', textDecoration: 'none', fontWeight: 500 }}>
            Request your college
          </a>
        </p>

        <CTAButton label="Continue" onClick={() => setStep(3)} disabled={!form.selectedCollege} />
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 3 — Student email
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 3) {
    const chosenCollege = POPULAR_COLLEGES.find((college) => college.id === form.selectedCollege)
    const domain = chosenCollege?.domain || ''
    const domainSuffix = domain ? `@${domain}` : ''
    const localPart = domainSuffix && form.email.endsWith(domainSuffix)
      ? form.email.slice(0, -domainSuffix.length)
      : form.email.split('@')[0]

    return (
      <div style={{ ...bg, justifyContent: 'space-between' }}>
        <div>
          <StepHeader />
          <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 28px', lineHeight: 1.25 }}>
             Enter your<br />{form.role === 'faculty' ? 'institution email' : 'student email'}
          </h2>
          <IconBadge><Mail size={32} color="var(--color-lime)" strokeWidth={1.8} /></IconBadge>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '24px', lineHeight: 1.6 }}>
             We'll send a verification code to your {form.role === 'faculty' ? 'institution' : 'college'} email address.
          </p>
          <Field
            placeholder="name"
            value={localPart}
            onChange={(value) => {
              const local = value.split('@')[0].replace(/\s/g, '')
              set('email', domainSuffix ? `${local}${domainSuffix}` : local)
            }}
            type="text"
            rightElement={domainSuffix ? (
                <span style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: '14px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  borderLeft: '1px solid var(--color-border-strong)',
                  paddingLeft: '12px',
                }} aria-hidden="true">
                {domainSuffix}
              </span>
            ) : undefined}
          />
        </div>
        <div>
          <label
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px', margin: '0 0 16px',
              padding: '13px 14px', borderRadius: '14px',
              background: acceptedPolicies ? 'rgba(187,255,0,0.10)' : 'var(--color-surface)',
              border: `1px solid ${acceptedPolicies ? 'rgba(187,255,0,0.42)' : 'var(--color-border)'}`,
              color: 'var(--color-text-secondary)', fontSize: '12px', lineHeight: 1.55, cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={acceptedPolicies}
              onChange={(event) => setAcceptedPolicies(event.target.checked)}
              aria-describedby="signup-policy-description"
              style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: 'var(--color-lime)' }}
            />
            <span id="signup-policy-description">
              <strong style={{ display: 'block', color: 'var(--color-text-primary)', marginBottom: '2px', fontSize: '13px' }}>
                Review and accept our policies
              </strong>
              By continuing, I agree to the{' '}
              <a href={legalLinks[1].url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} style={{ color: 'var(--color-lime)' }}>Terms of Service</a>
              {', '}
              <a href={legalLinks[0].url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} style={{ color: 'var(--color-lime)' }}>Privacy Policy</a>
              {', '}
              <a href={legalLinks[2].url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} style={{ color: 'var(--color-lime)' }}>Community Guidelines</a>
              {', and '}
              <a href={legalLinks[3].url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} style={{ color: 'var(--color-lime)' }}>Cookie and Storage Policy</a>.
            </span>
          </label>
          <CTAButton label="Send OTP" onClick={handleSendOTP} disabled={!form.email.trim() || !acceptedPolicies} />
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 4 — Enter OTP
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 4) return (
    <div style={{ ...bg, justifyContent: 'space-between' }}>
      <div>
        <StepHeader />
        <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 8px' }}>
          Enter OTP
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '28px' }}>
          We've sent a 6-digit code to<br />
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{form.email}</span>
        </p>

        {/* 6 OTP boxes */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '16px' }}>
          {form.otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { otpRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOTPInput(i, e.target.value)}
              onKeyDown={(e) => handleOTPKeyDown(i, e)}
              style={{
                width: '46px', height: '54px', borderRadius: '12px', textAlign: 'center',
                fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)',
                background: digit ? 'rgba(187,255,0,0.10)' : 'var(--color-input-bg)',
                border: digit ? '2px solid var(--color-lime)' : '2px solid var(--color-input-border)',
                outline: 'none', caretColor: 'var(--color-lime)',
                transition: 'border-color 150ms, background 150ms',
              }}
            />
          ))}
        </div>

        {/* Resend */}
        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '28px' }}>
          Resend OTP in{' '}
          {resendTimer > 0 ? (
            <span style={{ color: 'var(--color-lime)', fontWeight: 600 }}>
              {`00:${String(resendTimer).padStart(2, '0')}`}
            </span>
          ) : (
            <span
              onClick={handleResendOTP}
              style={{ color: 'var(--color-lime)', fontWeight: 600, cursor: 'pointer' }}
            >
              Resend now
            </span>
          )}
        </p>
        <p style={{ margin: '-14px 12px 0', color: 'var(--color-text-muted)', fontSize: '12px', lineHeight: 1.45, textAlign: 'center' }}>
          If the email does not appear within a few minutes, please check your spam or junk folder.
        </p>

      </div>

      <CTAButton label="Verify Code" onClick={handleVerifyOTP} />
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 5 — Create username
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 5) return (
    <div style={{ ...bg, justifyContent: 'space-between' }}>
      <div>
        <StepHeader />
        <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 28px', lineHeight: 1.25 }}>
          Create your<br />username
        </h2>
        <IconBadge><User size={32} color="var(--color-lime)" strokeWidth={1.8} /></IconBadge>
        <Field
          placeholder="Choose a username"
          value={form.username}
          onChange={(v) => set('username', v.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30))}
          maxLength={30}
        />
         {containsProhibitedLanguage(form.username) && (
           <p role="alert" style={{ color: '#DC626B', fontSize: '12px', lineHeight: 1.45, textAlign: 'center', margin: '10px 4px 0' }}>
             {USERNAME_BANNED_MESSAGE}
           </p>
         )}
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '10px' }}>
          Usernames can be changed later.
        </p>
      </div>
      <CTAButton label="Continue" onClick={handleSetUsername} />
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 6 — Create password
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 6) return (
    <div style={{ ...bg, justifyContent: 'space-between' }}>
      <div>
        <StepHeader />
        <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 28px', lineHeight: 1.25 }}>
          Create a<br />password
        </h2>
        <IconBadge><Lock size={32} color="var(--color-lime)" strokeWidth={1.8} /></IconBadge>
        <Field
          placeholder="Create a password"
          value={form.password}
          type={showPwd ? 'text' : 'password'}
          onChange={(v) => set('password', v)}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-input-icon)', padding: 0, display: 'flex' }}
            >
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
        />
        {/* Requirements checklist */}
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {([
            ['At least 8 characters', pwdChecks.length],
            ['Include a number', pwdChecks.number],
            ['Include an uppercase letter', pwdChecks.uppercase],
          ] as [string, boolean][]).map(([label, ok]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: ok ? 'rgba(187,255,0,0.15)' : 'transparent',
                border: `1.5px solid ${ok ? 'var(--color-lime)' : 'var(--color-border-strong)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 200ms',
              }}>
                {ok && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="var(--color-lime)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span style={{ fontSize: '13px', color: ok ? 'var(--color-lime)' : 'var(--color-text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <CTAButton label="Continue" onClick={handleSetPassword} disabled={!pwdChecks.length || !pwdChecks.number || !pwdChecks.uppercase} />
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 8 — Enter display name
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 8) return (
    <div style={{ ...bg, justifyContent: 'space-between' }}>
      <div>
        <StepHeader />
        <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 28px', lineHeight: 1.25 }}>
          Tell us your name
        </h2>
        <IconBadge><User size={32} color="var(--color-lime)" strokeWidth={1.8} /></IconBadge>
        <Field
          placeholder="Full name"
          value={form.fullName}
           onChange={(v) => set('fullName', v.slice(0, 50))}
           maxLength={50}
        />
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '10px' }}>
           This is the name people will see on Campnect.
        </p>
      </div>
        <CTAButton label="Continue" onClick={() => {
         const name = form.fullName.trim()
         if (!name) toast.error('Enter your full name')
         else if (name.length > 50) toast.error('Full name must be 50 characters or fewer')
           else setStep(form.role === 'faculty' ? 10 : 9)
       }} />
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 10 — Select institute post
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 10) return (
    <div style={{ ...bg, justifyContent: 'space-between' }}>
      <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <StepHeader />
        <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 8px', lineHeight: 1.25 }}>
          Select your<br />institute post
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>
          Choose the post that best matches your role at the institute.
        </p>
        <div style={{
          flex: '1 1 0', minHeight: 0, overflowY: 'auto', overscrollBehaviorY: 'contain',
          WebkitOverflowScrolling: 'touch', padding: '2px 4px 8px', margin: '0 -4px',
        }}>
          {INSTITUTE_POST_GROUPS.map((group) => (
            <section key={group.label} style={{ marginBottom: '16px' }}>
              <p style={{
                fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px',
              }}>
                {group.label}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {group.posts.map((post) => (
                  <button
                    key={post}
                    type="button"
                    onClick={() => set('institutePost', post)}
                    aria-pressed={form.institutePost === post}
                    style={{
                      minHeight: '48px', padding: '10px 11px', borderRadius: '12px',
                      textAlign: 'left', cursor: 'pointer', lineHeight: 1.25,
                      background: form.institutePost === post ? 'rgba(187,255,0,0.10)' : 'var(--color-surface)',
                      border: form.institutePost === post ? '1.5px solid rgba(187,255,0,0.55)' : '1.5px solid var(--color-border)',
                      color: form.institutePost === post ? 'var(--color-lime)' : 'var(--color-text-primary)',
                      fontSize: '13px', fontWeight: form.institutePost === post ? 700 : 500,
                    }}
                  >
                    {post}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <CTAButton
        label="Continue"
        onClick={() => {
          if (form.institutePost) setStep(13)
          else toast.error('Select your institute post')
        }}
        disabled={!form.institutePost}
      />
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 9 — Enter course name
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 9) return (
    <div style={{ ...bg, justifyContent: 'space-between' }}>
      <div>
        <StepHeader />
        <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 28px', lineHeight: 1.25 }}>
           Select your<br />course
        </h2>
        <IconBadge><GraduationCap size={32} color="var(--color-lime)" strokeWidth={1.8} /></IconBadge>
        <CoursePicker
          value={form.course}
          collegeId={form.selectedCollege}
          onChange={(course) => { set('course', course); set('year', '') }}
        />
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '10px' }}>
          Search and select your official course. Its total duration is detected automatically.
        </p>
      </div>
      <CTAButton label="Continue" onClick={() => { if (form.course.trim()) setStep(11); else toast.error('Select your course') }} />
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 11 — Select year
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 11) return (
    <div style={{ ...bg, justifyContent: 'space-between' }}>
      <div>
        <StepHeader />
        <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 28px', lineHeight: 1.25 }}>
          Which year<br />are you in?
        </h2>
        <IconBadge>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-lime)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </IconBadge>
        <StyledSelect
          value={form.year}
          placeholder="Select your current year"
          options={YEARS.slice(0, maxYearsForCourse(form.course, form.selectedCollege))}
          onChange={(value) => set('year', value)}
        />
      </div>
      <CTAButton label="Continue" onClick={() => { if (form.year) setStep(12); else toast.error('Select your year') }} />
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 12 — Date of birth
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 12) return (
    <div style={{ ...bg, justifyContent: 'space-between' }}>
      <div>
        <StepHeader />
        <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 28px', lineHeight: 1.25 }}>
          What's your<br />Date of Birth?
        </h2>
        <IconBadge>
          <Calendar size={32} color="var(--color-lime)" strokeWidth={1.8} />
        </IconBadge>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          background: 'var(--color-input-bg)',
          border: '1.5px solid var(--color-input-border)',
          borderRadius: '14px', padding: '0 16px', height: '56px',
        }}>
          <input
            type="date"
            value={form.dob}
            onChange={(e) => set('dob', e.target.value)}
            max={new Date(new Date().setFullYear(new Date().getFullYear() - 16)).toISOString().split('T')[0]}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--color-input-text)', fontSize: '15px', caretColor: 'var(--color-lime)',
            }}
          />
        </div>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '10px' }}>
          You must be 16+ to join.
        </p>
      </div>
      <CTAButton label="Continue" onClick={() => { if (form.dob) setStep(13); else toast.error('Enter your date of birth') }} />
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 13 — Confirm & Review
  ═══════════════════════════════════════════════════════════════════════════ */
  if (step === 13) {
    const chosenCollege = POPULAR_COLLEGES.find((c) => c.id === form.selectedCollege)
    return (
      <div style={{ ...bg, justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <StepHeader />
          <h2 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', textAlign: 'center', margin: '24px 0 8px', lineHeight: 1.25 }}>
            Confirm your details
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '20px' }}>
            Review before your account is created
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
            {([
               { label: 'Account type', value: form.role === 'faculty' ? 'Faculty' : 'Student' },
              { label: 'University',   value: chosenCollege?.name || form.selectedCollege },
              { label: 'Email',        value: form.email },
              { label: 'Full name',    value: form.fullName },
               ...(form.role === 'student' ? [
                { label: 'Course',       value: form.course },
                { label: 'Current year', value: form.year },
                { label: 'Date of birth', value: form.dob },
               ] : [
                 { label: 'Institute post', value: form.institutePost },
               ]),
            ] as { label: string; value: string }[]).map(({ label, value }, i, arr) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                padding: '12px 16px', gap: '16px',
                background: 'var(--color-surface)',
                borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}>
                <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', flexShrink: 0, paddingTop: '1px' }}>{label}</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-body)', textAlign: 'right', wordBreak: 'break-all' }}>{value || '—'}</span>
              </div>
            ))}
          </div>

          <button
             onClick={() => setStep(form.role === 'faculty' ? 10 : 12)}
            style={{ marginTop: '14px', background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '14px', cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%', padding: '8px', WebkitTapHighlightColor: 'transparent' }}
          >
            ← Edit my details
          </button>
        </div>
        <CTAButton label="Confirm & Create Account" onClick={handleFinishProfile} />
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     STEP 14 — Success
  ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{
      ...bg,
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
    }}>
      {/* Animated checkmark ring */}
      <div style={{
        width: 120, height: 120, borderRadius: '50%',
        border: '3px solid var(--color-lime)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '28px',
        boxShadow: '0 0 40px var(--color-lime-glow, rgba(187,255,0,0.30))',
        animation: 'ringPulse 600ms var(--ease-spring) forwards',
      }}>
        <CheckCircle
          size={56}
          color="var(--color-lime)"
          fill="var(--color-lime-dim)"
          style={{ animation: 'checkPop 500ms 200ms var(--ease-spring) both' }}
        />
      </div>

      <h2 style={{ fontSize: '32px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
        You're all set!
      </h2>
      <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', lineHeight: 1.6, maxWidth: '280px', margin: '0 auto 48px' }}>
        Your account is verified. Let's start by setting up your profile.
      </p>

      <button
        onClick={handleGoHome}
        style={{
          width: '100%', height: '56px', borderRadius: '14px',
          background: 'var(--color-lime)', border: 'none', cursor: 'pointer',
           fontSize: '16px', fontWeight: 700, color: 'var(--color-on-lime)',
          boxShadow: '0 4px 24px var(--color-lime-glow, rgba(187,255,0,0.30))',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Go to Home
      </button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes ringPulse {
          0%   { transform: scale(0.7); opacity: 0; }
          60%  { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes checkPop {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1);  opacity: 1; }
        }
      `}</style>
    </div>
  )
}
