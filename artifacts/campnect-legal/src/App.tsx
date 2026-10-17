import { ArrowLeft, ArrowUpRight, ChevronRight, FileText, ShieldCheck } from 'lucide-react'
import { Link, Route, Router, Switch, useLocation } from 'wouter'
import { configurationNotice, legalConfig } from './legal/legalConfig'
import { documentBySlug, legalDocuments, type LegalDocument } from './legal/legalContent'

const displayDate = legalConfig.lastUpdated

function SiteHeader() {
  return <header className="site-header"><Link href="/" className="wordmark" aria-label="Campnect Legal home"><BrandLogo/><span>campnect</span><i>legal</i></Link><nav aria-label="Legal documents">{legalDocuments.map((d) => <Link key={d.slug} href={`/${d.slug}`}>{d.title}</Link>)}</nav></header>
}

function SiteFooter() {
  return <footer><div className="footer-brand"><BrandLogo/><strong>campnect</strong><span>Legal Portal</span></div><div className="footer-links">{legalDocuments.map((d) => <Link key={d.slug} href={`/${d.slug}`}>{d.title}</Link>)}</div><p>© {new Date().getFullYear()} {legalConfig.operator}.</p><p>Emoji graphics by <a href="https://openmoji.org/" target="_blank" rel="noreferrer">OpenMoji</a> — the open-source emoji and icon project. License: <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.</p></footer>
}

function BrandLogo() {
  return <span className="brand-logo" aria-hidden="true"><img src="https://campnect.perinol.com/campnect-logo.png" alt="" /></span>
}

function Layout({ children }: { children: React.ReactNode }) {
  return <div className="page"><SiteHeader /><main>{children}</main><SiteFooter /></div>
}

function LandingPage() {
  return <Layout><section className="hero"><div className="eyebrow"><ShieldCheck size={16} /> CAMPNECT LEGAL</div><h1>Clear policies for a safer campus community.</h1><p>Read how Campnect handles privacy, community safety, service rules, and browser or device storage.</p><a href="#documents" className="hero-link">Explore documents <ArrowUpRight size={17} /></a></section><section id="documents" className="documents" aria-label="Legal documents"><div className="section-intro"><p className="eyebrow">DOCUMENT LIBRARY</p><h2>Legal information</h2><p>These public documents apply to Campnect services. Some final legal and business details remain marked for confirmation.</p></div><div className="document-grid">{legalDocuments.map((document, index) => <Link href={`/${document.slug}`} className="document-card" key={document.slug}><span className="doc-number">0{index + 1}</span><FileText size={24} /><h3>{document.title}</h3><p>{document.description}</p><span className="read-link">Read document <ChevronRight size={17} /></span></Link>)}</div></section><aside className="notice"><ShieldCheck size={20}/><div><strong>Draft configuration notice</strong><p>{configurationNotice}</p></div></aside></Layout>
}

function DocumentPage({ document }: { document: LegalDocument }) {
  const [, navigate] = useLocation()
  return <Layout><article className="legal-document"><button className="back" onClick={() => navigate('/')}><ArrowLeft size={18} /> All legal documents</button><header className="document-heading"><p className="eyebrow">CAMPNECT LEGAL</p><h1>{document.title}</h1><p>{document.description}</p><dl><div><dt>Effective date</dt><dd>{legalConfig.effectiveDate}</dd></div><div><dt>Last updated</dt><dd>{displayDate}</dd></div></dl></header><div className="notice compact"><ShieldCheck size={20}/><p>{configurationNotice}</p></div><div className="policy-content">{document.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}</section>)}</div><section className="related"><p className="eyebrow">RELATED DOCUMENTS</p><div>{legalDocuments.filter((other) => other.slug !== document.slug).map((other) => <Link key={other.slug} href={`/${other.slug}`}>{other.title}<ChevronRight size={17}/></Link>)}</div></section></article></Layout>
}

function NotFound() {
  return <Layout><section className="not-found"><p className="eyebrow">404</p><h1>That document is not here.</h1><p>Return to the Campnect Legal document library.</p><Link href="/">View legal documents <ChevronRight size={17}/></Link></section></Layout>
}

function Routes() {
  return <Switch><Route path="/" component={LandingPage}/><Route path="/privacy">{() => <DocumentPage document={documentBySlug.privacy}/>}</Route><Route path="/terms">{() => <DocumentPage document={documentBySlug.terms}/>}</Route><Route path="/community-guidelines">{() => <DocumentPage document={documentBySlug['community-guidelines']}/>}</Route><Route path="/cookies">{() => <DocumentPage document={documentBySlug.cookies}/>}</Route><Route path="/child-safety">{() => <DocumentPage document={documentBySlug['child-safety']}/>}</Route><Route component={NotFound}/></Switch>
}

export default function App() {
  return <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Routes /></Router>
}
