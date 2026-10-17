import { createHelpArticle } from '../helpModel'

export const communityArticles = [
  createHelpArticle({
    id: 'community-discover', slug: 'discover-communities', title: 'Discover communities', category: 'Communities',
    description: 'Browse the Communities area and use its category, search, and joined-community views.',
    keywords: ['communities', 'discover', 'browse', 'category'],
    aliases: ['find a community', 'campus interest groups', 'browse groups'],
    steps: [
      { title: 'Open Communities', body: 'Choose Communities from the app navigation.' },
      { title: 'Browse or search', body: 'Use the available category filters, search, or Joined view to find communities.' },
      { title: 'Open a community', body: 'Choose a community card to view its posts, events, and member information.' },
    ],
    relatedArticles: ['community-join-leave', 'community-create', 'community-content'],
  }),
  createHelpArticle({
    id: 'community-join-leave', slug: 'join-or-leave-a-community', title: 'Join or leave a community', category: 'Communities',
    description: 'Use the Join or Joined control on a community card or community page.',
    keywords: ['join community', 'leave community', 'membership'],
    aliases: ['become a member', 'exit a community', 'remove myself from community'],
    steps: [
      { title: 'Open the community', body: 'Choose the community from Communities.' },
      { title: 'Join or leave', body: 'Choose “Join Community” or “Join” if you are not a member. Choose the Joined/leave control to leave.' },
      { title: 'Check the result', body: 'For private communities, follow any invite or approval requirement shown in the app.' },
    ],
    notes: ['Community membership and event attendance are separate. Community chat is currently marked “coming soon” in its tab.'],
    relatedArticles: ['community-discover', 'community-create', 'community-content'],
  }),
  createHelpArticle({
    id: 'community-create', slug: 'create-a-community', title: 'Create a community', category: 'Communities',
    description: 'Create a community with the name, description, category, and privacy choice shown in the form.',
    keywords: ['create community', 'new community', 'private community'],
    aliases: ['start a community', 'make a campus group', 'community owner'],
    steps: [
      { title: 'Open community creation', body: 'Open Communities and choose “Create a Community”.' },
      { title: 'Complete the form', body: 'Enter the required community name and the description/category fields shown.' },
      { title: 'Choose privacy', body: 'If the form offers “Private community”, review that only invited members can join before selecting it.' },
      { title: 'Create', body: 'Choose “Create” and wait for the confirmation.' },
    ],
    relatedArticles: ['community-edit', 'community-join-leave', 'community-content'],
  }),
  createHelpArticle({
    id: 'community-content', slug: 'find-community-posts-members-and-events', title: 'Find community posts, members, and events', category: 'Communities',
    description: 'Community pages provide tabs for posts, members, and events.',
    keywords: ['community posts', 'members', 'events', 'tabs'],
    aliases: ['view community members', 'community event list', 'community feed'],
    steps: [
      { title: 'Open a community page', body: 'Choose the community from Communities.' },
      { title: 'Choose a tab', body: 'Use Posts, Members, or Events to view the available community content.' },
      { title: 'Check membership access', body: 'Join or complete any private-community access step if the content requires it.' },
    ],
    notes: ['The Chat tab is visible but displays that community chat is coming soon. It is not currently an available community conversation workflow.'],
    relatedArticles: ['community-discover', 'community-join-leave', 'community-chat-unavailable'],
  }),
  createHelpArticle({
    id: 'community-edit', slug: 'edit-a-community', title: 'Edit a community', category: 'Communities',
    description: 'Community owners and admins can edit the community details exposed by Edit community.',
    keywords: ['edit community', 'owner', 'admin', 'community settings'],
    aliases: ['change community description', 'edit community image', 'community permissions'],
    steps: [
      { title: 'Open the community', body: 'Go to the community page.' },
      { title: 'Choose Edit community', body: 'If your role is owner or admin, use the edit control on the community page.' },
      { title: 'Update available details', body: 'Edit the name, description, category, privacy, or images shown in the form, then save.' },
    ],
    notes: ['Editing details does not provide a verified report or member-moderation workflow. Controls are restricted to owner/admin roles.'],
    relatedArticles: ['community-create', 'community-join-leave', 'community-content'],
  }),
  createHelpArticle({
    id: 'community-chat-unavailable', slug: 'community-chat-coming-soon', title: 'Community chat', category: 'Communities',
    description: 'The community page labels its Chat tab as coming soon; joining does not open a community chat.',
    keywords: ['community chat', 'group conversation', 'coming soon'],
    aliases: ['chat in community', 'community messages', 'community group chat'],
    body: ['The Chat tab currently displays “Group chat for this community — coming soon!” This is not an available messaging feature. Use Posts, Members, or Events instead.'],
    published: true,
    relatedArticles: ['community-content', 'community-join-leave', 'message-send'],
  }),
]