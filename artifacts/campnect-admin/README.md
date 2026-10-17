# Campnect Admin

Campnect Admin is a standalone web artifact for authorized operations staff. It
builds independently from the student-facing Campnect application and is not
part of that application's route tree.

## Build

```sh
PORT=20880 BASE_PATH=/ pnpm --filter @workspace/campnect-admin run build
```

In local development, the artifact is served beneath
`/campnect-admin/`, so use `BASE_PATH=/campnect-admin/`.

## API configuration

The standalone Admin server is the only component that talks to Campnect's API.
Set these values on the server hosting this artifact:

```text
CAMPNECT_API_ORIGIN=https://api.example.com
ADMIN_PANEL_SERVICE_SECRET=<the matching server-only secret>
```

The same `ADMIN_PANEL_SERVICE_SECRET` must be stored in the Campnect API
environment. The Admin server attaches it to upstream requests; the API rejects
all Admin authentication and operations requests without it. The browser only
calls the Admin server's same-origin `/api` proxy and never receives this
secret.

Do not put admin passwords, service credentials, session secrets, Supabase
keys, or any other secret in a `VITE_*` variable, static build output, URL, or
browser storage. Campnect's API still verifies each operator's signed session
and role permissions after the Admin server is authenticated.

Use `pnpm --filter @workspace/campnect-admin run build` followed by
`pnpm --filter @workspace/campnect-admin run start` in a standalone deployment.