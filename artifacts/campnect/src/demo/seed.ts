import type { AuthUser } from "../stores/authStore";
import type { Post } from "../stores/feedStore";
import type { Event } from "../stores/eventStore";
import type { Community } from "../stores/communityStore";
import type { Message } from "../stores/chatStore";
import type { Notification } from "../stores/notificationStore";
export type Row = Record<string, any>;
export interface DemoState {
  version: 1;
  seededAt: string;
  users: Record<string, AuthUser & Row>;
  colleges: Record<string, Row>;
  posts: Record<string, Post & Row>;
  comments: Record<string, Row>;
  events: Record<string, Event & Row>;
  communities: Record<string, Community & Row>;
  conversations: Record<string, Row>;
  messages: Record<string, Message & Row>;
  notifications: Record<string, Notification>;
  follows: Record<string, "active" | "pending">;
  blocks: Record<string, boolean>;
  likes: Record<string, boolean>;
  saves: Record<string, boolean>;
  viewed: Record<string, boolean>;
  memberships: Record<string, string>;
  attendance: Record<string, string>;
  closeMates: Record<string, boolean>;
  reads: Record<string, string>;
  reports: Row[];
}
export const accountIds = ["u1", "u2", "u3"];
export function seed(now = Date.now()): DemoState {
  const s: DemoState = {
    version: 1,
    seededAt: new Date(now).toISOString(),
    users: {},
    colleges: {},
    posts: {},
    comments: {},
    events: {},
    communities: {},
    conversations: {},
    messages: {},
    notifications: {},
    follows: {},
    blocks: {},
    likes: {},
    saves: {},
    viewed: {},
    memberships: {},
    attendance: {},
    closeMates: {},
    reads: {},
    reports: [],
  };
  const ago = (minutes: number) =>
    new Date(now - minutes * 60000).toISOString();
  const names = [
    "Delhi Technological University",
    "Netaji Subhas University of Technology",
    "IIT Delhi",
    "University of Delhi",
    "VIT Vellore",
    "BITS Pilani",
  ];
  names.forEach((name, i) => {
    s.colleges[`c${i}`] = {
      id: `c${i}`,
      name,
      short_name: ["DTU", "NSUT", "IITD", "DU", "VIT", "BITS"][i],
      city: ["Delhi", "Delhi", "Delhi", "Delhi", "Vellore", "Pilani"][i],
    };
  });
  const first = [
    "Aanya",
    "Kabir",
    "Riya",
    "Arjun",
    "Ishita",
    "Dev",
    "Meera",
    "Aditya",
    "Sana",
    "Vihaan",
    "Naina",
    "Rohan",
    "Anika",
    "Dhruv",
    "Tara",
    "Yash",
  ];
  const last = [
    "Sharma",
    "Mehta",
    "Kapoor",
    "Rao",
    "Singh",
    "Nair",
    "Joshi",
    "Verma",
    "Iyer",
    "Patel",
  ];
  for (let i = 0; i < 80; i++) {
    const id = `u${i + 1}`,
      full_name =
        i < 3
          ? ["Aanya Sharma", "Kabir Mehta", "Riya Kapoor"][i]
          : `${first[i % first.length]} ${last[Math.floor(i / first.length) % last.length]}`;
    const college = i === 2 ? 0 : i % 6;
    s.users[id] = {
      id,
      full_name,
      username:
        i < 3
          ? ["aanya.sharma", "kabir.mehta", "riya.kapoor"][i]
          : full_name.toLowerCase().replace(" ", ".") + i,
      email: `student${i + 1}@demo.campnect.test`,
      college_id: `c${college}`,
      college_name: names[college],
      avatar_url: `/demo/avatar-${i % 8}.svg`,
      cover_url: "/demo/campus.svg",
      department: ["Computer Science", "Design", "Electronics", "Mechanical"][
        i % 4
      ],
      course: "B.Tech",
      year: (i % 4) + 1,
      semester: (i % 8) + 1,
      bio: [
        "Building small things that make campus life easier. Coffee at the canteen?",
        "Design, music and late night society rehearsals.",
        "Campus through my lens. Usually near the basketball court.",
        "Hackathons, hostel chai and unfinished side projects.",
      ][i % 4],
      created_at: ago(90000 + i * 300),
      is_private: i === 2 ? 1 : 0,
      is_email_verified: 1,
      is_college_verified: 1,
      verification_status: "approved",
      user_role: "student",
      who_can_message: "everyone",
      relationship_status: "hidden",
    };
  }
  const users = Object.values(s.users);
  for (const u of users)
    for (const v of users)
      if (
        u.id !== v.id &&
        u.college_id === v.college_id &&
        Number(v.id.slice(1)) % 3 !== 0
      )
        s.follows[`${u.id}:${v.id}`] = "active";
  s.follows["u1:u2"] = "active";
  s.follows["u2:u1"] = "active";
  s.follows["u4:u3"] = "pending";
  s.closeMates["u3:u1"] = true;
  const captions = [
    "Library terrace at golden hour. Worth staying back after the last lecture.",
    "Our canteen queue tracker finally works! Looking for two people to try it between classes tomorrow.",
    "Anyone up for a doubles match at 5? Bring water, we have spare racquets.",
    "Hack night plan: teams of four, one working prototype, and a very unreasonable amount of chai. Meet at the innovation lab.",
    "The photography walk starts at the main gate on Saturday. Phone cameras absolutely welcome.",
    "We fixed the bug five minutes before the demo. Nobody ask what the bug was.",
    "Placement prep circle: sharing my OS notes tonight. Add your favourite interview questions below.",
    "Open mic rehearsals sounded incredible today. The acoustic set is going to be special.",
    "Hostel cook-off results: Maggi with vegetables is still Maggi. The jury remains divided.",
    "Looking for a designer for our accessibility project. We are mapping step-free routes across campus.",
    "First years: the workshop is beginner friendly. You do not need to know Git yet!",
    "Festival backdrop is finally painted. Huge thanks to everyone who stayed after class.",
    "Solar car team update: the new battery enclosure passed its first test today.",
    "Found a quiet corner near the sports ground to sketch. Posting the finished page after dinner.",
    "Internship applications are exhausting. Study room booked for a peer CV review on Sunday.",
    "Campus football finals this evening. Come early if you want a seat in the shade.",
    "Made a tiny app to split hostel grocery bills. Happy to share the source after our presentation.",
    "Rain on campus means hot samosas and a cancelled outdoor practice. No complaints today.",
    "Debate society is running a practice round on public transport. New speakers get first priority.",
    "Our robotics team qualified for the regional round! The line follower finally behaved itself.",
  ];
  const commentSets = [
    [
      "Which side of the library is this?",
      "The light was so good after the rain today.",
      "Saving this spot for my next sketch.",
    ],
    [
      "I can test it after the 12:30 lecture.",
      "Does it work for the evening canteen too?",
      "Happy to help with the interface!",
    ],
    [
      "We have the court booked until 6.",
      "I can bring a spare racquet.",
      "Coming after practice, save me a spot.",
    ],
    [
      "Do we register as a team or individually?",
      "Our prototype needs one more frontend person.",
      "The lab is open until 10 on Friday.",
    ],
    [
      "Can beginners join the photo walk?",
      "I will bring the tripod this time.",
      "Main gate at 7? The morning light is better.",
    ],
    [
      "The live demo gods were kind today.",
      "Please write the postmortem, I need to know.",
      "Our team had exactly the same experience.",
    ],
    [
      "I added a scheduling question to the notes.",
      "Could we review paging in the next session?",
      "The diagrams really helped me revise.",
    ],
    [
      "What time does the acoustic set start?",
      "The harmonies at rehearsal were lovely.",
      "I can help set up the microphones.",
    ],
    [
      "The jury should try hostel coffee next.",
      "Adding peas is a brave move.",
      "Recipe please. Our mess dinner was a miss.",
    ],
    [
      "I can help test the routes with screen readers.",
      "We mapped the ramp near Block C last week.",
      "Please include the library lift timings too.",
    ],
    [
      "Is the workshop in Lab 2 or Lab 3?",
      "Thanks for making this beginner friendly.",
      "I just installed Git, see you there.",
    ],
    [
      "The backdrop looks beautiful!",
      "We can help carry it over after 4.",
      "Who designed the lettering? It turned out great.",
    ],
    [
      "Congrats to the whole team!",
      "Can we see it at the open lab?",
      "The enclosure finish looks much cleaner now.",
    ],
    [
      "I know this corner! So peaceful after lunch.",
      "Would love to see the finished sketch.",
      "Please join our next campus sketch walk.",
    ],
    [
      "Booked a slot for the CV review.",
      "Happy to review project descriptions.",
      "Can we do one remote session for interns too?",
    ],
    [
      "The final starts at 5, right?",
      "Our hostel is bringing the banner.",
      "Great match in the semis yesterday.",
    ],
    [
      "Does it handle different people paying each month?",
      "Would love to see the source code.",
      "Trying this for our flat expenses this weekend.",
    ],
    [
      "The samosa queue was worth it today.",
      "Outdoor practice moved to the indoor court.",
      "This is the best part of monsoon lectures.",
    ],
    [
      "Can new speakers observe the first round?",
      "Good topic. The last bus timing needs a debate.",
      "I can help keep time for the practice.",
    ],
    [
      "That final run was so satisfying to watch.",
      "Congratulations! When is the regional round?",
      "The sensor calibration clearly paid off.",
    ],
  ];
  for (let i = 0; i < 190; i++) {
    const u = users[i % 80],
      type =
        i >= 174
          ? "reel"
          : i >= 134
            ? "glimpse"
            : i % 3 === 0
              ? "text"
              : "photo";
    const id = `p${i + 1}`;
    s.posts[id] = {
      id,
      user_id: u.id,
      username: u.username,
      full_name: u.full_name,
      is_college_verified: 1,
      college_id: u.college_id,
      type,
      content:
        (type === "reel"
          ? "Campus motion study — an original animated demo clip."
          : captions[i % captions.length]) +
        (i >= 20 ? ` #${s.colleges[u.college_id!].short_name}` : ""),
      media:
        type === "text"
          ? []
          : [
              type === "reel"
                ? "/demo/clip.webm"
                : `/demo/${["campus", "code", "sport", "music"][i % 4]}.svg`,
            ],
      cover_url: "/demo/campus.svg",
      tags: ["campus"],
      poll_options: null,
      visibility: "public",
      created_at: ago(i >= 134 ? (i - 134) * 9 + 2 : i * 37 + 5),
      likes_count: 0,
      comments_count: 0,
      saves_count: 0,
      views_count: 0,
      shares_count: 0,
    };
    for (let j = 0; j < (i % 16) + 2; j++)
      s.likes[`${users[(i + j * 6 + 6) % 80].id}:${id}`] = true;
    if (i < 134)
      for (let j = 0; j < 3; j++) {
        const author = users[(i + j * 6 + 6) % 80];
        const cid = `comment-${i}-${j}`;
        s.comments[cid] = {
          id: cid,
          post_id: id,
          user_id: author.id,
          content: commentSets[i % commentSets.length][j],
          created_at: ago(i * 37 + j + 1),
        };
      }
  }
  const groups = [
    "Builders Circle",
    "Campus Lens",
    "Raag Music Society",
    "Design Adda",
    "Founders Garage",
    "Weekend Sports",
    "Robotics Lab",
    "Literary Circle",
    "Green Campus",
    "Theatre Collective",
    "Code & Chai",
    "Film Club",
    "First Year Circle",
    "Debate Society",
    "Volunteer Network",
  ];
  groups.forEach((name, i) => {
    const id = `community${i}`;
    s.communities[id] = {
      id,
      name,
      slug: name.toLowerCase().replaceAll(" ", "-").replace("&", "and"),
      category: [
        "Technology",
        "Photography",
        "Music",
        "Design",
        "Entrepreneurship",
        "Sports",
      ][i % 6],
      description: `${name}: student-led sessions, campus projects and people to learn with. All experience levels welcome.`,
      members_count: 0,
      posts_count: 0,
      is_private: 0,
      is_member: false,
      created_by: `u${(i % 3) + 1}`,
      college_id: `c${i % 6}`,
      cover_url: "/demo/campus.svg",
    };
    users
      .filter((u) => u.college_id === `c${i % 6}`)
      .slice(0, 9)
      .forEach((u, k) => {
        s.memberships[`${u.id}:${id}`] = k === 0 ? "admin" : "member";
        if (k === 0) s.communities[id].created_by = u.id;
      });
    Object.values(s.posts)
      .filter(
        (p) =>
          p.type !== "reel" &&
          p.type !== "glimpse" &&
          p.college_id === `c${i % 6}`,
      )
      .slice(Math.floor(i / 6) * 3, Math.floor(i / 6) * 3 + 3)
      .forEach((p) => (p.community_id = id));
  });
  const titles = [
    "Build for Campus Hackathon",
    "Golden Hour Photo Walk",
    "Unplugged Open Mic",
    "Design Portfolio Review",
    "Startup Pitch Evening",
    "Inter-hostel Sports Meet",
    "Robotics Open Lab",
    "Poetry Under the Stars",
    "Campus Clean-up Drive",
    "Street Play Workshop",
    "Git Together",
    "Short Film Screening",
    "Freshers Board Game Night",
    "The Big Campus Debate",
    "Resume Review Circle",
    "Basketball Finals",
    "UI Jam",
    "Acoustic Sundown",
    "Sustainable Campus Ideas",
    "Weekend Coding Sprint",
    "Book Swap",
    "Badminton Doubles",
    "Art on the Lawn",
    "Internship Q&A",
    "Festival Volunteers Meetup",
  ];
  titles.forEach((title, i) => {
    const id = `event${i}`,
      u = users[i % users.length];
    s.events[id] = {
      id,
      title,
      description:
        "An informal student-led session. Bring a friend, your questions and a notebook. Registration is free for campus students. Fictional demo event.",
      organizer_id: u.id,
      organizer_username: u.username,
      organizer_name: u.full_name,
      college_id: u.college_id,
      college_name: u.college_name,
      type: "meetup",
      category: ["Coding", "Music", "Sports"][i % 3],
      location: "Student Activity Centre",
      location_type: "inside",
      is_online: 0,
      starts_at: ago(-(i - 4) * 1440 - 180),
      ends_at: ago(-(i - 4) * 1440 - 300),
      status: i < 4 ? "ended" : "upcoming",
      event_state: i < 4 ? "ended" : "upcoming",
      tags: ["campus"],
      cover_url: "/demo/campus.svg",
      attendees_count: 0,
      is_attending: false,
      visibility: "public",
      announcements: [],
      hosts: [],
    };
    users
      .filter((v) => v.college_id === u.college_id)
      .slice(0, 7)
      .forEach((v) => (s.attendance[`${v.id}:${id}`] = "going"));
  });
  for (let i = 0; i < 21; i++) {
    const id = `chat${i}`,
      members =
        i === 0
          ? ["u1", "u2"]
          : i < 4
            ? ["u1", "u2", "u3", `u${i + 4}`]
            : [`u${(i % 3) + 1}`, `u${i + 4}`];
    s.conversations[id] = {
      id,
      type: i > 0 && i < 4 ? "group" : "private",
      name:
        i > 0 && i < 4
          ? ["Hackathon Crew", "Photo Walk Plans", "Canteen Catch-up"][i - 1]
          : undefined,
      memberIds: members,
      created_by: members[0],
      created_at: ago(7000),
      requestFor: i >= 18 ? members[0] : undefined,
      muted: {},
    };
    for (let j = 0; j < 12; j++) {
      const mid = `message${i}-${j}`;
      s.messages[mid] = {
        id: mid,
        conversation_id: id,
        sender_id: members[j % members.length],
        type: "text",
        content: [
          "Hey! Are you coming to the campus meetup?",
          "Yes, just finishing the lab submission.",
          "I can bring the prototype along.",
          "Perfect. Meet near the library entrance?",
          "Works for me. Around 5?",
          "Let’s do it. I’ll ask the others too.",
          "Did you see the workshop announcement?",
          "Booked my spot this morning.",
          "We should share our notes afterwards.",
          "Absolutely. I made a shared outline.",
          "Thanks! See you there.",
          "See you! ☕",
        ][j],
        username: "",
        full_name: "",
        is_deleted: 0,
        is_edited: 0,
        is_pinned: 0,
        reactions: [],
        created_at: ago(800 - j * 15 + i * 8),
      };
    }
  }
  for (let i = 0; i < 96; i++) {
    const id = `notification${i}`,
      actor = users[(i * 6 + 6) % 80];
    s.notifications[id] = {
      id,
      user_id: `u${(i % 3) + 1}`,
      actor_id: actor.id,
      type: i % 4 === 0 ? "follow" : "like",
      entity_type: i % 4 === 0 ? "user" : "post",
      entity_id: i % 4 === 0 ? actor.id : `p${(i % 134) + 1}`,
      content:
        i % 4 === 0 ? "started following you" : "liked your campus update",
      is_read: i % 3 === 0 ? 0 : 1,
      created_at: ago(i * 19),
    };
  }
  return s;
}
