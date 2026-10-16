// @ts-nocheck
/** College domain registry for Campnect email validation */

// Map of well-known college domains to college names
export const DOMAIN_TO_COLLEGE: Record<string, string> = {
  // GLA University (primary supported institution)
  'gla.ac.in': 'GLA University',
  // The LNM Institute of Information Technology, Jaipur
  'lnmiit.ac.in': 'The LNM Institute of Information Technology (LNMIIT), Jaipur',
  // DBS Global University, Dehradun
  'dgu.ac.in': 'DBS Global University',
  // GL Bajaj, Mathura & Greater Noida
  'glbajajgroup.org': 'GL Bajaj',
  // Lovely Professional University, Phagwara
  'lpu.in': 'Lovely Professional University',
  // Galgotias University, Greater Noida
  'galgotiasuniversity.ac.in': 'Galgotias University',
  // Chitkara University, Rajpura
  'chitkara.edu.in': 'Chitkara University',
  // Thapar Institute of Engineering & Technology, Patiala
  'thapar.edu': 'Thapar Institute of Engineering & Technology (TIET)',
  // Kalinga Institute of Industrial Technology, Bhubaneswar
  'student.kiit.ac.in': 'Kalinga Institute of Industrial Technology (KIIT)',
  // Motilal Nehru National Institute of Technology Allahabad, Prayagraj
  'mnnit.ac.in': 'Motilal Nehru National Institute of Technology Allahabad',
  // Integral University, Lucknow
  'student.iul.ac.in': 'Integral University',
  // US Elite
  'mit.edu': 'Massachusetts Institute of Technology',
  'stanford.edu': 'Stanford University',
  'harvard.edu': 'Harvard University',
  'caltech.edu': 'California Institute of Technology',
  'cmu.edu': 'Carnegie Mellon University',
  'berkeley.edu': 'UC Berkeley',
  'columbia.edu': 'Columbia University',
  'princeton.edu': 'Princeton University',
  'yale.edu': 'Yale University',
  'cornell.edu': 'Cornell University',
  'duke.edu': 'Duke University',
  'uchicago.edu': 'University of Chicago',
  'upenn.edu': 'University of Pennsylvania',
  'nyu.edu': 'New York University',
  'usc.edu': 'University of Southern California',
  'ucla.edu': 'UCLA',
  'umich.edu': 'University of Michigan',
  'utexas.edu': 'UT Austin',
  'gatech.edu': 'Georgia Tech',
  'purdue.edu': 'Purdue University',
  'uiuc.edu': 'UIUC',
  'uw.edu': 'University of Washington',
  'osu.edu': 'Ohio State University',
  'psu.edu': 'Penn State University',
  'asu.edu': 'Arizona State University',
  'ufl.edu': 'University of Florida',
  'wisc.edu': 'University of Wisconsin-Madison',
  'unc.edu': 'UNC Chapel Hill',
  'bu.edu': 'Boston University',
  'bc.edu': 'Boston College',
  'northeastern.edu': 'Northeastern University',
  'tufts.edu': 'Tufts University',
  'brown.edu': 'Brown University',
  'dartmouth.edu': 'Dartmouth College',
  'vanderbilt.edu': 'Vanderbilt University',
  'rice.edu': 'Rice University',
  'nd.edu': 'University of Notre Dame',
  'georgetown.edu': 'Georgetown University',
  'emory.edu': 'Emory University',
  'ucsd.edu': 'UC San Diego',
  'ucdavis.edu': 'UC Davis',
  'ucsb.edu': 'UC Santa Barbara',
  'uci.edu': 'UC Irvine',
  'ucsc.edu': 'UC Santa Cruz',
  'ucr.edu': 'UC Riverside',
  'ucmerced.edu': 'UC Merced',
  'rutgers.edu': 'Rutgers University',
  'stonybrook.edu': 'Stony Brook University',
  'buffalo.edu': 'University at Buffalo',
  'miami.edu': 'University of Miami',
  'tulane.edu': 'Tulane University',
  'fordham.edu': 'Fordham University',
  'drexel.edu': 'Drexel University',
  'temple.edu': 'Temple University',
  'lehigh.edu': 'Lehigh University',
  'rpi.edu': 'Rensselaer Polytechnic Institute',
  'wpi.edu': 'WPI',
  'rochester.edu': 'University of Rochester',
  'rit.edu': 'RIT',
  'stevens.edu': 'Stevens Institute of Technology',
  'njit.edu': 'NJIT',
  'udel.edu': 'University of Delaware',
  'vt.edu': 'Virginia Tech',
  'uva.edu': 'University of Virginia',
  'gwu.edu': 'George Washington University',
  'american.edu': 'American University',
  'howard.edu': 'Howard University',
  'bama.ua.edu': 'University of Alabama',
  'auburn.edu': 'Auburn University',
  'lsu.edu': 'Louisiana State University',
  'clemson.edu': 'Clemson University',
  'sc.edu': 'University of South Carolina',
  'colorado.edu': 'University of Colorado Boulder',
  'colostate.edu': 'Colorado State University',
  'utah.edu': 'University of Utah',
  'byu.edu': 'Brigham Young University',
  'unl.edu': 'University of Nebraska-Lincoln',
  'iastate.edu': 'Iowa State University',
  'uiowa.edu': 'University of Iowa',
  'umn.edu': 'University of Minnesota',
  'ksu.edu': 'Kansas State University',
  'ku.edu': 'University of Kansas',
  'mizzou.edu': 'University of Missouri',
  'wustl.edu': 'Washington University in St. Louis',
  'slu.edu': 'Saint Louis University',
  'marquette.edu': 'Marquette University',
  'uwm.edu': 'UW-Milwaukee',
  'msu.edu': 'Michigan State University',
  'wayne.edu': 'Wayne State University',
  'umd.edu': 'University of Maryland',
  'gmu.edu': 'George Mason University',
  'jhu.edu': 'Johns Hopkins University',
  'loyola.edu': 'Loyola University',

  // India - IITs
  'iitb.ac.in': 'IIT Bombay',
  'iitm.ac.in': 'IIT Madras',
  'iitd.ac.in': 'IIT Delhi',
  'iitk.ac.in': 'IIT Kanpur',
  'iitkgp.ac.in': 'IIT Kharagpur',
  'iith.ac.in': 'IIT Hyderabad',
  'iitg.ac.in': 'IIT Guwahati',
  'iiti.ac.in': 'IIT Indore',
  'iitj.ac.in': 'IIT Jodhpur',
  'iitp.ac.in': 'IIT Patna',
  'iitrpr.ac.in': 'IIT Ropar',
  'iitmandi.ac.in': 'IIT Mandi',
  'iitbhu.ac.in': 'IIT BHU',
  'iitism.ac.in': 'IIT (ISM) Dhanbad',
  'iitbbs.ac.in': 'IIT Bhubaneswar',
  'iitgn.ac.in': 'IIT Gandhinagar',
  'iitpkd.ac.in': 'IIT Palakkad',
  'iittlr.ac.in': 'IIT Tirupati',
  'iitdh.ac.in': 'IIT Dharwad',
  'iitjammu.ac.in': 'IIT Jammu',
  'iitbhilai.ac.in': 'IIT Bhilai',
  'iitgoa.ac.in': 'IIT Goa',

  // India - IISc & IISERs
  'iisc.ac.in': 'Indian Institute of Science',
  'iiserpune.ac.in': 'IISER Pune',
  'iiserb.ac.in': 'IISER Bhopal',
  'iisertvm.ac.in': 'IISER Thiruvananthapuram',
  'iiserkolkata.ac.in': 'IISER Kolkata',
  'iisermohali.ac.in': 'IISER Mohali',
  'iisertirupati.ac.in': 'IISER Tirupati',
  'iiserbpr.ac.in': 'IISER Berhampur',

  // India - NITs & BITS
  'nitk.ac.in': 'NIT Karnataka',
  'nitw.ac.in': 'NIT Warangal',
  'nitt.edu': 'NIT Trichy',
  'nitp.ac.in': 'NIT Patna',
  'nits.ac.in': 'NIT Silchar',
  'bits-pilani.ac.in': 'BITS Pilani',
  'pilani.bits-pilani.ac.in': 'BITS Pilani',
  'hyderabad.bits-pilani.ac.in': 'BITS Hyderabad',
  'goa.bits-pilani.ac.in': 'BITS Goa',
  'dubai.bits-pilani.ac.in': 'BITS Dubai',

  // India - Top Universities
  'du.ac.in': 'Delhi University',
  'cic.du.ac.in': 'Cluster Innovation Centre (CIC), University of Delhi',
  'jnu.ac.in': 'Jawaharlal Nehru University',
  'bhu.ac.in': 'Banaras Hindu University',
  'aiimsdelhi.edu.in': 'AIIMS Delhi',
  'vit.ac.in': 'VIT University',
  'manipal.edu': 'Manipal University',
  'christuniversity.in': 'Christ University',
  'srm.edu.in': 'SRM University',
  'amity.edu': 'Amity University',
  'iimb.ac.in': 'IIM Bangalore',
  'iima.ac.in': 'IIM Ahmedabad',
  'iimcal.ac.in': 'IIM Calcutta',
  'xlri.ac.in': 'XLRI Jamshedpur',
  'spjimr.org': 'SPJIMR',
  'isb.edu': 'ISB Hyderabad',
  'bsacet.org': 'B.S.A. Crescent Institute of Science and Technology',
  'shooliniuniversity.com': 'Shoolini University',

  // UK
  'ox.ac.uk': 'University of Oxford',
  'cam.ac.uk': 'University of Cambridge',
  'imperial.ac.uk': 'Imperial College London',
  'ucl.ac.uk': 'University College London',
  'lse.ac.uk': 'London School of Economics',
  'ed.ac.uk': 'University of Edinburgh',
  'kcl.ac.uk': "King's College London",
  'manchester.ac.uk': 'University of Manchester',
  'birmingham.ac.uk': 'University of Birmingham',
  'warwick.ac.uk': 'University of Warwick',
  'bristol.ac.uk': 'University of Bristol',
  'durham.ac.uk': 'Durham University',
  'nottingham.ac.uk': 'University of Nottingham',
  'soton.ac.uk': 'University of Southampton',
  'leeds.ac.uk': 'University of Leeds',
  'sheffield.ac.uk': 'University of Sheffield',
  'st-andrews.ac.uk': 'University of St Andrews',
  'glasgow.ac.uk': 'University of Glasgow',
  'qmul.ac.uk': 'Queen Mary University of London',

  // Australia
  'anu.edu.au': 'Australian National University',
  'unimelb.edu.au': 'University of Melbourne',
  'sydney.edu.au': 'University of Sydney',
  'unsw.edu.au': 'UNSW Sydney',
  'uq.edu.au': 'University of Queensland',
  'monash.edu': 'Monash University',
  'uwa.edu.au': 'University of Western Australia',
  'adelaide.edu.au': 'University of Adelaide',

  // Canada
  'utoronto.ca': 'University of Toronto',
  'ubc.ca': 'University of British Columbia',
  'mcgill.ca': 'McGill University',
  'uwaterloo.ca': 'University of Waterloo',
  'ualberta.ca': 'University of Alberta',
  'queensu.ca': "Queen's University",
  'mail.mcgill.ca': 'McGill University',
  'student.ubc.ca': 'University of British Columbia',

  // Singapore
  'nus.edu.sg': 'National University of Singapore',
  'ntu.edu.sg': 'Nanyang Technological University',
  'smu.edu.sg': 'Singapore Management University',

  // Other notable
  'ethz.ch': 'ETH Zurich',
  'epfl.ch': 'EPFL',
  'tu-berlin.de': 'TU Berlin',
  'tum.de': 'Technical University of Munich',
}

// TLD-based college email rules
const COLLEGE_TLDS = [
  '.edu',
  '.ac.uk',
  '.ac.in',
  '.edu.au',
  '.edu.sg',
  '.edu.pk',
  '.edu.bd',
  '.edu.np',
  '.edu.lk',
  '.ac.nz',
  '.edu.ph',
  '.edu.my',
  '.ac.id',
  '.edu.vn',
  '.edu.hk',
  '.edu.tw',
  '.edu.cn',
  '.ac.jp',
  '.edu.co',
  '.edu.br',
  '.edu.mx',
  '.edu.ar',
  '.edu.za',
  '.ac.ke',
  '.edu.ng',
  '.edu.gh',
  '.ac.ug',
  '.edu.eg',
  '.ac.il',
  '.edu.tr',
  '.edu.sa',
  '.ac.ae',
  '.ac.ir',
  '.edu.kw',
  '.edu.qa',
]

export function isCollegeEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  // Check known domains map
  if (DOMAIN_TO_COLLEGE[domain]) return true
  // Check TLD rules
  for (const tld of COLLEGE_TLDS) {
    if (domain.endsWith(tld)) return true
  }
  return false
}

export function getCollegeNameByEmail(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return null
  if (DOMAIN_TO_COLLEGE[domain]) return DOMAIN_TO_COLLEGE[domain]
  // Generic name from domain
  for (const tld of COLLEGE_TLDS) {
    if (domain.endsWith(tld)) {
      const name = domain.replace(tld, '').split('.').pop() || ''
      return name.charAt(0).toUpperCase() + name.slice(1) + ' University'
    }
  }
  return null
}

export function getCollegeDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || ''
}
