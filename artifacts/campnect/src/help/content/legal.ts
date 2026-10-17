import { createHelpArticle } from '../helpModel'

export const legalArticles = [
  createHelpArticle({
    id: 'legal-privacy', slug: 'privacy-policy', title: 'Read the Privacy Policy', category: 'Legal & Policies',
    description: 'Open the Privacy Policy link from the Legal section to read the currently published policy.',
    keywords: ['privacy policy', 'personal data', 'legal', 'privacy'],
    aliases: ['Campnect privacy notice', 'how Campnect handles data', 'privacy document'],
    steps: [
      { title: 'Open Legal', body: 'Go to Profile → Settings → Legal.' },
      { title: 'Open Privacy Policy', body: 'Choose the Privacy Policy link.' },
      { title: 'Review the published page', body: 'Read the policy linked for your current Campnect environment.' },
    ],
    notes: ['This Help article summarizes no legal rights or retention promises; the linked policy is the source of policy text.'],
    relatedArticles: ['legal-terms', 'legal-cookies', 'export', 'privacy'],
  }),
  createHelpArticle({
    id: 'legal-terms', slug: 'terms-of-service', title: 'Read the Terms of Service', category: 'Legal & Policies',
    description: 'Open the Terms of Service from Settings → Legal.',
    keywords: ['terms of service', 'terms', 'legal', 'rules'],
    aliases: ['Campnect terms', 'terms and conditions', 'user agreement'],
    steps: [
      { title: 'Open Legal', body: 'Go to Profile → Settings → Legal.' },
      { title: 'Open Terms of Service', body: 'Choose the Terms of Service link to view its currently configured destination.' },
    ],
    notes: ['Do not treat this Help article as a legal interpretation of the Terms of Service.'],
    relatedArticles: ['legal-privacy', 'legal-guidelines', 'legal-cookies'],
  }),
  createHelpArticle({
    id: 'legal-guidelines', slug: 'community-guidelines', title: 'Read the Community Guidelines', category: 'Legal & Policies',
    description: 'Open the Community Guidelines link in Legal to review Campnect’s published community rules.',
    keywords: ['community guidelines', 'rules', 'moderation', 'content'],
    aliases: ['what content is allowed', 'Campnect community rules', 'guidelines link'],
    steps: [
      { title: 'Open Legal', body: 'Go to Profile → Settings → Legal.' },
      { title: 'Choose Community Guidelines', body: 'Open the Community Guidelines link.' },
      { title: 'Review before posting', body: 'Read the current policy text before sharing content or submitting an appeal.' },
    ],
    notes: ['A content report or appeal in the app is separate from reading the policy.'],
    relatedArticles: ['content-appeal', 'comment-warning', 'report'],
  }),
  createHelpArticle({
    id: 'legal-cookies', slug: 'cookie-policy', title: 'Read the Cookie Policy', category: 'Legal & Policies',
    description: 'Open the Cookie Policy link from the Legal section.',
    keywords: ['cookie policy', 'cookies', 'tracking', 'legal'],
    aliases: ['Campnect cookies', 'cookie document'],
    steps: [
      { title: 'Open Legal', body: 'Go to Profile → Settings → Legal.' },
      { title: 'Choose Cookie Policy', body: 'Open the Cookie Policy link to read its currently configured destination.' },
    ],
    relatedArticles: ['legal-privacy', 'legal-terms'],
  }),
  createHelpArticle({
    id: 'legal-support-contact', slug: 'contact-support-availability', title: 'Contact Campnect support', category: 'Legal & Policies',
    description: 'The app displays a support-contact link only when a valid support URL is configured for the current environment.',
    keywords: ['support', 'contact', 'help', 'email'],
    aliases: ['how to contact Campnect', 'Campnect support email', 'customer service'],
    body: ['Look for the support contact shown in the Help area of your current app. It is configured per environment and may be unavailable. Do not use an email or address found in unrelated signup or policy text as a general support contact.'],
    notes: ['If no contact link is shown, this Help content does not provide a replacement support email or promise a response channel. Technical bug reports are not the same as content reports.'],
    relatedArticles: ['technical-report-unavailable', 'college-change', 'legal-privacy'],
  }),
]