import type { DemoState, Row } from "./seed";
export function projectPost<T extends Row>(s: DemoState, me: string, p: T) {
  return {
    ...p,
    ...Object.fromEntries(
      [
        "username",
        "full_name",
        "avatar_url",
        "college_name",
        "is_college_verified",
      ].map((k) => [k, s.users[p.user_id]?.[k]]),
    ),
    likes_count: Object.keys(s.likes).filter((k) => k.endsWith(`:${p.id}`))
      .length,
    comments_count: Object.values(s.comments).filter((c) => c.post_id === p.id)
      .length,
    saves_count: Object.keys(s.saves).filter((k) => k.endsWith(`:${p.id}`))
      .length,
    is_liked: !!s.likes[`${me}:${p.id}`],
    is_saved: !!s.saves[`${me}:${p.id}`],
    event:
      p.event_id && s.events[p.event_id]
        ? {
            id: p.event_id,
            title: s.events[p.event_id].title,
            cover_url: s.events[p.event_id].cover_url,
            starts_at: s.events[p.event_id].starts_at,
            status: s.events[p.event_id].status,
          }
        : null,
    views_count: Object.keys(s.viewed).filter((k) => k.endsWith(`:${p.id}`))
      .length,
    is_viewed: !!s.viewed[`${me}:${p.id}`],
  };
}
