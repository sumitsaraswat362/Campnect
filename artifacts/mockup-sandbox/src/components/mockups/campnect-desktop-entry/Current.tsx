import './_group.css'

const imageBase = 'https://images.unsplash.com/'

export function Current() {
  return (
    <main className="campnect-entry-preview">
      <section className="campnect-entry-preview__story">
        <div className="campnect-entry-preview__brand"><span className="campnect-entry-preview__mark">C</span>Campnect</div>
        <p className="campnect-entry-preview__eyebrow">The social network for your campus</p>
        <h1>Your campus.<br />Your community.<br /><span>Real connections.</span></h1>
        <p className="campnect-entry-preview__story-copy">Connect with verified students, join communities, share moments and grow together.</p>
        <div className="campnect-entry-preview__photos">
          <img src={`${imageBase}photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=620&q=84`} alt="University campus" />
          <img src={`${imageBase}photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=680&q=84`} alt="Students together" />
          <img src={`${imageBase}photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=620&q=84`} alt="Students on campus" />
        </div>
        <div className="campnect-entry-preview__mini-features"><div><b>Connect</b><p>Find and connect with students</p></div><div><b>Communities</b><p>Join communities that matter to you</p></div><div><b>Share</b><p>Share moments from campus life</p></div></div>
      </section>
      <section className="campnect-entry-preview__panel">
        <div className="campnect-entry-preview__card">
          <div className="campnect-entry-preview__brand"><span className="campnect-entry-preview__mark">C</span>Campnect</div>
          <h2>The social network<br />for your campus</h2>
          <p>Connect with verified students, join communities, share moments and grow together.</p>
          <div className="campnect-entry-preview__art"><div className="campnect-entry-preview__building" /><b>Your campus, your community</b></div>
          <div className="campnect-entry-preview__card-features"><div><b>Connect</b><p>Find and connect with students</p></div><div><b>Communities</b><p>Join communities that matter to you</p></div><div><b>Share</b><p>Share moments from campus life</p></div></div>
          <button className="campnect-entry-preview__button" type="button">✦ &nbsp; Get Started</button>
          <p className="campnect-entry-preview__login">Already have an account? <b>Log in ›</b></p>
        </div>
      </section>
    </main>
  )
}