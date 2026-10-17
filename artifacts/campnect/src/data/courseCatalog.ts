import { CHITKARA_COURSE_CATALOG } from './chitkaraCatalog'
import { CIC_DELHI_COURSE_CATALOG } from './cicDelhiCatalog'
import { GALGOTIAS_COURSE_CATALOG } from './galgotiasCatalog'
import { MIT_WPU_COURSE_CATALOG } from './mitWpuCatalog'
import { SHOOLINI_COURSE_CATALOG } from './shooliniCatalog'
import { THAPAR_COURSE_CATALOG } from './thaparCatalog'
import { KIIT_COURSE_CATALOG } from './kiitCatalog'
import { MNNIT_COURSE_CATALOG } from './mnnitCatalog'
import { INTEGRAL_UNIVERSITY_COURSE_CATALOG } from './integralCatalog'

export type CourseOption = { name: string; durationYears: string }

// GLA University, Mathura course catalog supplied for the 2026–27 intake.
const rows = `
B.Tech — Computer Science & Engineering|4 Years
B.Tech — CSE (Artificial Intelligence & Machine Learning)|4 Years
B.Tech (Hons.) — CSE (AI & Analytics, Intel & NEC)|4 Years
B.Tech — Electronics & Communication Engineering|4 Years
B.Tech — EC with Minor in Computer Science|4 Years
B.Tech — EC with Specialization in VLSI|4 Years
B.Tech — Electronics & Computer Engineering|4 Years
B.Tech — Electrical Engineering|4 Years
B.Tech — Electrical Engineering with Minor in Computer Science|4 Years
B.Tech — Electrical Engineering with Specialization in Electric Vehicle Technology|4 Years
B.Tech — Mechanical Engineering|4 Years
B.Tech — Mechanical Engineering with Minor in Computer Science|4 Years
B.Tech — Mechanical Engineering (Automobile)|4 Years
B.Tech — Mechanical Engineering (Mechatronics)|4 Years
B.Tech — Civil Engineering|4 Years
B.Tech — Biotechnology|4 Years
BCA — Bachelor of Computer Applications|3 Years
BCA (Hons./By Research)|4 Years
BCA with Specialization in Data Science|3 Years
BCA (Hons./Research) Digital Marketing|4 Years
BCA in Artificial Intelligence & Machine Learning|3 Years
BBA — Management Science|3 Years
BBA (Hons./Research)|4 Years
BBA — Family Business|3 Years
BBA (Hons./Research) Data Analytics & Business Intelligence|4 Years
B.Com — Bachelor of Commerce|3 Years
B.Com (Hons./By Research)|4 Years
B.A. Economics|3 Years
B.A. Economics (Hons./By Research)|4 Years
B.A. English|3 Years
B.A. English (Hons./By Research)|4 Years
B.Sc. Biotechnology|3 Years
B.Sc. Biotechnology (Hons./By Research)|4 Years
B.Sc. (Hons.) Agriculture|4 Years
B.Sc. Chemistry|3 Years
B.Sc. Chemistry (Hons./By Research)|4 Years
B.Sc. Physics|3 Years
B.Sc. Physics (Hons./By Research)|4 Years
B.Sc. Mathematics|3 Years
B.Sc. Mathematics (Hons./By Research) with Specialization in Data Science|4 Years
B.Pharm|4 Years
BA LLB (Hons.)|5 Years
BBA LLB (Hons.)|5 Years
B.Ed.|2 Years
B.Sc. B.Ed. (Integrated Teacher Education Programme)|4 Years
B.Tech CSE (Lateral Entry)|3 Years
B.Tech Electronics & Communication Engineering (Lateral Entry)|3 Years
B.Tech Electronics & Computer Engineering (Lateral Entry)|3 Years
B.Tech Mechanical Engineering (Lateral Entry)|3 Years
B.Tech Civil Engineering (Lateral Entry)|3 Years
B.Tech Electrical Engineering (Lateral Entry)|3 Years
B.Tech Electrical Engineering (EV Technology) (Lateral Entry)|3 Years
B.Tech Biotechnology (Lateral Entry)|3 Years
B.Tech EC with Minor in Computer Science (Lateral Entry)|3 Years
B.Tech EC with Specialization in VLSI (Lateral Entry)|3 Years
B.Pharm (Lateral Entry)|3 Years
M.Tech — Electronics & Communication Engineering|2 Years
M.Tech — Electrical Engineering|2 Years
M.Tech — Computer Science & Engineering|2 Years
M.Tech — Structural Engineering|2 Years
M.Tech — Mechanical Engineering (Design)|2 Years
M.Tech — Mechanical Engineering (Production)|2 Years
M.Tech — Energy Systems|2 Years
M.Tech — Transportation Engineering|2 Years
M.Pharm — Pharmaceutics|2 Years
M.Pharm — Pharmacology|2 Years
MBA|2 Years
MBA (Hons.)|2 Years
MBA — Logistics & Supply Chain Management|2 Years
MBA — Financial Markets & Banking|2 Years
MBA — Business Analytics|2 Years
MCA|2 Years
MCA — Artificial Intelligence & Machine Learning|2 Years
M.Sc. — Biotechnology|2 Years
M.Sc. — Microbiology & Immunology|2 Years
M.Sc. — Chemistry|2 Years
M.Sc. — Physics|2 Years
M.Sc. — Mathematics|2 Years
M.Sc. — Agriculture|2 Years
M.Com|2 Years
LLM — Banking, Finance & Insurance Law / Cyber Law & Data Privacy Law|1 Year
Ph.D. — Computer Science & Engineering|Research Programme
Ph.D. — Electronics & Communication Engineering|Research Programme
Ph.D. — Electrical Engineering|Research Programme
Ph.D. — Mechanical Engineering|Research Programme
Ph.D. — Civil Engineering|Research Programme
Ph.D. — Biotechnology|Research Programme
Ph.D. — Pharmacy|Research Programme
Ph.D. — Microbiology & Immunology|Research Programme
Ph.D. — Physics|Research Programme
Ph.D. — Chemistry|Research Programme
Ph.D. — Mathematics|Research Programme
Ph.D. — English|Research Programme
Ph.D. — Agriculture|Research Programme
`.trim().split('\n')

export const COURSE_CATALOG: CourseOption[] = rows.map((row) => {
  const [name, durationYears] = row.split('|')
  return { name, durationYears }
})

const glaNoidaRows = `
B.Tech — Computer Science|4 Years
B.Tech CSE — Artificial Intelligence & Data Science|4 Years
B.Tech CSE — Cyber Security & AI|4 Years
B.Tech CSE — Cloud & DevOps|4 Years
B.Tech CSE — Gaming Technology|4 Years
B.Tech CSE — IoT & Robotics|4 Years
B.Tech CSE — Business Informatics|4 Years
B.Tech CSE — Full Stack Development|4 Years
B.Tech — Artificial Intelligence & Machine Learning|4 Years
B.Tech — Electronics & Computer Engineering|4 Years
B.Tech CSE (Lateral Entry)|3 Years
B.Tech AIML (Lateral Entry)|3 Years
BBA (AI Enabled)|3 Years
MBA|2 Years
M.Com|2 Years
MCA — Artificial Intelligence & Machine Learning|2 Years
`.trim().split('\n')

export const GLA_NOIDA_COURSE_CATALOG: CourseOption[] = glaNoidaRows.map((row) => {
  const [name, durationYears] = row.split('|')
  return { name, durationYears }
})

export const GL_BAJAJ_MATHURA_COURSE_CATALOG = COURSE_CATALOG
export const GL_BAJAJ_GREATER_NOIDA_COURSE_CATALOG = GLA_NOIDA_COURSE_CATALOG

const lnmiitRows = `
B.Tech. – Artificial Intelligence & Data Science|4 Years
B.Tech. – Artificial Intelligence|4 Years
B.Tech. – Computer Science & Engineering (CSE)|4 Years
B.Tech. – Communication & Computer Engineering (CCE)|4 Years
B.Tech. – Electronics & Communication Engineering (ECE)|4 Years
B.Tech. – Mechanical Engineering (ME)|4 Years
B.Tech. (Hons.) CSE – AI & Data Science specialization|4 Years
B.Tech. (Hons.) CCE – AI & Data Science specialization|4 Years
B.Tech. (Hons.) ME – Robotics & Automation specialization|4 Years
B.Tech. with Minor – Robotics & Automation|4 Years
B.Tech. with Minor – AI & Data Science|4 Years
B.Tech.–M.Tech. Integrated – CSE|5 Years
B.Tech.–M.Tech. Integrated – ECE|5 Years
M.Tech. – Computer Science & Engineering|2 Years
M.Tech. – CSE (AI & Machine Learning)|2 Years
M.Tech. – CSE (Cybersecurity)|2 Years
M.Tech. – Electronics & Communication Engineering|2 Years
M.Tech. – ECE (Wireless Communication & Network Engineering)|2 Years
M.Tech. – ECE (RF & Microwave Engineering)|2 Years
M.Tech. – ECE (VLSI & Embedded Systems)|2 Years
M.Tech. – Artificial Intelligence & Data Science|2 Years
M.S. by Research – CSE|Typically 2 Years
M.S. by Research – ECE|Typically 2 Years
M.S. by Research – CCE|Typically 2 Years
M.Sc. – Physics|2 Years
M.Sc. – Mathematics / Mathematics & Computing|2 Years
Ph.D. – Computer Science & Engineering|Research-dependent
Ph.D. – Communication & Computer Engineering|Research-dependent
Ph.D. – Electronics & Communication Engineering|Research-dependent
Ph.D. – Mechanical & Mechatronics Engineering|Research-dependent
Ph.D. – Physics|Research-dependent
Ph.D. – Mathematics|Research-dependent
Ph.D. – Humanities & Social Sciences|Research-dependent
`.trim().split('\n')

export const LNMIIT_COURSE_CATALOG: CourseOption[] = lnmiitRows.map((row) => {
  const [name, durationYears] = row.split('|')
  return { name, durationYears }
})

const dbsGlobalRows = `
B.Tech CSE|4 years
B.Tech CSE (AI & ML)|4 years
B.Tech CSE (Cyber Security)|4 years
B.Tech CSE (Data Science)|4 years
B.Tech CSE (Apple iOS)|4 years
B.Tech CSE (Full Stack)|4 years
B.Tech CSE (Cloud Computing)|4 years
B.Tech CSE (IoT)|4 years
B.Tech CSE (Drone)|4 years
B.Tech CSE (Robotics)|4 years
B.Tech CSE (Finance)|4 years
B.Tech CSE (Smart Agriculture)|4 years
B.Tech CSE (Media)|4 years
B.Tech CSE (Quantum Computing)|4 years
B.Tech CSE Dual Specialization with HCLTech|4 years
B.Tech CSE (AI & ML + T-Skill Minor)|4 years
B.Tech CSE + MBA (Integrated)|5.5 years
B.Tech CSE + M.Tech (Integrated)|5 years
BCA|3 years
BCA with Dual Specialization|3 years
MCA|2 years
MCA (Full Stack Development)|2 years
M.Tech CSE|2 years
M.Tech CSE by Research|2 years
PhD (Advanced Computing)|minimum 3 years full-time
BBA|3 years
BBA (E-Commerce & Supply Chain)|3 years
BBA (FinTech)|3 years
BBA (Digital Marketing)|3 years
BBA (Business Analytics)|3 years
BBA (Entrepreneurship)|3 years
BBA (HR)|3 years
BBA (Marketing)|3 years
BBA (Finance)|3 years
BBA (International Business)|3 years
BBA (Banking & Insurance)|3 years
BBA (Capital Markets with NISM)|3 years
BBA Honours|4 years
BBA Honours with Research|4 years
B.Com|3 years
B.Com with CA Preparation|3 years
B.Com with UK-ACCA / US-CPA|3 years
B.Com Honours|4 years
B.Com Honours with Research|4 years
BBA + MBA (Integrated)|5 years
MBA|2 years
MBA (Marketing)|2 years
MBA (HR)|2 years
MBA (Finance)|2 years
MBA (Business Analytics)|2 years
MBA (Logistics & Supply Chain)|2 years
MBA (International Business)|2 years
MBA (Healthcare & Pharma)|2 years
MBA (Digital Transformation)|2 years
MBA (Luxury & Fashion Management)|2 years
MBA (Media & Creative Communication)|2 years
MBA Global|2 years
MBA Agri Business|2 years
BA / BS Liberal Studies|3 years
BA / BS Honours|4 years
BA / BS Honours with Research|4 years
B.Sc. (Hons.) Agriculture|4 years
B.Sc. (Hons.) Forestry|4 years
B.Sc. / BBA AgriBusiness|3 years
MA English Literature|2 years
MA Economics|2 years
MA Psychology|2 years
MA History|2 years
M.Sc. Agronomy|2 years
PhD (Liberal Studies)|minimum 3 years full-time
B.A. LL.B. (Hons.)|5 years
B.B.A. LL.B.|5 years
LL.M.|1 year
PhD in Law|minimum 3 years full-time
BA Film & TV|3 years
BA Digital Media & Mass Communication|3 years
MA Mass Communication|2 years
MBA Media & Creative Communication|2 years
PhD (Modern Media)|minimum 3 years full-time
D.Pharm|2 years
B.Pharm|4 years
M.Sc. Pharmaceutical Chemistry|2 years
B.Sc. Nursing|4 years
GNM|3 years
B.Sc. (Hons.) Anesthesia & Operation Theatre Technology (BoTT)|4 years
B.Sc. (Hons.) Medical Laboratory & Technology (BMLT)|4 years
B.Sc. (Hons.) Medical Radio Imaging Technology (BMRIT)|4 years
Bachelor of Physiotherapy (BPT)|4 years
`.trim().split('\n')

export const DBS_GLOBAL_COURSE_CATALOG: CourseOption[] = dbsGlobalRows.map((row) => {
  const [name, durationYears] = row.split('|')
  return { name, durationYears }
})

const lpuRows = `
Diploma in Architectural Assistantship|3 Years
Diploma (Engineering) – Artificial Intelligence & Machine Learning|3 Years
Diploma (Engineering) – Automobile Engineering|3 Years
Diploma (Engineering) – Electrical Engineering|3 Years
Diploma (Engineering) – Computer Science & Engineering|3 Years
Diploma (Engineering) – Electronics & Communication Engineering|3 Years
Diploma (Engineering) – Civil Engineering|3 Years
Diploma (Engineering) – Mechanical Engineering|3 Years
Diploma in Business Administration|3 Years
Diploma in Medical Laboratory Technology (DMLT)|3 Years
B.Sc. (Hons.) Agriculture|4 Years
B.Arch.|5 Years
Bachelor of Arts (B.A.)|3 Years
B.A. (Social Science)|3 Years
B.A. (Hons.) / (Hons. with Research) – English & Political Science|4 Years
B.A. (Fine Arts)|3 Years
B.A. (Journalism & Mass Communication)|3 Years
B.Sc. (Biotechnology)|3 Years
B.Sc. (Hons.) / (Hons. with Research) Biotechnology|4 Years
B.Sc. (Chemistry)|3 Years
B.Sc. (Hons.) / (Hons. with Research) Chemistry|4 Years
B.Com.|3 Years
B.Com. [2+2 International Transfer Option]|4 Years (2+2)
B.Com. (Hons.) / (Hons. with Research)|4 Years
BCA|3 Years
BCA (Artificial Intelligence & Data Analytics)|3 Years
BCA (AI & Robotics)|3 Years
B.Sc. (Information Technology)|3 Years
B.Sc. (Information Technology) [2+2 International Transfer Option]|4 Years (2+2)
B.Sc. (Economics)|3 Years
B.Sc. (Hons.) / (Hons. with Research) Economics|4 Years
B.A. B.Ed. (Secondary Stage) – Four Year Integrated Teacher Education Programme (ITEP)|5 Years
B.Sc. B.Ed. (Secondary Stage) – Four Year Integrated Teacher Education Programme (ITEP)|4 Years
B.A. B.Ed. Special Education (Multiple Disability – Preparatory Stage)|4 Years
B.Tech. Biotechnology|4 Years
B.Tech. Biotechnology [2+2 International Transfer Option]|4 Years (2+2)
B.Tech. Genetics & Artificial Intelligence|4 Years
B.Tech. Computer Science & Engineering|4 Years
B.Tech. Artificial Intelligence & Data Science|4 Years
B.Tech. Artificial Intelligence & Machine Learning|4 Years
B.Tech. CSE – Computer Science & Business Systems|4 Years
B.Tech. CSE [2+2 International Transfer Option]|4 Years (2+2)
B.Tech. Robotics & Artificial Intelligence|4 Years
B.Tech. Information Technology|4 Years
B.Tech. Electronics & Communication Engineering|4 Years
B.Tech. ECE [2+2 International Transfer Option]|4 Years (2+2)
B.Tech. ECE – Artificial Intelligence & Automation|4 Years
B.Tech. Electrical Engineering|4 Years
B.Tech. Civil Engineering|4 Years
B.Tech. Civil Engineering [2+2 International Transfer Option]|4 Years (2+2)
B.Tech. Civil Engineering – Artificial Intelligence & Machine Learning|4 Years
B.Tech. Mechanical Engineering|4 Years
B.Tech. Mechanical Engineering – Mechatronics|4 Years
B.Tech. Mechanical Engineering [2+2 International Transfer Option]|4 Years (2+2)
B.Tech. Mechanical Engineering – Mechatronics [2+2 International Transfer Option]|4 Years (2+2)
B.Tech. Mechanical Engineering – Artificial Intelligence & Machine Learning|4 Years
B.Tech. Automobile Engineering|4 Years
B.Tech. Automobile Engineering [2+2 International Transfer Option]|4 Years (2+2)
B.Tech. Electrical & Electronics Engineering|4 Years
B.Tech. Robotics & Automation|4 Years
B.Tech. Chemical Engineering|4 Years
B.Tech. Aerospace Engineering|4 Years
B.Tech. Biomedical Engineering|4 Years
B.Tech. Food Technology|4 Years
Integrated B.Tech. (Computer Science & Engineering) – MBA|4 Years
B.Design (Fashion)|4 Years
B.Sc. (Fashion Design)|3 Years
B.Design (Fashion) [2+2 International Transfer Option]|4 Years (2+2)
B.Sc. (Film & TV Production)|3 Years
B.Design (Film & TV Production)|4 Years
Bachelor of Fine Arts (BFA)|4 Years
B.Sc. (Food Technology)|3 Years
B.Sc. (Hons.) / (Hons. with Research) Food Technology|4 Years
B.Sc. (Forensic Sciences)|3 Years
B.Sc. (Hons.) / (Hons. with Research) Forensic Sciences|4 Years
BBA (Tourism, Hospitality & Event Management)|3 Years
BBA (Airlines & Airport Management)|3 Years
B.Sc. (Airlines, Tourism & Hospitality)|3 Years
B.Sc. (Culinary Arts)|3 Years
B.Sc. (Hotel & Hospitality Management)|3 Years
Bachelor of Hotel Management & Catering Technology (BHMCT)|4 Years
BHMCT [2+2 International Transfer Option]|4 Years (2+2)
B.Design (UI/UX)|4 Years
B.Sc. (Interior & Furniture Design)|3 Years
B.Design (Interior & Furniture)|4 Years
BBA LL.B. (Hons.)|5 Years
B.A. LL.B. (Hons.)|5 Years
Diploma in Library & Information Sciences (D.Lib.I.Sc.)|1 Year
BBA|3 Years
BBA (Hons.) / (Hons. with Research)|3 Years
BBA [2+2 International Transfer Option]|4 Years (2+2)
BBA (Digital Marketing & Artificial Intelligence)|3 Years
BBA (Artificial Intelligence & Machine Learning)|3 Years
BBA (Cargo, Logistics & Supply Chain Management)|3 Years
Integrated BBA – MBA|5 Years
B.Sc. (Mathematics)|3 Years
B.Sc. (Hons.) / (Hons. with Research) Mathematics|4 Years
Bachelor of Medical Laboratory Science|4 Years
Bachelor of Anaesthesia & Operation Theatre Technology|4 Years
B.Sc. (Clinical Embryology)|4 Years
Bachelor of Optometry|5 Years
Bachelor of Cardiovascular Technology|4 Years
Bachelor of Medical Radiology & Imaging Technology|4 Years
B.Sc. (Microbiology)|3 Years
B.Sc. (Hons.) / (Hons. with Research) Microbiology|4 Years
B.Sc. (Animation & VFX Design)|3 Years
B.Design (Animation & VFX)|4 Years
B.Sc. (Gaming Design)|3 Years
B.Sc. (Graphics Design)|3 Years
B.Design (Graphics)|4 Years
B.Design (Gaming)|4 Years
Bachelor of Nutrition & Dietetics (Honours)|4 Years
B.A. (Music Vocal)|3 Years
B.A. (Theatre)|3 Years
BPA (Music Vocal)|4 Years
BPA (Theatre)|4 Years
B.Pharm.|4 Years
B.Sc. (Health & Physical Education)|3 Years
Bachelor of Physical Education & Sports (BPES)|3 Years
B.Sc. (Physics)|3 Years
B.Sc. (Hons.) / (Hons. with Research) Physics|4 Years
Bachelor of Physiotherapy (B.PT)|5 Years
Integrated B.Tech. – M.Tech. (Urban & Regional Planning)|5 Years
B.Design (Product & Industrial)|4 Years
Bachelor of Psychology (B.Psy)|4 Years
Bachelor of Social Work (BSW)|3 Years
Bachelor of Social Work (Hons.) / (Hons. with Research)|4 Years
B.Sc. (Zoology)|3 Years
B.Sc. (Hons.) / (Hons. with Research) Zoology|4 Years
M.Sc. Ag. (Agronomy)|2 Years
M.Sc. Ag. (Soil Science)|2 Years
M.Sc. Ag. (Genetics & Plant Breeding)|2 Years
M.Sc. Ag. (Entomology)|2 Years
M.Sc. Ag. (Plant Pathology)|2 Years
M.Sc. Ag. Horticulture (Fruit Science)|2 Years
M.Sc. Ag. Horticulture (Vegetable Science)|2 Years
M.Sc. Ag. Horticulture (Floriculture & Landscaping)|2 Years
M.Sc. (Hons.) Biotechnology|2 Years
M.Sc. (Hons.) Chemistry|2 Years
M.Com.|2 Years
M.Sc. (Information Technology)|2 Years
MCA|2 Years
M.Sc. (Economics)|2 Years
M.A. (Economics)|2 Years
M.A. (Education)|2 Years
B.Ed.|2 Years
M.Tech. Biotechnology|2 Years
M.Tech. Biotechnology [1+1 International Transfer Option]|2 Years (1+1)
M.Tech. Food Technology|2 Years
M.Tech. Structural Engineering|2 Years
M.Tech. Construction Management|2 Years
M.Tech. Computer Science & Engineering|2 Years
M.Tech. Data Science & Analytics|2 Years
M.Tech. Information Security & Cyber Forensics|2 Years
M.Tech. Machine Learning & Artificial Intelligence|2 Years
M.Tech. VLSI Design|2 Years
M.Tech. Robotics & Artificial Intelligence|2 Years
M.Tech. Power Systems|2 Years
M.Tech. Aerospace Engineering|2 Years
M.A. English|2 Years
M.Sc. Fashion Design|2 Years
Master of Fashion Management (MFM)|4 Years
M.Sc. Film & TV Production|2 Years
Master of Fine Arts (MFA)|2 Years
M.Sc. Food Science & Technology|2 Years
M.Sc. Forensic Sciences|2 Years
M.Sc. Digital Forensics & Cyber Security|2 Years
M.Sc. Geography|2 Years
M.A. History|2 Years
MBA (Tourism, Aviation & Hospitality)|2 Years
MBA (International Business)|2 Years
MBA (Hospital & Healthcare Management)|2 Years
MBA|2 Years
MBA (Fintech & Artificial Intelligence)|2 Years
MBA (Data Science & Artificial Intelligence)|2 Years
MBA (Digital & Social Media Marketing)|2 Years
M.A. Punjabi|2 Years
M.A. Hindi|2 Years
M.Sc. UI/UX Design|2 Years
M.Design (Interior & Furniture)|2 Years
M.Sc. Interior & Furniture Design|2 Years
M.A. Journalism & Mass Communication|2 Years
LL.B.|3 Years
LL.M.|1 Year
Bachelor of Library & Information Sciences (B.Lib.I.Sc.)|1 Year
Master of Library & Information Sciences (M.Lib.I.Sc.)|1 Year
M.Sc. Mathematics|2 Years
M.A. Mathematics|2 Years
M.Sc. Statistics & Data Analytics|2 Years
Master of Medical Laboratory Science (Medical Microbiology)|2 Years
M.Sc. (Hons.) Microbiology|2 Years
M.Sc. Animation & VFX Design|2 Years
Masters of Nutrition & Dietetics|2 Years
Master of Performing Arts (MPA)|2 Years
M.Pharm. Pharmaceutics|2 Years
M.Pharm. Pharmacology|2 Years
M.Pharm. Pharmaceutical Chemistry|2 Years
M.Pharm. Pharmaceutical Analysis|2 Years
B.P.Ed.|2 Years
M.P.Ed.|2 Years
M.Sc. (Hons.) Physics|2 Years
MPT – Musculoskeletal Science|2 Years
MPT – Neuroscience|2 Years
MPT – Sports Science|2 Years
M.A. Political Science|2 Years
M.A. Psychology|2 Years
M.Sc. Forensic Psychology|2 Years
M.A. Applied Psychology|2 Years
M.A. Counselling Psychology|2 Years
M.A. Sociology|2 Years
Master of Social Work (MSW)|2 Years
M.Sc. (Hons.) Zoology|2 Years
M.Sc. Zoology|1 Year
B.Com. – Lateral Entry|2 Years
B.Sc. Information Technology – Lateral Entry|2 Years
BCA – Lateral Entry|2 Years
B.Tech. CSE – Artificial Intelligence & Machine Learning – Lateral Entry|3 Years
B.Tech. Biotechnology – Lateral Entry|3 Years
B.Tech. Computer Science & Engineering – Lateral Entry|3 Years
B.Tech. Information Technology – Lateral Entry|3 Years
B.Tech. Electronics & Communication Engineering – Lateral Entry|3 Years
B.Tech. Electrical Engineering – Lateral Entry|3 Years
B.Tech. Civil Engineering – Lateral Entry|3 Years
B.Tech. Mechanical Engineering – Lateral Entry|3 Years
B.Tech. Mechanical Engineering – Mechatronics – Lateral Entry|3 Years
B.Tech. Automobile Engineering – Lateral Entry|3 Years
B.Tech. Electrical & Electronics Engineering – Lateral Entry|3 Years
B.Tech. Robotics & Automation – Lateral Entry|3 Years
B.Tech. Chemical Engineering – Lateral Entry|3 Years
B.Tech. Aerospace Engineering – Lateral Entry|3 Years
B.Tech. Biomedical Engineering – Lateral Entry|3 Years
B.Tech. Food Technology – Lateral Entry|3 Years
B.Design Fashion – Lateral Entry|3 Years
B.Sc. Fashion Design – Lateral Entry|2 Years
B.Sc. Airlines, Tourism & Hospitality – Lateral Entry|2 Years
BHMCT – Lateral Entry|3 Years
B.Sc. Hotel & Hospitality Management – Lateral Entry|2 Years
B.Design UI/UX – Lateral Entry|3 Years
B.Design Interior & Furniture – Lateral Entry|3 Years
B.Sc. Interior & Furniture Design – Lateral Entry|2 Years
BBA – Lateral Entry|2 Years
B.Sc. Medical Laboratory Technology – Lateral Entry|2 Years
B.Sc. Optometry – Lateral Entry|3 Years
B.Sc. Anaesthesia & Operation Theatre Technology – Lateral Entry|3 Years
B.Pharm. – Lateral Entry|3 Years
Bachelor of Physiotherapy (BPT) – Lateral Entry|3.5 Years
B.Design Product & Industrial – Lateral Entry|3 Years
B.Sc. Medical Radiology & Imaging Technology – Lateral Entry|3 Years
B.Sc. Cardiovascular Technology – Lateral Entry|3 Years
Diploma (Engineering) Computer Science & Engineering – Lateral Entry|2 Years
Diploma (Engineering) Electronics & Communication Engineering – Lateral Entry|2 Years
Diploma (Engineering) Civil Engineering – Lateral Entry|2 Years
Diploma (Engineering) Mechanical Engineering – Lateral Entry|2 Years
Diploma (Engineering) Artificial Intelligence & Machine Learning – Lateral Entry|2 Years
`.trim().split('\n')

export const LPU_COURSE_CATALOG: CourseOption[] = lpuRows.map((row) => {
  const [name, durationYears] = row.split('|')
  return { name, durationYears }
})

const BSACET_COURSE_CATALOG: CourseOption[] = [
  { name: 'B.Tech – Computer Science & Engineering (CSE)', durationYears: '4 Years' },
  { name: 'B.Tech – Computer Science & Engineering (AI & ML)', durationYears: '4 Years' },
  { name: 'B.Tech – Electrical Engineering (EE)', durationYears: '4 Years' },
  { name: 'B.Tech – Electronics & Communication Engineering (ECE)', durationYears: '4 Years' },
  { name: 'B.Tech – Civil Engineering', durationYears: '4 Years' },
  { name: 'B.Tech – Mechanical Engineering', durationYears: '4 Years' },
  { name: 'BCA – Bachelor of Computer Applications', durationYears: '3 Years' },
  { name: 'BBA – Bachelor of Business Administration', durationYears: '3 Years' },
  { name: 'B.Pharm – Bachelor of Pharmacy', durationYears: '4 Years' },
  { name: 'MBA – Master of Business Administration', durationYears: '2 Years' },
  { name: 'MCA – Master of Computer Applications', durationYears: '2 Years' },
  { name: 'Diploma – Mechanical Engineering (Production)', durationYears: '3 Years' },
  { name: 'Diploma – Mechanical Engineering (Automobile)', durationYears: '3 Years' },
  { name: 'Diploma – Electronics & Communication Engineering', durationYears: '3 Years' },
  { name: 'Diploma – Civil Engineering', durationYears: '3 Years' },
  { name: 'Diploma – Electrical Engineering', durationYears: '3 Years' },
  { name: 'Diploma – Computer Science & Engineering', durationYears: '3 Years' },
  { name: 'D.Pharm – Diploma in Pharmacy', durationYears: '2 Years' },
  { name: 'B.Tech Lateral Entry', durationYears: '3 Years' },
  { name: 'MBA Lateral Entry', durationYears: '1 Year' },
  { name: 'MCA Lateral Entry', durationYears: '1 Year' },
]

const COURSE_CATALOG_BY_COLLEGE: Record<string, CourseOption[]> = {
  'gla-mathura': COURSE_CATALOG,
  'gla-noida': GLA_NOIDA_COURSE_CATALOG,
  'gl-bajaj-mathura': GL_BAJAJ_MATHURA_COURSE_CATALOG,
  'gl-bajaj-greater-noida': GL_BAJAJ_GREATER_NOIDA_COURSE_CATALOG,
  'lpu-phagwara': LPU_COURSE_CATALOG,
  'lnmiit-jaipur': LNMIIT_COURSE_CATALOG,
  'dbs-global-dehradun': DBS_GLOBAL_COURSE_CATALOG,
  'galgotias-greater-noida': GALGOTIAS_COURSE_CATALOG,
  'bsacet-mathura': BSACET_COURSE_CATALOG,
  'mit-wpu-pune': MIT_WPU_COURSE_CATALOG,
  'shoolini-university-bajhol': SHOOLINI_COURSE_CATALOG,
  'chitkara-university-rajpura': CHITKARA_COURSE_CATALOG,
  'thapar-institute-patiala': THAPAR_COURSE_CATALOG,
  'cic-delhi-university': CIC_DELHI_COURSE_CATALOG,
  'kiit-bhubaneswar': KIIT_COURSE_CATALOG,
  'mnnit-allahabad-prayagraj': MNNIT_COURSE_CATALOG,
  'integral-university-lucknow': INTEGRAL_UNIVERSITY_COURSE_CATALOG,
}

export function getCourseCatalogForCollege(collegeId?: string): CourseOption[] {
  return COURSE_CATALOG_BY_COLLEGE[collegeId || ''] || COURSE_CATALOG
}