import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, BookOpen, ChevronRight, GraduationCap, Users } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import client from '../../api/client'
import { requestAppBack } from '../../navigation/appBackRequest'

type CourseSummary = {
  name: string
  member_count: number
}

export function CollegeMembersScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedCourse = searchParams.get('course')
  const [college, setCollege] = useState<any>(null)
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [collegeLoading, setCollegeLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      client.get(`/colleges/${id}`),
      client.get(`/colleges/${id}/courses`),
    ]).then(([collegeRes, coursesRes]) => {
      setCollege(collegeRes.data.data)
      setCourses(coursesRes.data.data || [])
    }).catch(() => {
      setCollege(null)
      setCourses([])
    }).finally(() => setCollegeLoading(false))
  }, [id])

  useEffect(() => {
    if (!id || !selectedCourse) {
      setMembers([])
      setMembersLoading(false)
      return
    }
    setMembersLoading(true)
    client.get(`/colleges/${id}/students`, { params: { course: selectedCourse, limit: 100 } })
      .then((response) => setMembers(response.data.data || []))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false))
  }, [id, selectedCourse])

  const openCourse = (course: string) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('course', course)
    navigate({ search: nextParams.toString() }, { replace: true })
  }

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={requestAppBack} aria-label="Back" style={{ border: 0, background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer', display: 'flex' }}><ArrowLeft size={20} /></button>
        <span style={{ fontSize: 18, fontWeight: 800 }}>{selectedCourse || 'College courses'}</span>
      </header>
      {collegeLoading ? <PeopleRowsSkeleton count={6} action={false} /> : (
        <>
          <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 14, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {college?.logo_url ? <AuthenticatedImage src={college.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} /> : <GraduationCap size={25} color="var(--color-lime)" />}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 18 }}>{college?.name || 'College'}</h1>
              <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                {selectedCourse
                  ? `${members.length} student${members.length === 1 ? '' : 's'} in this course`
                  : `${courses.length} active course${courses.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {selectedCourse ? (
              membersLoading
                ? <PeopleRowsSkeleton count={6} action={false} />
                : members.length === 0
                  ? <EmptyMessage icon={<Users size={28} />} text="No students are available in this course." />
                  : members.map((member) => (
                    <button key={member.id} onClick={() => navigate(`/app/profile/${member.username}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 0, borderBottom: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                      <Avatar src={member.avatar_url} name={member.full_name} size={48} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.full_name}</div>
                        <div style={{ marginTop: 3, color: 'var(--color-text-muted)', fontSize: 12 }}>@{member.username}</div>
                      </div>
                    </button>
                  ))
            ) : courses.length === 0 ? (
              <EmptyMessage icon={<BookOpen size={28} />} text="No courses with available students yet." />
            ) : (
              courses.map((course) => (
                <button key={course.name} type="button" onClick={() => openCourse(course.name)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: 0, borderBottom: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ width: 46, height: 46, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 14, color: 'var(--color-text-primary)', background: 'var(--color-surface)' }}>
                    <BookOpen size={20} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{course.name}</strong>
                    <span style={{ display: 'block', marginTop: 4, color: 'var(--color-text-muted)', fontSize: 12 }}>
                      {course.member_count} available student{course.member_count === 1 ? '' : 's'}
                    </span>
                  </span>
                  <ChevronRight size={18} color="var(--color-text-muted)" />
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

function EmptyMessage({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 10, padding: '54px 24px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
      {icon}
      <p style={{ margin: 0, fontSize: 14 }}>{text}</p>
    </div>
  )
}