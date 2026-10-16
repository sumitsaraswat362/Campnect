import { Camera, ChevronRight, Globe2, Sparkles, UserRound, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const features = [
  { icon: UsersRound, title: 'Connect', copy: 'Find and connect with students' },
  { icon: Globe2, title: 'Communities', copy: 'Join communities that matter to you' },
  { icon: Camera, title: 'Share', copy: 'Share moments from campus life' },
]

export function DesktopLandingScreen() {
  const navigate = useNavigate()

  return (
    <main className="desktop-entry" aria-label="Welcome to Campnect">
      <section className="desktop-entry__story">
        <div className="desktop-entry__brand">
          <span className="desktop-entry__brand-mark">C</span>
          <strong>Campnect</strong>
        </div>
        <p className="desktop-entry__eyebrow">The social network for your campus</p>

        <div className="desktop-entry__headline">
          <h1>
            Your campus.<br />
            Your community.<br />
            <span>Real connections.</span>
          </h1>
          <p>Connect with verified students, join communities, share moments and grow together.</p>
        </div>

        <div className="desktop-entry__collage" aria-label="Students connecting on campus">
          <img className="desktop-entry__photo desktop-entry__photo--left" src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=620&q=84" alt="University campus" />
          <img className="desktop-entry__photo desktop-entry__photo--center" src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=680&q=84" alt="Students together" />
          <img className="desktop-entry__photo desktop-entry__photo--right" src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=620&q=84" alt="Students on campus" />
          <span className="desktop-entry__tag desktop-entry__tag--connect"><UsersRound size={15} /> Connect</span>
          <span className="desktop-entry__tag desktop-entry__tag--communities"><Globe2 size={15} /> Communities</span>
          <span className="desktop-entry__tag desktop-entry__tag--share"><Camera size={15} /> Share</span>
        </div>

        <div className="desktop-entry__feature-row">
          {features.map(({ icon: Icon, title, copy }) => (
            <div key={title}>
              <span><Icon size={21} /></span>
              <strong>{title}</strong>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="desktop-entry__actions">
        <div className="desktop-entry__action-card">
          <div className="desktop-entry__card-brand">
            <span className="desktop-entry__brand-mark">C</span>
            <strong>Campnect</strong>
          </div>
          <h2>The social network<br />for your campus</h2>
          <p>Connect with verified students, join communities, share moments and grow together.</p>

          <div className="desktop-entry__campus-art" aria-label="Your campus, your community">
            <div className="desktop-entry__orbit desktop-entry__orbit--one" />
            <div className="desktop-entry__orbit desktop-entry__orbit--two" />
            <div className="desktop-entry__building">
              <i /><i /><i /><i /><i />
            </div>
            <span className="desktop-entry__avatar desktop-entry__avatar--top"><UserRound size={15} /></span>
            <span className="desktop-entry__avatar desktop-entry__avatar--left"><UserRound size={15} /></span>
            <span className="desktop-entry__avatar desktop-entry__avatar--right"><UserRound size={15} /></span>
            <strong>Your campus, your community</strong>
          </div>

          <div className="desktop-entry__card-features">
            {features.map(({ icon: Icon, title, copy }) => (
              <div key={title}>
                <span><Icon size={20} /></span>
                <strong>{title}</strong>
                <p>{copy}</p>
              </div>
            ))}
          </div>

          <button type="button" className="desktop-entry__cta" onClick={() => navigate('/signup')}>
            <Sparkles size={19} fill="currentColor" /> Get Started
          </button>
          <p className="desktop-entry__login-copy">
            Already have an account?
            <button type="button" onClick={() => navigate('/login')}>Log in <ChevronRight size={14} /></button>
          </p>
        </div>
      </section>
    </main>
  )
}