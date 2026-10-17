# Comments

Comments belong to an article and are addressed by the article's slug.

## List comments

`GET /api/articles/:slug/comments` returns `{ "comments": [...] }`, newest first. Each comment carries `id`, `body`,
`createdAt`, `updatedAt` and the `author` profile. Signing in is optional; when signed in, each author profile's
`following` flag reflects the caller.

## Add a comment

`POST /api/articles/:slug/comments` with `{ "comment": { "body": "..." } }` requires a signed-in user and returns
`{ "comment": {...} }`.

Rules:

- The body must not be empty. An empty body is rejected with `422` and the body
  `{ "errors": { "body": ["can't be blank"] } }`.
- There is no maximum body length.

## Delete a comment

`DELETE /api/articles/:slug/comments/:id` requires a signed-in user.

Rules:

- A comment can be deleted only by its author. For anyone else the comment is treated as not found and the response
  is `404`.
- A successful delete returns `200` with an empty object.
