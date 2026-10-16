import { projectPost } from "./projections";
import { getMedia } from "./media";
import type { DemoState, Row } from "./seed";
const values = <T>(r: Record<string, T>) => Object.values(r);
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
export class DemoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function requireValue<T>(v: T | undefined): T {
  if (!v) throw new DemoError("This item is no longer available.", 404);
  return v;
}
function assert(
  ok: unknown,
  message = "You do not have permission for this action.",
) {
  if (!ok) throw new DemoError(message, 403);
}
export async function dispatch(
  s: DemoState,
  me: string,
  method: string,
  path: string,
  b: Row = {},
  q: Row = {},
): Promise<{ data: any; meta?: Row; requested?: boolean }> {
  const [root, id, action, sub, tail] = path.split("/").filter(Boolean);
  const user = () => {
    if (!s.users[me])
      throw new DemoError("Choose a demo account to continue.", 401);
    return s.users[me];
  };
  const blocked = (a: string, c: string) =>
    s.blocks[`${a}:${c}`] || s.blocks[`${c}:${a}`];
  const visibleUser = (id: string) =>
    id === me ||
    (!blocked(me, id) &&
      (!s.users[id]?.is_private || s.follows[`${me}:${id}`] === "active"));
  const visiblePost = (p: Row) =>
    visibleUser(p.user_id) &&
    (p.type !== "glimpse" ||
      (p.college_id === user().college_id &&
        Date.now() - new Date(p.created_at).getTime() < 86400000)) &&
    (p.user_id === me ||
      p.visibility !== "college" ||
      p.college_id === user().college_id) &&
    (p.visibility !== "friends" ||
      p.user_id === me ||
      (s.follows[`${me}:${p.user_id}`] === "active" &&
        s.follows[`${p.user_id}:${me}`] === "active"));
  const enrichUser = (u: DemoState["users"][string]) => ({
    ...u,
    followers_count: Object.entries(s.follows).filter(
      ([key, v]) => key.endsWith(`:${u.id}`) && v === "active",
    ).length,
    following_count: Object.entries(s.follows).filter(
      ([key, v]) => key.startsWith(`${u.id}:`) && v === "active",
    ).length,
    posts_count: values(s.posts).filter(
      (p) => p.user_id === u.id && p.type !== "glimpse" && p.type !== "reel",
    ).length,
    is_following: s.follows[`${me}:${u.id}`] === "active",
    follow_status: s.follows[`${me}:${u.id}`] || "none",
    is_blocked: !!blocked(me, u.id),
    blocked_by_me: !!s.blocks[`${me}:${u.id}`],
    is_online: 0,
    last_seen: s.seededAt,
  });
  const post = (p: Row) => projectPost(s, me, p);
  const comment = (c: Row) => ({
    ...c,
    ...Object.fromEntries(
      ["username", "full_name", "avatar_url"].map((k) => [
        k,
        s.users[c.user_id]?.[k],
      ]),
    ),
    likes_count: Object.keys(s.likes).filter((k) => k.endsWith(`:${c.id}`))
      .length,
    is_liked: !!s.likes[`${me}:${c.id}`],
    replies_count: values(s.comments).filter((v) => v.parent_id === c.id)
      .length,
  });
  const member = (id: string, role = "member") => ({
    ...enrichUser(requireValue(s.users[id])),
    role,
    joined_at: s.seededAt,
  });
  const message = (m: Row) => ({
    ...m,
    username: s.users[m.sender_id]?.username,
    full_name: s.users[m.sender_id]?.full_name,
    avatar_url: s.users[m.sender_id]?.avatar_url,
    reply_to:
      m.reply_to_id && s.messages[m.reply_to_id]
        ? {
            ...s.messages[m.reply_to_id],
            username: s.users[s.messages[m.reply_to_id].sender_id]?.username,
            full_name: s.users[s.messages[m.reply_to_id].sender_id]?.full_name,
          }
        : null,
  });
  const messages = (cid: string) =>
    values(s.messages)
      .filter((m) => m.conversation_id === cid && !m.hidden_for?.includes(me))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const conversation = (c: Row) => {
    const msgs = messages(c.id),
      last = msgs.at(-1);
    return {
      ...c,
      members: c.memberIds.map((id: string) => ({
        ...member(
          id,
          c.roles?.[id] || (id === c.created_by ? "owner" : "member"),
        ),
        tag: c.tags?.[id],
        admin_rights: c.rights?.[id],
        last_read_at: s.reads[`${id}:${c.id}`],
      })),
      my_role: c.roles?.[me] || (c.created_by === me ? "owner" : "member"),
      unread_count: msgs.filter(
        (m) =>
          m.sender_id !== me && m.created_at > (s.reads[`${me}:${c.id}`] || ""),
      ).length,
      last_message_preview: last?.is_deleted
        ? "Message deleted"
        : (last?.content?.startsWith("__POST_SHARE__:")
            ? "Shared a post"
            : last?.content) || (last?.type === "image" ? "Photo" : ""),
      last_message_at: last?.created_at,
      last_message_id: last?.id,
      is_muted: c.muted?.[me] ? 1 : 0,
      is_request: c.requestFor === me ? 1 : 0,
      is_blocked: c.memberIds.some((id: string) => blocked(me, id)),
      blocked_by_me: c.memberIds.some((id: string) => s.blocks[`${me}:${id}`]),
    };
  };
  const notify = (
    target: string,
    type: string,
    entity_type: string,
    entity_id: string,
    content: string,
  ) => {
    if (target === me) return;
    const id = uid();
    s.notifications[id] = {
      id,
      user_id: target,
      actor_id: me,
      type,
      entity_type,
      entity_id,
      content,
      is_read: 0,
      created_at: now(),
    };
  };
  const event = (e: Row) => {
    const attendees = Object.entries(s.attendance)
      .filter(([k]) => k.endsWith(`:${e.id}`))
      .map(([k, status]) => ({ ...member(k.split(":")[0]), status }));
    const status = s.attendance[`${me}:${e.id}`] || null;
    return {
      ...e,
      organizer_name: s.users[e.organizer_id]?.full_name,
      organizer_username: s.users[e.organizer_id]?.username,
      organizer_avatar: s.users[e.organizer_id]?.avatar_url,
      attendees,
      attendees_preview: attendees.slice(0, 5),
      attendees_count: attendees.filter((a) => a.status === "going").length,
      counts: {
        going: attendees.filter((a) => a.status === "going").length,
        interested: attendees.filter((a) => a.status === "interested").length,
        waitlist: attendees.filter((a) => a.status === "waitlist").length,
      },
      user_status: status,
      is_attending: status === "going" || status === "interested",
      is_saved: !!s.saves[`${me}:${e.id}`],
    };
  };
  const community = (c: Row) => ({
    ...c,
    members_count: Object.keys(s.memberships).filter((k) =>
      k.endsWith(`:${c.id}`),
    ).length,
    posts_count: values(s.posts).filter((p) => p.community_id === c.id).length,
    is_member: !!s.memberships[`${me}:${c.id}`],
    member_role: s.memberships[`${me}:${c.id}`] || null,
  });
  const paginate = (rows: Row[], mapper = (v: Row) => v) => {
    const limit = Math.min(Number(q.limit) || 20, 100),
      offset = q.cursor ? Number(q.cursor) : (Number(q.page || 1) - 1) * limit;
    return {
      data: rows.slice(offset, offset + limit).map(mapper),
      meta: {
        hasMore: rows.length > offset + limit,
        nextCursor:
          rows.length > offset + limit ? String(offset + limit) : null,
        page: Number(q.page || 1),
        limit,
      },
    };
  };
  const sortedPosts = () =>
    values(s.posts)
      .filter(visiblePost)
      .sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
      );
  if (path === "/healthz") return { data: { healthy: true } };
  if (root === "app-update" || root === "maintenance")
    return { data: { enabled: false } };
  if (root === "auth") {
    if (id === "login") {
      const u = values(s.users).find((u) =>
        [u.id, u.email, u.username].includes(
          String(b.identifier).replace(/^@/, ""),
        ),
      );
      assert(
        u && ["u1", "u2", "u3"].includes(u.id),
        "Choose a predefined demo account.",
      );
      return {
        data: {
          user: enrichUser(u!),
          token: `demo:${u!.id}`,
          refreshToken: "demo-local",
        },
      };
    }
    if (id === "logout") return { data: null };
    if (id === "sessions" && method === "get") return { data: [] };
    throw new DemoError(
      "This security operation is unavailable in Demo Mode. No email or OTP is sent.",
      422,
    );
  }
  if (root === "media") return { data: await getMedia(id) };
  if (
    root === "chat" &&
    id === "groups" &&
    action === "join" &&
    method === "get"
  ) {
    const c = requireValue(
      values(s.conversations).find(
        (c) => c.invite_link_active && c.invite_token === sub,
      ),
    );
    return {
      data: {
        id: c.id,
        name: c.name,
        description: c.description,
        avatar_url: c.avatar_url,
        member_count: c.memberIds.length,
        members_count: c.memberIds.length,
        is_member: c.memberIds.includes(me),
        requires_approval: c.requires_approval,
      },
    };
  }
  user();
  if (root === "search" || (root === "chat" && id === "users")) {
    const matches = (v: Row) =>
      `${v.full_name || ""} ${v.username || ""} ${v.name || ""} ${v.title || ""} ${v.content || ""} ${v.description || ""}`
        .toLowerCase()
        .includes(String(q.q || "").toLowerCase());
    const users = values(s.users)
      .filter((v) => !blocked(me, v.id) && matches(v))
      .map(enrichUser);
    if (root === "chat")
      return {
        data: users.filter((u) => u.id !== me).slice(0, Number(q.limit) || 20),
      };
    return {
      data: {
        users,
        colleges: values(s.colleges).filter(matches),
        communities: values(s.communities).filter(matches).map(community),
        events: values(s.events).filter(matches).map(event),
        posts: sortedPosts().filter(matches).map(post),
      },
    };
  }
  if (root === "colleges") {
    if (!id)
      return {
        data: values(s.colleges).map((c) => ({
          ...c,
          students_count: values(s.users).filter((u) => u.college_id === c.id)
            .length,
        })),
      };
    const c = requireValue(s.colleges[id]);
    if (action === "students")
      return {
        data: values(s.users)
          .filter(
            (u) => u.college_id === id && (!q.course || u.course === q.course),
          )
          .map(enrichUser),
      };
    if (action === "courses")
      return {
        data: [
          {
            course: "B.Tech",
            name: "B.Tech",
            member_count: values(s.users).filter((u) => u.college_id === id)
              .length,
          },
        ],
      };
    return { data: c };
  }
  if (root === "users") {
    if (["suggestions", "id-suggestions"].includes(id))
      return {
        data: values(s.users)
          .filter((u) => u.id !== me && !blocked(me, u.id))
          .slice(0, Number(q.limit) || 20)
          .map(enrichUser),
      };
    if (id === "block") {
      requireValue(s.users[action]);
      if (method === "post") {
        s.blocks[`${me}:${action}`] = true;
        delete s.follows[`${me}:${action}`];
        delete s.follows[`${action}:${me}`];
      } else delete s.blocks[`${me}:${action}`];
      return { data: null };
    }
    if (id === "follow-requests") {
      const key = `${action}:${me}`;
      if (sub === "accept") {
        assert(s.follows[key] === "pending");
        s.follows[key] = "active";
        notify(
          action,
          "follow_accepted",
          "user",
          me,
          "accepted your follow request",
        );
      } else delete s.follows[key];
      return { data: null };
    }
    const u =
      id === "me"
        ? user()
        : requireValue(
            s.users[id] || values(s.users).find((u) => u.username === id),
          );
    if (id === "me") {
      if (!action) {
        if (method === "patch") {
          const allowed = [
            "username",
            "full_name",
            "bio",
            "department",
            "course",
            "year",
            "semester",
            "interests",
            "skills",
            "social_links",
            "relationship_status",
            "is_private",
            "who_can_message",
            "institute_post",
          ];
          if (b.username)
            assert(
              !values(s.users).some(
                (v) => v.id !== me && v.username === b.username,
              ),
              "This username is already taken.",
            );
          for (const k of allowed) if (b[k] !== undefined) u[k] = b[k];
        } else if (method !== "get")
          throw new DemoError(
            "Account deletion is unavailable in Demo Mode. Use Reset Demo Data.",
            422,
          );
        return { data: enrichUser(u) };
      }
      if (["avatar", "cover"].includes(action)) {
        const key = `${action}_url`;
        u[key] = method === "delete" ? undefined : b.media?.[0] || b[key];
        return { data: { ...enrichUser(u), [key]: u[key] } };
      }
      if (["privacy", "notification-prefs"].includes(action)) {
        Object.assign(u, b);
        return { data: enrichUser(u) };
      }
      if (action === "saved")
        return paginate(
          sortedPosts().filter((p) => s.saves[`${me}:${p.id}`]),
          post,
        );
      if (action === "blocked")
        return {
          data: values(s.users)
            .filter((u) => s.blocks[`${me}:${u.id}`])
            .map(enrichUser),
        };
      if (action === "follow-requests")
        return {
          data: values(s.users)
            .filter((u) => s.follows[`${u.id}:${me}`] === "pending")
            .map(enrichUser),
        };
      if (action === "followers" && sub) {
        delete s.follows[`${sub}:${me}`];
        return { data: null };
      }
      if (action === "close-mates") {
        if (sub) {
          if (method === "delete") delete s.closeMates[`${me}:${sub}`];
          else s.closeMates[`${me}:${sub}`] = true;
        }
        return {
          data: values(s.users)
            .filter((u) => s.closeMates[`${me}:${u.id}`])
            .map(enrichUser),
        };
      }
      if (action === "activity")
        return {
          data: {
            liked: sortedPosts()
              .filter((p) => s.likes[`${me}:${p.id}`])
              .map(post),
            comments: values(s.comments)
              .filter(
                (c) =>
                  c.user_id === me &&
                  s.posts[c.post_id] &&
                  visiblePost(s.posts[c.post_id]),
              )
              .map((c) => ({
                ...post(s.posts[c.post_id]),
                comment_text: c.content,
              })),
            watched: sortedPosts()
              .filter((p) => s.viewed[`${me}:${p.id}`])
              .map(post),
          },
        };
      if (
        ["appeals", "comment-moderation", "moderated-content"].includes(
          action,
        ) &&
        method === "get"
      )
        return { data: [] };
      if (action === "alumni-request" && method === "get")
        return { data: null };
      throw new DemoError(
        "This account operation needs a real service and is unavailable in Demo Mode.",
        422,
      );
    }
    if (action === "follow") {
      assert(!blocked(me, u.id) && u.id !== me);
      const key = `${me}:${u.id}`;
      if (method === "delete") delete s.follows[key];
      else if (!s.follows[key]) {
        s.follows[key] = u.is_private ? "pending" : "active";
        notify(
          u.id,
          u.is_private ? "follow_request" : "follow",
          "user",
          me,
          u.is_private ? "requested to follow you" : "started following you",
        );
      }
      return {
        data: {
          ...enrichUser(u),
          status: s.follows[key] || "none",
          follow_status: s.follows[key] || "none",
        },
      };
    }
    if (action === "posts")
      return paginate(
        visibleUser(u.id) && q.view !== "tagged"
          ? sortedPosts().filter(
              (p) =>
                p.user_id === u.id && p.type !== "reel" && p.type !== "glimpse",
            )
          : [],
        post,
      );
    if (
      action === "followers" ||
      action === "following" ||
      action === "mutual-followers"
    )
      return {
        data: values(s.users)
          .filter((v) =>
            action === "following"
              ? s.follows[`${u.id}:${v.id}`] === "active"
              : s.follows[`${v.id}:${u.id}`] === "active" &&
                (action !== "mutual-followers" ||
                  s.follows[`${me}:${v.id}`] === "active"),
          )
          .map(enrichUser),
      };
    if (!action) return { data: enrichUser(u) };
    if (action === "restrict") {
      u.restricted_by ||= {};
      u.restricted_by[me] = method !== "delete";
      return { data: null };
    }
  }
  if (["posts", "glimpses", "clips"].includes(root)) {
    const type =
      root === "glimpses" ? "glimpse" : root === "clips" ? "reel" : null;
    const glimpseUsed = values(s.posts).filter(
      (p) =>
        p.user_id === me &&
        p.type === "glimpse" &&
        Date.now() - new Date(p.created_at).getTime() < 86400000,
    ).length;
    if (id === "quota")
      return {
        data: {
          used: glimpseUsed,
          remaining: Math.max(0, 10 - glimpseUsed),
          limit: 10,
        },
      };
    if (id === "video-preview")
      throw new DemoError(
        "Video conversion is unavailable locally. Upload an MP4 or WebM clip instead.",
        422,
      );
    if (root === "clips" && id === "users")
      return {
        data: sortedPosts()
          .filter(
            (p) => p.type === "reel" && s.users[p.user_id].username === action,
          )
          .map(post),
      };
    if (!id || id === "feed") {
      if (method === "get")
        return paginate(
          sortedPosts().filter((p) =>
            type
              ? p.type === type &&
                (!q.creator_id || p.user_id === q.creator_id) &&
                (q.mode !== "my" || p.user_id === me) &&
                (!q.event_id || p.event_id === q.event_id) &&
                (!q.q ||
                  p.content?.toLowerCase().includes(String(q.q).toLowerCase()))
              : p.type !== "glimpse" && p.type !== "reel",
          ),
          post,
        );
      if (type === "glimpse") {
        assert(
          glimpseUsed < 10,
          "You have reached the daily demo Glimpse limit.",
        );
        assert(b.media?.length, "Choose media before publishing a Glimpse.");
      }
      if (b.event_id) {
        const linked = requireValue(s.events[b.event_id]);
        assert(
          linked.college_id === user().college_id || linked.organizer_id === me,
          "Choose an event at your campus.",
        );
      }
      const id = uid(),
        u = user();
      if (b.community_id)
        assert(
          s.memberships[`${me}:${b.community_id}`],
          "Join this community before posting.",
        );
      s.posts[id] = {
        id,
        user_id: me,
        username: u.username,
        full_name: u.full_name,
        college_id: u.college_id,
        is_college_verified: 1,
        content: b.content || b.caption || "",
        type: type || b.type || (b.media?.length ? "photo" : "text"),
        media: b.media || [],
        tags: Array.isArray(b.tags) ? b.tags : [],
        poll_options: b.poll_options || null,
        visibility: b.visibility || "public",
        likes_count: 0,
        comments_count: 0,
        saves_count: 0,
        created_at: now(),
        community_id: b.community_id,
        event_id: b.event_id,
        cover_url: b.cover_url,
        moderation_status: "approved",
      };
      return { data: post(s.posts[id]) };
    }
    if (id === "comments") {
      const c = requireValue(s.comments[action]);
      if (sub === "like") {
        const key = `${me}:${c.id}`;
        if (method === "delete") delete s.likes[key];
        else s.likes[key] = true;
      } else {
        assert(c.user_id === me);
        if (method === "delete") {
          delete s.comments[c.id];
          for (const r of values(s.comments))
            if (r.parent_id === c.id) delete s.comments[r.id];
        } else c.content = b.content;
      }
      return { data: comment(c) };
    }
    const p = requireValue(s.posts[id]);
    assert(visiblePost(p), "This post is private or blocked.");
    if (!action) {
      if (method === "delete") {
        assert(p.user_id === me);
        delete s.posts[id];
        for (const c of values(s.comments))
          if (c.post_id === id) delete s.comments[c.id];
        for (const r of [s.likes, s.saves, s.viewed])
          for (const k of Object.keys(r)) if (k.endsWith(`:${id}`)) delete r[k];
        for (const n of values(s.notifications))
          if (n.entity_type === "post" && n.entity_id === id)
            delete s.notifications[n.id];
      } else if (method === "patch") {
        assert(p.user_id === me);
        for (const k of ["content", "visibility", "location"])
          if (b[k] !== undefined) p[k] = b[k];
      }
      return { data: post(p) };
    }
    if (action === "like" || action === "save") {
      const map = action === "like" ? s.likes : s.saves,
        key = `${me}:${id}`;
      if (method === "delete") delete map[key];
      else if (!map[key]) {
        map[key] = true;
        if (action === "like")
          notify(p.user_id, "like", "post", id, "liked your post");
      }
      return { data: post(p) };
    }
    if (action === "comments") {
      if (method === "get")
        return {
          data: values(s.comments)
            .filter(
              (c) =>
                c.post_id === id && (sub ? c.parent_id === sub : !c.parent_id),
            )
            .map(comment),
        };
      const cid = uid();
      assert(String(b.content || "").trim(), "Write a comment first.");
      if (b.parent_id) assert(s.comments[b.parent_id]?.post_id === id);
      s.comments[cid] = {
        id: cid,
        post_id: id,
        user_id: me,
        content: b.content,
        parent_id: b.parent_id,
        created_at: now(),
      };
      notify(p.user_id, "comment", "post", id, "commented on your post");
      return { data: comment(s.comments[cid]) };
    }
    if (action === "view") {
      s.viewed[`${me}:${id}`] = true;
      return { data: null };
    }
    if (action === "share") {
      p.shares_count = (p.shares_count || 0) + 1;
      return { data: null };
    }
    if (action === "insights") {
      assert(p.user_id === me);
      return {
        data: {
          viewers: values(s.users)
            .filter((u) => s.viewed[`${u.id}:${id}`])
            .map(enrichUser),
          likes: values(s.users)
            .filter((u) => s.likes[`${u.id}:${id}`])
            .map(enrichUser),
        },
      };
    }
    if (action === "poll-vote") {
      p.voters ||= {};
      p.voters[me] = b.option_index;
      p.poll_votes = {};
      Object.values(p.voters).forEach(
        (index: any) =>
          (p.poll_votes![index] = (p.poll_votes![index] || 0) + 1),
      );
      return { data: post(p) };
    }
  }
  if (root === "events") {
    if (!id) {
      if (method === "get")
        return {
          data: values(s.events)
            .filter((e) => {
              const start = new Date(e.starts_at),
                end = new Date(e.ends_at || e.starts_at),
                current = Date.now();
              return (
                (e.visibility !== "private" ||
                  e.organizer_id === me ||
                  !!s.attendance[`${me}:${e.id}`] ||
                  e.invitedIds?.includes(me)) &&
                (!q.college_id || e.college_id === q.college_id) &&
                (!q.community_id || e.community_id === q.community_id) &&
                (!q.q ||
                  `${e.title} ${e.description} ${e.location}`
                    .toLowerCase()
                    .includes(String(q.q).toLowerCase())) &&
                (!q.category || e.category === q.category) &&
                (!q.date || e.starts_at.slice(0, 10) === q.date) &&
                (!q.upcoming ||
                  (start.getTime() > current && e.status !== "cancelled")) &&
                (q.filter !== "my" ||
                  e.organizer_id === me ||
                  !!s.attendance[`${me}:${e.id}`]) &&
                (q.filter !== "saved" || !!s.saves[`${me}:${e.id}`]) &&
                (q.filter !== "near" || e.college_id === user().college_id) &&
                (q.filter !== "live" ||
                  (start.getTime() <= current &&
                    end.getTime() >= current &&
                    e.status !== "ended")) &&
                (q.filter !== "today" ||
                  e.starts_at.slice(0, 10) === now().slice(0, 10)) &&
                (q.filter !== "week" ||
                  (start.getTime() >= current &&
                    start.getTime() < current + 7 * 86400000)) &&
                (!q.time_of_day ||
                  (q.time_of_day === "morning"
                    ? start.getHours() < 12
                    : q.time_of_day === "afternoon"
                      ? start.getHours() >= 12 && start.getHours() < 17
                      : start.getHours() >= 17))
              );
            })
            .sort((a, b) =>
              q.filter === "popular"
                ? event(b).attendees_count - event(a).attendees_count
                : a.starts_at.localeCompare(b.starts_at),
            )
            .map(event),
        };
      const eid = uid(),
        u = user();
      assert(
        !b.college_id || b.college_id === u.college_id,
        "Create inside-campus events for your own college.",
      );
      s.events[eid] = {
        ...b,
        id: eid,
        organizer_id: me,
        organizer_name: u.full_name,
        organizer_username: u.username,
        college_name: u.college_name,
        starts_at: b.starts_at,
        title: b.title,
        type: b.type || "meetup",
        tags: [],
        is_online: b.is_online === "true" || b.is_online === true ? 1 : 0,
        attendees_count: 0,
        is_attending: true,
        allow_waitlist:
          b.allow_waitlist === true || b.allow_waitlist === "true",
        hosts: [],
        announcements: [],
        status: "upcoming",
        event_state: "upcoming",
      };
      s.attendance[`${me}:${eid}`] = "going";
      return { data: event(s.events[eid]) };
    }
    const e = requireValue(s.events[id]);
    assert(
      e.visibility !== "private" ||
        e.organizer_id === me ||
        s.attendance[`${me}:${id}`] ||
        e.invitedIds?.includes(me),
      "This event is private.",
    );
    if (!action) {
      if (method === "patch") {
        assert(e.organizer_id === me);
        Object.assign(e, b);
        if ("allow_waitlist" in b)
          e.allow_waitlist =
            b.allow_waitlist === true || b.allow_waitlist === "true";
      }
      return { data: event(e) };
    }
    if (action === "rsvp") {
      assert(
        !["cancelled", "ended"].includes(e.status || ""),
        "This event is no longer accepting attendance.",
      );
      assert(
        e.location_type !== "inside" || e.college_id === user().college_id,
        "This event is for students of the host college.",
      );
      if (method === "delete" || b.status === "not_going")
        delete s.attendance[`${me}:${id}`];
      else if (s.attendance[`${me}:${id}`] !== b.status) {
        const full =
          e.max_attendees &&
          event(e).attendees_count >= Number(e.max_attendees);
        assert(!full || e.allow_waitlist, "This event is full.");
        s.attendance[`${me}:${id}`] =
          full && b.status === "going" ? "waitlist" : b.status;
        notify(
          e.organizer_id,
          "event_rsvp",
          "event",
          id,
          `is attending ${e.title}`,
        );
      }
      return {
        data: {
          ...event(e),
          status: s.attendance[`${me}:${id}`] || "not_going",
        },
      };
    }
    if (action === "chat") {
      assert(
        s.attendance[`${me}:${id}`] || e.organizer_id === me,
        "Join the event before opening its chat.",
      );
      const cid = `event-chat-${id}`;
      s.conversations[cid] ||= {
        id: cid,
        type: "event",
        name: e.title,
        event_id: id,
        memberIds: [],
        created_by: e.organizer_id,
        muted: {},
      };
      const c = s.conversations[cid];
      c.memberIds = [
        ...new Set([
          e.organizer_id,
          me,
          ...Object.keys(s.attendance)
            .filter((k) => k.endsWith(`:${id}`))
            .map((k) => k.split(":")[0]),
        ]),
      ];
      e.conversation_id = cid;
      return { data: { ...conversation(c), conversation_id: cid } };
    }
    if (action === "save") {
      if (method === "delete") delete s.saves[`${me}:${id}`];
      else s.saves[`${me}:${id}`] = true;
      return { data: event(e) };
    }
    if (action === "attendees") {
      if (sub) {
        assert(e.organizer_id === me);
        if (tail === "promote")
          e.hosts = [...(e.hosts || []), member(sub, "host")];
        else delete s.attendance[`${sub}:${id}`];
      }
      return {
        data: event(e).attendees.filter(
          (a) => !q.status || a.status === q.status,
        ),
      };
    }
    if (action === "cancel" || action === "end") {
      assert(e.organizer_id === me);
      e.status = action === "cancel" ? "cancelled" : "ended";
      e.event_state = e.status as any;
      return { data: event(e) };
    }
    if (action === "announcements") {
      assert(e.organizer_id === me);
      e.announcements ||= [];
      e.announcements.push({
        id: uid(),
        body: b.body,
        created_at: now(),
        author_name: user().full_name,
      });
      return { data: event(e) };
    }
    if (action === "hosts" || action === "invitations") {
      assert(e.organizer_id === me);
      const target = requireValue(
        sub
          ? s.users[sub]
          : values(s.users).find((u) => u.username === b.username),
      );
      if (action === "hosts")
        e.hosts =
          method === "delete"
            ? (e.hosts || []).filter((u) => u.id !== target.id)
            : [...(e.hosts || []), member(target.id, "host")];
      else {
        e.invitedIds ||= [];
        if (!e.invitedIds.includes(target.id)) e.invitedIds.push(target.id);
        notify(
          target.id,
          "event_invite",
          "event",
          id,
          `invited you to ${e.title}`,
        );
      }
      return { data: event(e) };
    }
  }
  if (root === "communities") {
    if (id === "categories")
      return {
        data: [...new Set(values(s.communities).map((c) => c.category))].map(
          (name) => ({
            name,
            count: values(s.communities).filter((c) => c.category === name)
              .length,
          }),
        ),
      };
    if (!id) {
      if (method === "get")
        return {
          data: values(s.communities)
            .filter(
              (c) =>
                (!q.q ||
                  c.name.toLowerCase().includes(String(q.q).toLowerCase())) &&
                (!q.category || c.category === q.category),
            )
            .map(community),
        };
      const cid = uid();
      s.communities[cid] = {
        ...b,
        id: cid,
        name: b.name,
        slug: `${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${cid.slice(0, 6)}`,
        category: b.category,
        is_private: b.is_private ? 1 : 0,
        members_count: 1,
        posts_count: 0,
        is_member: true,
        created_by: me,
        college_id: user().college_id,
      };
      s.memberships[`${me}:${cid}`] = "admin";
      return { data: community(s.communities[cid]) };
    }
    const c = requireValue(
      s.communities[id] || values(s.communities).find((c) => c.slug === id),
    );
    if (!action) {
      if (method === "patch") {
        assert(s.memberships[`${me}:${c.id}`] === "admin");
        Object.assign(c, b);
      }
      return { data: community(c) };
    }
    if (action === "join") {
      assert(
        !c.is_private || s.memberships[`${me}:${c.id}`],
        "This private community requires an invitation.",
      );
      if (method === "delete") {
        assert(
          s.memberships[`${me}:${c.id}`] !== "admin",
          "Community owners must keep their membership.",
        );
        delete s.memberships[`${me}:${c.id}`];
      } else if (!s.memberships[`${me}:${c.id}`]) {
        s.memberships[`${me}:${c.id}`] = "member";
        if (c.created_by)
          notify(
            c.created_by,
            "community_join",
            "community",
            c.id,
            `joined ${c.name}`,
          );
      }
      return { data: community(c) };
    }
    if (action === "chat") {
      assert(s.memberships[`${me}:${c.id}`], "Join this community first.");
      const cid = `community-chat-${c.id}`;
      s.conversations[cid] ||= {
        id: cid,
        type: "group",
        name: c.name,
        memberIds: [],
        created_by: c.created_by,
        muted: {},
      };
      s.conversations[cid].memberIds = Object.keys(s.memberships)
        .filter((k) => k.endsWith(`:${c.id}`))
        .map((k) => k.split(":")[0]);
      return { data: conversation(s.conversations[cid]) };
    }
    if (action === "members")
      return {
        data: Object.entries(s.memberships)
          .filter(([key]) => key.endsWith(`:${c.id}`))
          .map(([key, role]) => member(key.split(":")[0], role)),
      };
    if (action === "posts")
      return paginate(
        sortedPosts().filter((p) => p.community_id === c.id),
        post,
      );
  }
  if (root === "chat") {
    if (id === "giphy") return { data: [], meta: { hasMore: false } };
    if (id === "link-preview") return { data: null };
    if (id === "requests") {
      if (!action)
        return {
          data: values(s.conversations)
            .filter((c) => c.requestFor === me)
            .map(conversation),
        };
      const c = requireValue(s.conversations[action]);
      assert(c.requestFor === me);
      if (sub === "accept") delete c.requestFor;
      else if (sub === "block") {
        const other = c.memberIds.find((v: string) => v !== me);
        s.blocks[`${me}:${other}`] = true;
        delete c.requestFor;
      } else {
        c.memberIds = c.memberIds.filter((v: string) => v !== me);
        delete c.requestFor;
      }
      return { data: conversation(c) };
    }
    if (id === "groups" && action === "join") {
      const c = requireValue(
        values(s.conversations).find(
          (c) => c.invite_link_active && c.invite_token === sub,
        ),
      );
      if (method === "post") {
        if (c.requires_approval && !c.memberIds.includes(me)) {
          c.joinRequests ||= {};
          c.joinRequests[me] ||= { id: uid(), user_id: me, created_at: now() };
          return { data: null, requested: true };
        }
        c.memberIds = [...new Set([...c.memberIds, me])];
      }
      return {
        data: {
          ...conversation(c),
          members_count: c.memberIds.length,
          is_member: c.memberIds.includes(me),
        },
      };
    }
    if (id === "conversations" || id === "groups") {
      if ("requires_approval" in b)
        b.requires_approval = [true, 1, "true", "1"].includes(
          b.requires_approval,
        );
      if (!action) {
        if (method === "get")
          return {
            data: values(s.conversations)
              .filter((c) => c.memberIds.includes(me) && c.requestFor !== me)
              .map(conversation)
              .sort((a, b) =>
                (b.last_message_at || "").localeCompare(
                  a.last_message_at || "",
                ),
              ),
          };
        let c =
          id === "conversations"
            ? values(s.conversations).find(
                (c) =>
                  c.type === "private" &&
                  c.memberIds.includes(me) &&
                  c.memberIds.includes(b.userId),
              )
            : undefined;
        if (!c) {
          const memberIds =
            id === "groups"
              ? [
                  ...new Set([
                    me,
                    ...(typeof b.memberIds === "string"
                      ? JSON.parse(b.memberIds)
                      : b.memberIds || []),
                  ]),
                ]
              : [me, b.userId];
          assert(
            memberIds.every((v: string) => s.users[v] && !blocked(me, v)),
            "You cannot message a blocked account.",
          );
          const cid = uid();
          c = {
            ...b,
            id: cid,
            memberIds,
            type: id === "groups" ? "group" : "private",
            created_by: me,
            muted: {},
          };
          s.conversations[cid] = c;
        }
        return { data: conversation(c) };
      }
      const c = requireValue(s.conversations[action]);
      assert(c.memberIds.includes(me));
      if (!sub) {
        if (method === "patch") {
          assert(c.created_by === me || c.roles?.[me] === "admin");
          Object.assign(c, b);
        } else if (method === "delete") {
          assert(c.created_by === me || c.roles?.[me] === "admin");
          delete s.conversations[c.id];
          for (const m of messages(c.id)) delete s.messages[m.id];
        }
        return { data: conversation(c) };
      }
      if (sub === "messages") {
        if (method === "get") {
          s.reads[`${me}:${c.id}`] = now();
          const msgs = messages(c.id).filter(
            (m) =>
              !q.before ||
              m.created_at < (s.messages[q.before]?.created_at || q.before),
          );
          const limit = Number(q.limit) || 30;
          return {
            data: msgs.slice(-limit).map(message),
            meta: { hasMore: msgs.length > limit },
          };
        }
        assert(
          !c.memberIds.some((v: string) => blocked(me, v)),
          "Unblock this account before sending a message.",
        );
        const mid = uid();
        s.messages[mid] = {
          id: mid,
          conversation_id: c.id,
          sender_id: me,
          type: b.type || "text",
          content: b.content || "",
          media_url: b.media?.[0] || b.media_url,
          reply_to_id: b.reply_to_id,
          is_deleted: 0,
          is_edited: 0,
          is_pinned: 0,
          username: user().username,
          full_name: user().full_name,
          created_at: now(),
          reactions: [],
        };
        return { data: message(s.messages[mid]) };
      }
      if (sub === "mute") {
        c.muted ||= {};
        c.muted[me] = b.muted;
        return { data: conversation(c) };
      }
      if (sub === "members") {
        if (method === "post") {
          assert(c.created_by === me || c.roles?.[me] === "admin");
          c.memberIds = [
            ...new Set([
              ...c.memberIds,
              ...b.userIds.filter((v: string) => s.users[v]),
            ]),
          ];
        } else if (method === "delete") {
          assert(
            c.created_by === me || c.roles?.[me] === "admin" || tail === me,
          );
          c.memberIds = c.memberIds.filter((v: string) => v !== tail);
        } else if (method === "patch") {
          assert(c.created_by === me || c.roles?.[me] === "admin");
          assert(c.memberIds.includes(tail));
          if (path.endsWith("/role")) {
            c.roles ||= {};
            c.roles[tail] = b.role;
            c.rights ||= {};
            c.rights[tail] = b.rights || {};
          } else {
            c.tags ||= {};
            c.tags[tail] = b.tag;
          }
        }
        return {
          data: c.memberIds.map((v: string) =>
            member(
              v,
              c.roles?.[v] || (v === c.created_by ? "owner" : "member"),
            ),
          ),
        };
      }
      if (sub === "invite-link") {
        assert(c.created_by === me || c.roles?.[me] === "admin");
        if (method === "delete") c.invite_link_active = 0;
        else {
          c.invite_token = uid();
          c.invite_link = c.invite_token;
          c.invite_link_active = 1;
        }
        return {
          data: {
            invite_link: c.invite_link,
            invite_link_active: c.invite_link_active,
            token: c.invite_token,
          },
        };
      }
      if (sub === "join-requests") {
        assert(c.created_by === me || c.roles?.[me] === "admin");
        c.joinRequests ||= {};
        if (tail) {
          const request = requireValue(
            values(c.joinRequests as Record<string, Row>).find(
              (r) => r.id === tail,
            ),
          );
          if (path.endsWith("/approve"))
            c.memberIds = [...new Set([...c.memberIds, request.user_id])];
          delete c.joinRequests[request.user_id];
        }
        return {
          data: values(c.joinRequests as Record<string, Row>).map((r) => ({
            ...member(r.user_id),
            ...r,
          })),
        };
      }
      if (["media", "files", "links"].includes(sub))
        return {
          data:
            sub === "media"
              ? messages(c.id)
                  .filter((m) => m.media_url)
                  .map(message)
              : sub === "files"
                ? messages(c.id)
                    .filter((m) => m.type === "file")
                    .map(message)
                : messages(c.id)
                    .filter((m) => /https?:\/\//.test(m.content || ""))
                    .map(message),
        };
    }
    if (id === "messages") {
      const m = requireValue(s.messages[action]),
        c = requireValue(s.conversations[m.conversation_id]);
      assert(c.memberIds.includes(me));
      if (sub === "seen-by")
        return {
          data: {
            seen_by: c.memberIds
              .filter(
                (v: string) =>
                  v !== m.sender_id &&
                  (s.reads[`${v}:${c.id}`] || "") >= m.created_at,
              )
              .map((v: string) => member(v)),
          },
        };
      if (sub === "react") {
        m.reactionsBy ||= {};
        if (m.reactionsBy[me] === b.emoji) delete m.reactionsBy[me];
        else m.reactionsBy[me] = b.emoji;
        m.reactions = [...new Set(Object.values(m.reactionsBy))].map(
          (emoji: any) => ({
            emoji,
            count: Object.values(m.reactionsBy).filter((v) => v === emoji)
              .length,
          }),
        );
        return { data: m.reactions };
      }
      if (sub === "pin") {
        m.is_pinned = method === "delete" ? 0 : 1;
        return { data: message(m) };
      }
      if (!sub) {
        if (method === "delete" && !b.forEveryone) {
          m.hidden_for ||= [];
          m.hidden_for.push(me);
        } else {
          assert(m.sender_id === me);
          if (method === "delete") {
            m.is_deleted = 1;
            m.content = "";
            m.media_url = undefined;
          } else {
            m.content = b.content;
            m.is_edited = 1;
          }
        }
        return { data: message(m) };
      }
    }
  }
  if (root === "notifications") {
    const own = values(s.notifications).filter((n) => n.user_id === me);
    if (id === "read-all") {
      own.forEach((n) => (n.is_read = 1));
      return { data: null };
    }
    if (id) {
      const n = requireValue(s.notifications[id]);
      assert(n.user_id === me);
      if (method === "delete") delete s.notifications[id];
      else n.is_read = 1;
      return { data: n };
    }
    return {
      data: own
        .filter((n) => !q.type || n.type === q.type)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, Number(q.limit) || 50)
        .map((n) => ({
          ...n,
          actor_username: s.users[n.actor_id || ""]?.username,
          actor_name: s.users[n.actor_id || ""]?.full_name,
          actor_avatar: s.users[n.actor_id || ""]?.avatar_url,
        })),
      meta: { unread_count: own.filter((n) => !n.is_read).length },
    };
  }
  if (root === "highlights" && method === "get") return { data: [] };
  if (path.endsWith("/report") && method === "post") {
    s.reports.push({
      id: uid(),
      user_id: me,
      path,
      ...b,
      created_at: now(),
      status: "local-demo-intake",
    });
    return { data: { received: true, simulated: true } };
  }
  throw new DemoError(
    `Demo operation unavailable: ${method.toUpperCase()} ${path}`,
    501,
  );
}
