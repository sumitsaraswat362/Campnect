import assert from "node:assert/strict";
import test from "node:test";
import { seed } from "../seed.ts";
import { dispatch } from "../repository.ts";
const request = (
  s: ReturnType<typeof seed>,
  user: string,
  method: string,
  path: string,
  body = {},
  query = {},
) => dispatch(s, user, method, path, body, query);
test("seed has stable relationships, substantial content and no remote media", () => {
  const s = seed(1792230000000);
  assert.equal(Object.keys(s.users).length, 80);
  assert.equal(Object.keys(s.posts).length, 190);
  assert.equal(Object.keys(s.comments).length, 402);
  assert.equal(Object.keys(s.messages).length, 252);
  for (const p of Object.values(s.posts)) {
    assert.ok(s.users[p.user_id]);
    assert.ok(p.media.every((u) => u.startsWith("/demo/")));
  }
  for (const m of Object.values(s.messages)) {
    assert.ok(
      s.conversations[m.conversation_id].memberIds.includes(m.sender_id),
    );
  }
  assert.deepEqual(seed(1792230000000), s);
});
test("likes and saves are idempotent, comments shared and counts derived", async () => {
  const s = seed(),
    req = (method: string, path: string, b = {}) =>
      request(s, "u1", method, path, b);
  const before = (await req("get", "/posts/p2")).data.likes_count;
  await req("post", "/posts/p2/like");
  await req("post", "/posts/p2/like");
  assert.equal((await req("get", "/posts/p2")).data.likes_count, before + 1);
  await req("delete", "/posts/p2/like");
  assert.equal((await req("get", "/posts/p2")).data.likes_count, before);
  await req("post", "/posts/p2/save");
  assert.ok(
    (await req("get", "/users/me/saved")).data.some((p: any) => p.id === "p2"),
  );
  const c = (await req("post", "/posts/p2/comments", { content: "Meet at 5?" }))
    .data;
  assert.ok(
    (await request(s, "u2", "get", "/posts/p2/comments")).data.some(
      (v: any) => v.id === c.id,
    ),
  );
  await req("delete", `/posts/comments/${c.id}`);
  assert.ok(!s.comments[c.id]);
});
test("private requests, acceptance, unfollow, blocking retain chat history", async () => {
  const s = seed();
  await request(s, "u1", "post", "/users/u3/follow");
  assert.equal(s.follows["u1:u3"], "pending");
  assert.equal(
    (await request(s, "u1", "get", "/users/u3/posts")).data.length,
    0,
  );
  await request(s, "u3", "post", "/users/follow-requests/u1/accept");
  assert.ok((await request(s, "u1", "get", "/users/u3/posts")).data.length);
  await request(s, "u1", "delete", "/users/u3/follow");
  assert.equal(
    (await request(s, "u1", "get", "/users/u3/posts")).data.length,
    0,
  );
  const count = Object.keys(s.messages).length;
  await request(s, "u1", "post", "/users/block/u2");
  assert.equal(Object.keys(s.messages).length, count);
  await assert.rejects(
    request(s, "u1", "post", "/chat/conversations/chat0/messages", {
      content: "blocked",
    }),
  );
  await request(s, "u1", "delete", "/users/block/u2");
  await request(s, "u1", "post", "/chat/conversations/chat0/messages", {
    content: "Unblocked",
  });
});
test("publishing, author profile, search, deletion of saved post references", async () => {
  const s = seed(),
    p = (
      await request(s, "u1", "post", "/posts", {
        content: "Campus bill splitter",
        type: "text",
      })
    ).data;
  assert.ok(
    (await request(s, "u2", "get", "/posts/feed")).data.some(
      (v: any) => v.id === p.id,
    ),
  );
  assert.ok(
    (await request(s, "u1", "get", "/users/u1/posts")).data.some(
      (v: any) => v.id === p.id,
    ),
  );
  assert.ok(
    (
      await request(s, "u2", "get", "/search", {}, { q: "BILL SPLITTER" })
    ).data.posts.some((v: any) => v.id === p.id),
  );
  await request(s, "u2", "post", `/posts/${p.id}/save`);
  await assert.rejects(request(s, "u2", "delete", `/posts/${p.id}`));
  await request(s, "u1", "delete", `/posts/${p.id}`);
  assert.ok(!s.saves[`u2:${p.id}`]);
  assert.ok(
    !(await request(s, "u2", "get", "/users/me/saved")).data.some(
      (v: any) => v.id === p.id,
    ),
  );
});
test("campus event eligibility, RSVP and community membership persist in serialized dataset", async () => {
  let s = seed();
  const e = (
    await request(s, "u1", "post", "/events", {
      title: "Demo sprint",
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      college_id: "c0",
      location_type: "inside",
    })
  ).data;
  await assert.rejects(
    request(s, "u2", "post", `/events/${e.id}/rsvp`, { status: "going" }),
  );
  await request(s, "u3", "post", `/events/${e.id}/rsvp`, { status: "going" });
  assert.equal(
    (await request(s, "u1", "get", `/events/${e.id}`)).data.attendees_count,
    2,
  );
  await request(s, "u3", "delete", `/events/${e.id}/rsvp`);
  assert.equal(
    (await request(s, "u1", "get", `/events/${e.id}`)).data.attendees_count,
    1,
  );
  await request(s, "u2", "post", "/communities/community0/join");
  s = JSON.parse(JSON.stringify(s));
  assert.equal(
    (await request(s, "u2", "get", "/communities/community0")).data.is_member,
    true,
  );
  await request(s, "u2", "delete", "/communities/community0/join");
  assert.equal(
    (await request(s, "u2", "get", "/communities/community0")).data.is_member,
    false,
  );
});
test("Aanya and Kabir share message history, replies, read states and groups", async () => {
  const s = seed();
  const m = (
    await request(s, "u1", "post", "/chat/conversations/chat0/messages", {
      content: "Meet at the lab?",
    })
  ).data;
  assert.ok(
    (await request(s, "u2", "get", "/chat/conversations")).data.find(
      (c: any) => c.id === "chat0",
    ).unread_count,
  );
  assert.ok(
    (
      await request(s, "u2", "get", "/chat/conversations/chat0/messages")
    ).data.some((v: any) => v.id === m.id),
  );
  const reply = (
    await request(s, "u2", "post", "/chat/conversations/chat0/messages", {
      content: "On my way",
      reply_to_id: m.id,
    })
  ).data;
  assert.equal(reply.reply_to.content, "Meet at the lab?");
  assert.ok(
    (
      await request(s, "u1", "get", "/chat/conversations/chat0/messages")
    ).data.some((v: any) => v.id === reply.id),
  );
  assert.equal(
    (await request(s, "u1", "get", "/chat/conversations")).data.find(
      (c: any) => c.id === "chat0",
    ).unread_count,
    0,
  );
  assert.ok(
    (await request(s, "u1", "get", "/chat/conversations/chat1")).data.members
      .length > 2,
  );
});
test("profile updates propagate through authored content, notifications deduplicate", async () => {
  const s = seed();
  await request(s, "u1", "patch", "/users/me", {
    full_name: "Aanya S.",
    bio: "New bio",
  });
  assert.equal(
    (await request(s, "u2", "get", "/posts/p1")).data.full_name,
    "Aanya S.",
  );
  const before = Object.keys(s.notifications).length;
  await request(s, "u1", "post", "/posts/p2/like");
  await request(s, "u1", "post", "/posts/p2/like");
  assert.equal(Object.keys(s.notifications).length, before + 1);
  await request(s, "u2", "post", "/notifications/read-all");
  assert.equal(
    (await request(s, "u2", "get", "/notifications")).meta?.unread_count,
    0,
  );
});
test("unknown endpoints fail, permissions reject nonmembers and security operations", async () => {
  const s = seed();
  await assert.rejects(request(s, "u1", "get", "/not-implemented"));
  await assert.rejects(
    request(s, "u1", "post", "/users/me/change-password", {}),
  );
  await assert.rejects(
    request(s, "u3", "get", "/chat/conversations/chat0/messages"),
  );
  await assert.rejects(
    request(s, "u2", "patch", "/communities/community0", { name: "Takeover" }),
  );
});
test("Glimpses obey campus access and track local views", async () => {
  const s = seed();
  const glimpse = Object.values(s.posts).find(
    (p) => p.type === "glimpse" && p.college_id === "c0" && p.user_id !== "u3",
  )!;
  await assert.rejects(request(s, "u2", "get", `/glimpses/${glimpse.id}`));
  await request(s, "u1", "post", `/glimpses/${glimpse.id}/view`);
  const data = (await request(s, "u1", "get", `/glimpses/${glimpse.id}`)).data;
  assert.equal(data.is_viewed, true);
  assert.equal(data.views_count, 1);
  const quota = (await request(s, "u1", "get", "/glimpses/quota")).data;
  assert.equal(quota.remaining, quota.limit - quota.used);
});
test("event capacity, group ownership, invitation approval and member roles", async () => {
  const s = seed();
  const e = (
    await request(s, "u1", "post", "/events", {
      title: "Capacity test",
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      max_attendees: 1,
      allow_waitlist: true,
    })
  ).data;
  await request(s, "u3", "post", `/events/${e.id}/rsvp`, { status: "going" });
  assert.equal(
    (await request(s, "u3", "get", `/events/${e.id}`)).data.user_status,
    "waitlist",
  );
  const c = (
    await request(s, "u1", "post", "/chat/groups", {
      name: "Approval group",
      memberIds: ["u2"],
      requires_approval: true,
    })
  ).data;
  assert.equal(c.my_role, "owner");
  const link = (
    await request(s, "u1", "post", `/chat/groups/${c.id}/invite-link`)
  ).data;
  const preview = await request(
    s,
    "",
    "get",
    `/chat/groups/join/${link.token}`,
  );
  assert.equal(preview.data.name, "Approval group");
  const pending = await request(
    s,
    "u3",
    "post",
    `/chat/groups/join/${link.token}`,
  );
  assert.equal(pending.requested, true);
  const requests = (
    await request(s, "u1", "get", `/chat/groups/${c.id}/join-requests`)
  ).data;
  assert.equal(requests.length, 1);
  await request(
    s,
    "u1",
    "post",
    `/chat/groups/${c.id}/join-requests/${requests[0].id}/approve`,
  );
  assert.ok(
    (
      await request(s, "u3", "get", `/chat/conversations/${c.id}`)
    ).data.members.some((m: any) => m.id === "u3"),
  );
  await request(s, "u1", "patch", `/chat/groups/${c.id}/members/u2/role`, {
    role: "admin",
    rights: { invite_users: true },
  });
  assert.equal(
    (await request(s, "u2", "get", `/chat/conversations/${c.id}`)).data.my_role,
    "admin",
  );
});
