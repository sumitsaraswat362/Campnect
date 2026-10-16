import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, name = "Aanya Sharma") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/app\/feed/);
  await expect(
    page.getByText("Library terrace at golden hour.", { exact: false }).first(),
  ).toBeVisible();
}
async function switchAccount(page: Page, name: string) {
  await page.goto("/app/settings");
  await page
    .getByRole("button", { name: "Switch demo account", exact: true })
    .click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/app\/feed/);
}
async function api(page: Page, method: string, path: string, data?: any) {
  return page.evaluate(
    async ({ method, path, data }) => {
      const { default: client } = await import("/src/api/client.ts" as string);
      return (await client.request({ method, url: path, data })).data;
    },
    { method, path, data },
  );
}
test("account selection, refresh, switch, logout and protected routes", async ({
  page,
}) => {
  await page.goto("/app/profile");
  await expect(page).toHaveURL(/login/);
  await login(page);
  await page.goto("/app/profile");
  await expect(
    page.getByText("Aanya Sharma", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Aanya Sharma", { exact: true }).first(),
  ).toBeVisible();
  await switchAccount(page, "Kabir Mehta");
  await page.goto("/app/profile");
  await expect(
    page.getByText("Kabir Mehta", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: /Sign out/i, exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/login/);
});
test("chat sends across account switches, refresh and replies; call preview", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/chat/chat0");
  await page
    .getByPlaceholder("Send message…")
    .fill("Meet at the innovation lab at 5?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Meet at the innovation lab at 5?", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Meet at the innovation lab at 5?", { exact: true }),
  ).toBeVisible();
  await switchAccount(page, "Kabir Mehta");
  await page.goto("/app/chat/chat0");
  await expect(
    page.getByText("Meet at the innovation lab at 5?", { exact: true }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Send message…")
    .fill("Yes, bringing the prototype.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await switchAccount(page, "Aanya Sharma");
  await page.goto("/app/chat/chat0");
  await expect(
    page.getByText("Yes, bringing the prototype.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voice call preview" }).click();
  await expect(
    page.getByRole("dialog", { name: "Simulated call preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect preview" }).click();
  await expect(page.getByText(/Preview connected/)).toBeVisible();
  await page.getByRole("button", { name: "End preview" }).click();
  await expect(
    page.getByRole("dialog", { name: "Simulated call preview" }),
  ).toHaveCount(0);
});
test("feed likes comments saves persist and share a source of truth", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/post/p2");

  const initial = await api(page, "get", "/posts/p2");
  await page.getByRole("button", { name: "Like post", exact: true }).click();
  await page.getByRole("button", { name: "Save post", exact: true }).click();
  await page
    .getByRole("button", { name: "Comment on post", exact: true })
    .click();
  await page
    .getByPlaceholder("Add a comment…")
    .fill("Count me in for the workshop.");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.reload();
  const after = await api(page, "get", "/posts/p2");
  expect(after.data.likes_count).toBe(initial.data.likes_count + 1);
  expect(after.data.is_liked).toBe(true);
  await page.goto("/app/settings/saved");
  await expect(
    page
      .getByText("Our canteen queue tracker finally works!", { exact: false })
      .first(),
  ).toBeVisible();
  await api(page, "delete", "/posts/p2/like");
  expect((await api(page, "get", "/posts/p2")).data.likes_count).toBe(
    initial.data.likes_count,
  );
  expect(
    (await api(page, "get", "/posts/p2/comments")).data.some(
      (c: any) => c.content === "Count me in for the workshop.",
    ),
  ).toBe(true);
});
test("student routes render without API requests or runtime failures at mobile and desktop widths", async ({
  page,
}) => {
  const failures: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("websocket", socket => { if (/socket\.io|supabase|onesignal|campnect\.perinol/.test(socket.url())) requests.push(socket.url()) });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (
      /^\/(api|uploads|socket\.io)(\/|$)/.test(u.pathname) ||
      /supabase|onesignal|campnect\.perinol/.test(u.hostname)
    )
      requests.push(r.url());
  });
  await login(page);
  const routes = [
    "/app/search",
    "/app/events",
    "/app/glimpse",
    "/app/clips",
    "/app/profile",
    "/app/profile/kabir.mehta",
    "/app/profile/riya.kapoor",
    "/app/post/p2",
    "/app/events/event6",
    "/app/events/event6/attendees",
    "/app/events/event6/confirmation",
    "/app/communities",
    "/app/community/builders-circle",
    "/app/chat",
    "/app/chat/chat0",
    "/app/chat/chat1",
    "/app/chat/chat1/info",
    "/app/chat/new",
    "/app/chat/new-group",
    "/app/chat/requests",
    "/app/notifications",
    "/app/college/c0",
    "/app/edit-profile",
    "/app/settings",
    "/app/settings/account",
    "/app/settings/security",
    "/app/settings/privacy",
    "/app/settings/notifications",
    "/app/settings/saved",
    "/app/settings/activity",
    "/app/settings/content-appeals",
    "/app/settings/help",
    "/app/settings/about",
    "/app/settings/legal",
    "/app/create",
    "/app/create/post",
    "/app/events/create",
    "/app/communities/create",
    "/app/glimpse/create",
    "/app/clips/create",
  ];
  for (const route of routes) {
    await page.evaluate((path) => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, route);
    await page.waitForTimeout(80);
    await expect(
      page.getByText("Campnect needs a refresh", { exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(
        async () => (await page.locator("body").innerText()).trim().length,
        { message: route },
      )
      .toBeGreaterThan(8);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of [
    "/app/feed",
    "/app/chat/chat0",
    "/app/profile",
    "/app/events",
    "/app/search",
  ]) {
    await page.evaluate((path) => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, route);
    await page.waitForTimeout(150);
    await expect(
      page.getByText("Campnect needs a refresh", { exact: true }),
    ).toHaveCount(0);
  }
  expect(failures).toEqual([]);
  expect(requests).toEqual([]);
});
test("clips play, seed images render, glimpse uploads persist and reset removes only demo data", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/post/p2");
  await expect(page.locator('img[src="/demo/code.svg"]').first()).toBeVisible();
  await page.goto("/app/clips");
  const video = page.locator("video[src]").first();
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThan(1);
  await video.evaluate((el: HTMLVideoElement) => {
    el.muted = true;
    void el.play();
  });
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0);
  await page.goto("/app/glimpse/create");
  await page.getByLabel("Choose Glimpse media", { exact: true }).setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByAltText("Glimpse preview")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByPlaceholder("What’s happening on campus?")
    .fill("A fresh local moment");
  await page
    .getByRole("button", { name: "Upload Glimpse", exact: true })
    .click();
  await expect(page).toHaveURL(/app\/glimpse$/);
  const uploaded = (await api(page, "get", "/glimpses", undefined)).data.find(
    (p: any) => p.content === "A fresh local moment",
  );
  expect(uploaded).toBeTruthy();
  await page.reload();
  const file = await page.evaluate(async (url) => {
    const { default: client } = await import("/src/api/client.ts" as string);
    const r = await client.get(url, { responseType: "blob" });
    return { size: r.data.size, type: r.data.type };
  }, uploaded.media[0]);
  expect(file.size).toBeGreaterThan(0);
  await api(page, "post", "/posts", {
    type: "text",
    content: "Reset must remove this demo record.",
  });
  await page.evaluate(() => localStorage.setItem("unrelated-test-key", "keep"));
  await page.goto("/app/settings");
  await page
    .getByRole("button", { name: "Reset Demo Data", exact: true })
    .click();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-test-key")),
  ).toBe("keep");
  await login(page);
  expect(
    (await api(page, "get", "/search", undefined)).data.posts.some(
      (p: any) => p.content === "Reset must remove this demo record.",
    ),
  ).toBe(false);
});
test("publish a photo through existing editor and find it after refresh on author profile", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/create/post");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "campus.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByPlaceholder("Write a caption…")
    .fill("Our campus prototype is ready for demo day.");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page).toHaveURL(/app\/feed$/);
  await expect(
    page
      .getByText("Our campus prototype is ready for demo day.", { exact: true })
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByText("Our campus prototype is ready for demo day.", { exact: true })
      .first(),
  ).toBeVisible();
  await page.goto("/app/profile");
  const own = (await api(page, "get", "/users/u1/posts")).data;
  expect(
    own.some(
      (p: any) => p.content === "Our campus prototype is ready for demo day.",
    ),
  ).toBe(true);
});
test("private follow request accepted by Riya and profile edits persist", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/profile/riya.kapoor");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Requested", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Requested", exact: true }),
  ).toBeVisible();
  await switchAccount(page, "Riya Kapoor");
  await page.goto("/app/notifications");
  await page
    .getByRole("button", { name: "Confirm aanya.sharma", exact: true })
    .click();
  await switchAccount(page, "Aanya Sharma");
  await page.goto("/app/profile/riya.kapoor");
  await expect(
    page.getByRole("button", { name: "Following", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Following", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Follow", exact: true }),
  ).toBeVisible();
  await page.goto("/app/edit-profile");
  await page
    .getByPlaceholder("Tell people about yourself…")
    .fill("Building accessible routes around campus.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto("/app/profile");
  await page.reload();
  await expect(
    page.getByText("Building accessible routes around campus.", {
      exact: true,
    }),
  ).toBeVisible();
});
test("event RSVP and community creation, membership and chat use existing UI", async ({
  page,
}) => {
  await login(page);
  const event = (
    await api(page, "post", "/events", {
      title: "Campus design sprint",
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      college_id: "c0",
      location_type: "inside",
      location: "Innovation Lab",
      category: "Coding",
    })
  ).data;
  await switchAccount(page, "Riya Kapoor");
  await page.goto(`/app/events/${event.id}`);
  await page.getByRole("button", { name: "JOIN EVENT", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${event.id}/confirmation`));
  await page.goto(`/app/events/${event.id}`);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "GOING", exact: true }),
  ).toBeVisible();
  expect(
    (await api(page, "get", `/events/${event.id}`)).data.attendees_count,
  ).toBe(2);
  await page.goto("/app/communities/create");
  await page.locator("input").first().fill("Accessible Campus Crew");
  await page
    .locator("textarea")
    .fill("Students mapping accessible routes and testing campus tools.");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/app\/community\//);
  const community = (await api(page, "get", "/communities")).data.find(
    (c: any) => c.name === "Accessible Campus Crew",
  );
  expect(community.members_count).toBe(1);
  await switchAccount(page, "Kabir Mehta");
  await page.goto(`/app/community/${community.slug}`);
  await page
    .getByRole("button", { name: "Join Community", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Joined", exact: true }),
  ).toBeVisible();
  await page.reload();
  expect(
    (await api(page, "get", `/communities/${community.id}`)).data.members_count,
  ).toBe(2);
  await page.getByRole("button", { name: "Chat", exact: true }).first().click();
  await page
    .getByRole("button", { name: "Open community chat", exact: true })
    .click();
  await expect(page.getByPlaceholder("Send message…")).toBeVisible();
});

test("uploaded Clips play after refresh, avatars propagate, and missing images fall back", async ({
  page,
}) => {
  const applicationRequests: string[] = [];
  page.on("request", (r) => {
    if (/^\/(api|uploads|socket\.io)(\/|$)/.test(new URL(r.url()).pathname))
      applicationRequests.push(r.url());
  });
  await login(page);
  await page.goto("/app/clips/create");
  await page
    .locator("input[type=file]")
    .setInputFiles("artifacts/campnect/public/demo/clip.webm");
  await expect(
    page.getByRole("button", { name: "Continue", exact: false }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Continue", exact: false }).click();
  await page
    .getByPlaceholder("Add something to the moment…")
    .fill("Local motion study upload");
  await page.getByRole("button", { name: "Publish Clip", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/clips\/[0-9a-f-]{36}$/);
  await page.reload();
  const video = page.locator('video[src^="blob:"]').first();
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThan(1);
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    void v.play();
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
  const avatar = await page.evaluate(
    async (bytes) => {
      const { default: client } = await import("/src/api/client.ts" as string);
      const fd = new FormData();
      fd.append(
        "avatar",
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        "avatar.png",
      );
      return (await client.post("/users/me/avatar", fd)).data.data.avatar_url;
    },
    [
      ...Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
  );
  expect((await api(page, "get", "/posts/p1")).data.avatar_url).toBe(avatar);
  await page.goto("/app/post/p1");
  await expect(page.getByAltText("Aanya Sharma").first()).toHaveAttribute(
    "src",
    /^blob:/,
  );
  const missing = (
    await api(page, "post", "/posts", {
      type: "photo",
      content: "Missing media recovery",
      media: ["/demo/missing.png"],
    })
  ).data;
  await page.goto(`/app/post/${missing.id}`);
  await expect(
    page.getByRole("img", { name: "Image unavailable", exact: true }),
  ).toBeVisible();
  expect(applicationRequests).toEqual([]);
});

test("search matches queries and private follow requests stay pending in search", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/search");
  await page
    .getByPlaceholder("Search people, communities, events…")
    .fill("riya.kapoor");
  await page
    .getByText("@riya.kapoor", { exact: true })
    .locator("../..")
    .getByRole("button", { name: "Follow", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Requested", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByPlaceholder("Search people, communities, events…")
    .fill("riya.kapoor");
  await expect(
    page.getByRole("button", { name: "Requested", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Requested", exact: true }).click();
  await expect(
    page.getByText("@riya.kapoor", {exact:true}).locator("../..").getByRole("button", { name: "Follow", exact: true }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Search people, communities, events…")
    .fill("NoStudentMatchesThis");
  await expect(page.getByText("Riya Kapoor", { exact: true })).toHaveCount(0);
});
