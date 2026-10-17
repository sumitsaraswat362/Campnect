import { legalConfig } from './legalConfig'

export type LegalSection = {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export type LegalDocument = {
  slug: 'privacy' | 'terms' | 'community-guidelines' | 'cookies' | 'child-safety'
  title: string
  description: string
  sections: LegalSection[]
}

export const legalDocuments: LegalDocument[] = [
  {
    slug: 'child-safety',
    title: 'Child Safety Standards',
    description: 'Our standards for preventing, reporting, and responding to child sexual abuse and exploitation.',
    sections: [
      {
        heading: '1. Our Commitment',
        paragraphs: [
          'Campnect has zero tolerance for child sexual abuse and exploitation (CSAE), including child sexual abuse material (CSAM), grooming, sexual extortion, trafficking, and any content or conduct that exploits or endangers a child.',
          'Campnect is intended for campus communities. We prohibit any use of the service that sexualizes, exploits, harms, or places a child at risk.',
        ],
      },
      {
        heading: '2. Prohibited Content and Conduct',
        paragraphs: ['Users must not create, upload, share, request, promote, or facilitate CSAE or CSAM through posts, Glimpses, Clips, messages, profiles, groups, communities, events, or any other Campnect feature.'],
        bullets: [
          'Any sexual content involving a minor or apparently minor person',
          'Grooming, sexual solicitation, sexual extortion, or trafficking',
          'Sharing, requesting, or distributing CSAM or links to CSAM',
          'Exploitation, abuse, coercion, or endangerment of a child',
        ],
      },
      {
        heading: '3. How to Report a Concern',
        paragraphs: [
          'Users can report accounts and supported content directly in Campnect, including posts, comments, Glimpses, Clips, events, and messages. When reporting, select the most relevant reason and include details that can help us investigate.',
          `For child-safety concerns, users, parents, guardians, and authorities may also contact our designated safety point of contact at ${legalConfig.safetyEmail}. Do not send suspected CSAM by email or attach it to a report.`,
          'If a child is in immediate danger, contact local emergency services or the appropriate child-protection authority immediately.',
        ],
      },
      {
        heading: '4. Review and Enforcement',
        paragraphs: [
          'We review child-safety reports promptly and take action based on the available information and applicable law. Actions may include removing content, restricting features, suspending or permanently banning accounts, preserving relevant records, and cooperating with law enforcement or child-protection authorities where required.',
          'We may use reports, account information, content context, and other relevant evidence to investigate suspected violations. Access to reported material is restricted to authorized personnel with a legitimate safety or moderation need.',
        ],
      },
      {
        heading: '5. Reporting to Authorities',
        paragraphs: [
          'When Campnect becomes aware of apparent CSAM or other reportable child-safety violations, we will make reports to the National Center for Missing & Exploited Children (NCMEC) and to other regional, national, or local authorities when required by applicable law.',
          'We preserve and disclose information only as permitted or required by law and in accordance with our legal obligations and safety processes.',
        ],
      },
      {
        heading: '6. Contact',
        paragraphs: [`For questions about these standards or to report a child-safety concern, contact ${legalConfig.safetyEmail}.`],
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'How Campnect collects, uses, protects, and manages personal information.',
    sections: [
      { heading: '1. Introduction', paragraphs: [`This Privacy Policy explains how ${legalConfig.operator} (“Campnect”, “we”, “us”, or “our”) handles information when you use Campnect. It applies to the Campnect website, mobile app, campus community features, and related services.`] },
      { heading: '2. Information We Collect', paragraphs: ['We collect information you provide, information created through use of the service, and limited technical and security information needed to operate and protect Campnect.'] },
      { heading: '3. Account and Authentication Information', paragraphs: ['When you register or sign in, Campnect processes account information such as your name, email address, username, password credentials, and account role. Campnect uses email verification codes as part of account verification and login security.'] },
      { heading: '4. Campus and Verification Information', paragraphs: ['Campnect is built around campus communities. We process your selected college or campus and information used to verify eligibility, such as a qualifying educational email domain and verification status.'] },
      { heading: '5. Profile Information', paragraphs: ['Your profile may include your name, username, avatar or cover image, bio, college, academic details, interests, skills, social links, relationship status, and privacy preferences. Some profile information may be visible to other users according to your privacy settings and account visibility.'] },
      { heading: '6. Content You Create', paragraphs: ['We process content you choose to create or upload, including posts, comments, reactions, saves, shares, Glimpses, Clips, events, communities, and group activity. This may include text, images, videos, audio, links, and associated content metadata.'] },
      { heading: '7. Social and Interaction Data', paragraphs: ['Campnect processes follows, follow requests, close-mate selections, likes, comments, saves, shares, blocks, privacy choices, and similar interactions so that social features and chosen audiences work as intended.'] },
      { heading: '8. Messages and Communications', paragraphs: ['Campnect supports one-to-one, group, and event conversations. We process message content and attachments to provide the conversation. Private conversations are not generally treated as an administrator-readable inbox; specifically reported content may be reviewed by authorized personnel where applicable for moderation or safety purposes.'] },
      { heading: '9. Media and Files', paragraphs: ['Media associated with posts, profile surfaces, Glimpses, Clips, events, and conversations is access-controlled according to the relevant feature, audience, membership, privacy, block, and moderation settings. Verification media is handled separately from ordinary user media.'] },
      { heading: '10. Notifications and Push Data', paragraphs: ['Campnect stores in-app notification activity and your notification preferences. On supported Android devices, we may use OneSignal to manage a push subscription or device identifier so we can deliver notifications you choose to receive. You can manage notification permissions through your device and available app settings.'] },
      { heading: '11. Device and Technical Information', paragraphs: ['We process technical information needed to provide and secure the service, such as device or browser characteristics, platform, and network-related information.'] },
      { heading: '12. Security and Authentication Logs', paragraphs: ['Campnect records security-relevant account activity, including login attempts and related device, platform, network, and user-agent information, to help detect abuse, maintain account security, and investigate service issues.'] },
      { heading: '13. Activity and Operational Logs', paragraphs: ['We may maintain operational records necessary to operate features, diagnose errors, preserve reliability, and protect the community.'] },
      { heading: '14. Reports, Moderation and Appeals', paragraphs: ['If you submit a report or appeal, we process the report target, reason, optional details, and the information needed to investigate and manage the case. Authorized moderation personnel may record actions and outcomes.'] },
      { heading: '15. How We Use Information', paragraphs: ['We use information to provide and personalize Campnect features, verify and secure accounts, manage campus access, deliver content and communications, enforce our rules, respond to reports, and maintain the service.'] },
      { heading: '16. How We Share Information', paragraphs: ['Information is shared with other users according to the feature you use and your visibility settings. For example, content, profiles, and activity can be visible to the audience permitted by the applicable privacy, membership, follow, and moderation controls.'] },
      { heading: '17. Service Providers', paragraphs: ['Campnect uses service providers where necessary to operate the service. OneSignal is used for supported push-notification delivery. A current provider list and any required disclosures should be maintained by Campnect before these documents are finalized.'] },
      { heading: '18. Security', paragraphs: ['Campnect uses access controls and security measures designed to protect information and restrict protected media and account areas. No method of transmission or storage is completely secure, and users should also protect their account credentials.'] },
      { heading: '19. Data Retention', paragraphs: [`Campnect retains information for periods determined by ${legalConfig.operator}'s operational, safety, and legal requirements. [DATA RETENTION DETAILS TO BE CONFIRMED]` ] },
      { heading: '20. Account Deactivation and Deletion', paragraphs: ['Campnect can manage account status in connection with safety and moderation processes. [ACCOUNT DELETION / DEACTIVATION REQUEST PROCESS TO BE CONFIRMED]'] },
      { heading: '21. Your Choices and Rights', paragraphs: ['You can manage certain profile, privacy, follow, blocking, and notification settings in Campnect. [PRIVACY REQUESTS / ACCESS / CORRECTION / DELETION PROCESS TO BE CONFIRMED]'] },
      { heading: '22. Age Requirements', paragraphs: [`You must meet Campnect's applicable age and eligibility requirement: ${legalConfig.minimumAge}.`] },
      { heading: '23. International Data Transfers', paragraphs: ['[INTERNATIONAL DATA TRANSFER INFORMATION TO BE CONFIRMED]'] },
      { heading: '24. Changes to This Policy', paragraphs: ['We may update this policy when Campnect changes or when legal or operational requirements change. The current version will state its last-updated date.'] },
      { heading: '25. Contact', paragraphs: [`For privacy questions, contact ${legalConfig.privacyEmail}.`] },
    ],
  },
  {
    slug: 'terms',
    title: 'Terms of Service',
    description: 'The rules and conditions for using Campnect.',
    sections: [
      { heading: '1. Acceptance of Terms', paragraphs: [`By creating an account or using Campnect, you agree to these Terms and the Community Guidelines. Campnect is operated by ${legalConfig.operator}.`] },
      { heading: '2. Eligibility', paragraphs: [`You may use Campnect only if you satisfy the applicable age requirement (${legalConfig.minimumAge}) and any applicable campus or college eligibility requirements.`] },
      { heading: '3. Account Registration and Security', paragraphs: ['Provide accurate account information, keep your credentials secure, and do not allow another person to use your account. You are responsible for activity on your account unless you promptly report suspected unauthorized use.'] },
      { heading: '4. Campus Verification', paragraphs: ['Campnect may require an eligible college email address and verification process before enabling account or campus features. We may limit or remove verification when eligibility cannot be confirmed.'] },
      { heading: '5. Usernames and Profiles', paragraphs: ['Do not choose a username or profile that impersonates another person, misleads users, violates rights, or breaks these Terms. Campnect may require a username change where necessary for safety, accuracy, or policy enforcement.'] },
      { heading: '6. Your Content', paragraphs: ['You remain responsible for content you create, upload, share, or send through Campnect. You must have the rights and permissions needed to provide that content and must respect the visibility choices available in the product.'] },
      { heading: '7. Posts, Media, Links, Glimpses and Clips', paragraphs: ['Do not post unlawful, harmful, deceptive, infringing, or abusive content. Links, images, videos, audio, and other media are subject to these Terms and the Community Guidelines.'] },
      { heading: '8. Messaging, Groups and Events', paragraphs: ['Use one-to-one chats, groups, event chats, communities, and events responsibly. Do not use these features to harass, spam, threaten, deceive, or violate another person’s privacy.'] },
      { heading: '9. Prohibited Uses', paragraphs: ['You may not misuse Campnect, interfere with the service, bypass access controls, scrape or automate access without permission, create fraudulent accounts, or use Campnect for unlawful activity.'], bullets: ['Harassment, bullying, hateful or abusive conduct', 'Sexual or otherwise inappropriate content that violates our guidelines', 'Threats, violence, exploitation, scams, fraud, or impersonation', 'Privacy violations, doxxing, spam, malware, or copyright infringement'] },
      { heading: '10. Reports and Moderation', paragraphs: ['Users can report supported content and accounts through Campnect. Campnect may review reports and take action under these Terms and the Community Guidelines. A report does not guarantee a particular outcome or response time.'] },
      { heading: '11. Restrictions, Suspension and Ban', paragraphs: ['Where appropriate, Campnect may issue warnings; limit messaging, posting, comments, events, groups, or other features; restrict visibility; remove content; temporarily suspend; deactivate; or permanently ban accounts.'] },
      { heading: '12. Appeals and Restorations', paragraphs: ['Eligible moderation actions may be appealed through Campnect’s available process. An appeal may be approved, rejected, or escalated. Campnect may restore content or access where an action is changed.'] },
      { heading: '13. Intellectual Property', paragraphs: ['Respect intellectual-property rights. Do not use or share material unless you have the right to do so. Campnect and its branding, software, and service content are protected as applicable by law.'] },
      { heading: '14. Third-Party Services', paragraphs: ['Some features may rely on third-party services, including push-notification delivery. Your use of those services may also be subject to their terms and privacy practices.'] },
      { heading: '15. Availability and Changes', paragraphs: ['Campnect may change, limit, suspend, or discontinue features. The service may be unavailable during maintenance, technical problems, or other operational circumstances.'] },
      { heading: '16. Disclaimers and Liability', paragraphs: ['[DISCLAIMERS AND LIMITATION-OF-LIABILITY LANGUAGE TO BE CONFIRMED FOR THE APPLICABLE JURISDICTION]'] },
      { heading: '17. Governing Law', paragraphs: [`These Terms are governed by: ${legalConfig.jurisdiction}.`] },
      { heading: '18. Changes and Contact', paragraphs: [`We may update these Terms and will post the current version here. For legal questions, contact ${legalConfig.legalEmail}.`] },
    ],
  },
  {
    slug: 'community-guidelines',
    title: 'Community Guidelines',
    description: 'Standards for safe and respectful campus communities.',
    sections: [
      { heading: '1. Our Campus Community', paragraphs: ['Campnect is for campus connection. Treat classmates, staff, faculty, and every community member with respect, including when you disagree.'] },
      { heading: '2. No Harassment or Bullying', paragraphs: ['Do not target people with repeated unwanted contact, intimidation, humiliation, insults, stalking, bullying, or hateful and abusive conduct.'] },
      { heading: '3. No Sexual or Inappropriate Content', paragraphs: ['Do not share sexual, exploitative, non-consensual, or otherwise inappropriate content. Never share intimate material without the person’s permission.'] },
      { heading: '4. No Violence or Threats', paragraphs: ['Do not threaten, glorify, organize, encourage, or promote violence or physical harm. Report imminent safety concerns to appropriate local emergency services as well as through Campnect when possible.'] },
      { heading: '5. Authenticity and Safety', paragraphs: ['Do not impersonate another person, operate fake accounts to deceive others, run scams, commit fraud, or misrepresent your identity, affiliation, or intentions.'] },
      { heading: '6. Privacy and Personal Information', paragraphs: ['Do not share another person’s private information, private media, messages, location, credentials, or identifying details without permission. Respect account visibility, private profiles, and blocks.'] },
      { heading: '7. Illegal and Harmful Activity', paragraphs: ['Do not use Campnect to facilitate illegal activity, exploitation, self-harm encouragement, dangerous behavior, or other serious harm.'] },
      { heading: '8. Misinformation, Spam and Copyright', paragraphs: ['Do not knowingly spread harmful misinformation, send spam, manipulate engagement, distribute malicious links, or infringe intellectual-property rights.'] },
      { heading: '9. Report Problems', paragraphs: ['Use Campnect’s reporting tools to report users and supported content such as posts, comments, events, and communities. Include enough context to help a review when you can.'] },
      { heading: '10. What May Happen After a Report', paragraphs: ['Depending on the situation, Campnect may issue a warning, restrict chat or content features, limit visibility, remove content, change verification or usernames where necessary, temporarily suspend, or permanently ban an account. Not every report results in removal or a visible outcome.'] },
      { heading: '11. Appeals', paragraphs: ['Users may appeal eligible moderation actions through available Campnect processes. Appeals may be approved, rejected, or escalated.'] },
      { heading: '12. Help Keep Campnect Safe', paragraphs: ['These Guidelines cannot cover every harmful situation. We may act on behavior that creates a credible risk to people or the campus community, even when it is not listed word-for-word above.'] },
    ],
  },
  {
    slug: 'cookies',
    title: 'Cookie and Storage Policy',
    description: 'How Campnect uses cookies and browser or device storage technologies.',
    sections: [
      { heading: '1. Overview', paragraphs: ['This policy explains how Campnect uses browser and device storage technologies. Browser storage and cookies are different technologies; Campnect does not describe all local storage as cookies.'] },
      { heading: '2. Essential Browser Storage', paragraphs: ['The Campnect web app uses browser local storage to preserve essential signed-in state and app information needed to keep the service working between visits. It also uses session storage for temporary login-verification and in-app navigation state.'] },
      { heading: '3. Authentication and Sessions', paragraphs: ['Campnect uses bearer-token session mechanisms for app authentication. In the current consumer app implementation, authenticated state is persisted in browser local storage rather than through an observed browser authentication cookie.'] },
      { heading: '4. Preferences and Functional Storage', paragraphs: ['Campnect stores app preferences and temporary functional state where needed to provide features. These technologies are used for service functionality, not described here as advertising cookies.'] },
      { heading: '5. Push Notifications', paragraphs: ['On supported Android devices, Campnect uses OneSignal for push-notification subscriptions and related device identifiers. These identifiers are not automatically browser cookies. Device notification permission can be managed through the device and available app settings.'] },
      { heading: '6. Analytics and Advertising', paragraphs: ['The current Campnect web implementation does not include verified third-party web analytics or advertising-tracker integrations. Campnect does not use this policy to claim advertising-cookie practices that are not present in the current implementation.'] },
      { heading: '7. Third-Party Resources', paragraphs: ['Campnect may load fonts from Google Fonts. Google may process requests needed to deliver those resources under its own terms and privacy policy.'] },
      { heading: '8. Your Controls', paragraphs: ['You can use browser controls to clear local or session storage and device settings to manage notification permission. Clearing essential storage may sign you out or affect app functionality.'] },
      { heading: '9. Changes and Contact', paragraphs: [`We may update this policy as Campnect’s technologies change. For questions, contact ${legalConfig.privacyEmail}.`] },
    ],
  },
]

export const documentBySlug = Object.fromEntries(legalDocuments.map((document) => [document.slug, document])) as Record<LegalDocument['slug'], LegalDocument>