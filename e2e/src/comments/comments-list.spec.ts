import { readFileSync } from 'fs';
import { join } from 'path';
import {
  api,
  authHeaders,
  createArticle,
  deleteArticle,
  listComments,
  postComment,
  unique,
  uniqueBody,
} from '../support/comments-api';

const MAX = 1000;

describe('comments after the body limit', () => {
  let slug: string;
  const created: number[] = [];

  const create = async (body: string) => {
    const res = await postComment(slug, { body });
    expect(res.status).toBe(200);
    created.push(res.data.comment.id);
    return res.data.comment as { id: number; body: string };
  };

  // An article of its own, so comment counts are not shared with other files.
  beforeAll(async () => {
    const res = await createArticle();
    expect(res.status).toBe(201);
    slug = res.data.article.slug;
  });

  afterAll(async () => {
    for (const id of created) {
      await api.delete(`/api/articles/${slug}/comments/${id}`, {
        headers: authHeaders(),
      });
    }
    await deleteArticle(slug);
  });

  it('R2c: a rejected too-long comment is not stored', async () => {
    const before = await listComments(slug);
    const body = uniqueBody(MAX + 1);
    const res = await postComment(slug, { body });
    expect(res.status).toBe(422);
    const after = await listComments(slug);
    expect(after).toHaveLength(before.length);
    expect(after.some((c) => c.body === body)).toBe(false);
  });

  it('R5a / comment-1000-chars-accepted-and-listed: a 1000-character comment is listed in full', async () => {
    const body = uniqueBody(MAX);
    const comment = await create(body);
    expect(comment.body).toBe(body);
    const listed = (await listComments(slug)).find((c) => c.id === comment.id);
    expect(listed?.body).toBe(body);
  });

  it('R5b: a 1000-character comment can be deleted by its author', async () => {
    const res = await postComment(slug, { body: uniqueBody(MAX) });
    expect(res.status).toBe(200);
    const id = res.data.comment.id;
    const del = await api.delete(`/api/articles/${slug}/comments/${id}`, {
      headers: authHeaders(),
    });
    expect(del.status).toBe(200);
    expect(del.data).toEqual({});
    expect((await listComments(slug)).some((c) => c.id === id)).toBe(false);
  });

  it('R3b / comments-listed-newest-first: comments are listed newest first, as documented', async () => {
    const first = await create(unique('first'));
    const second = await create(unique('second'));
    const ids = (await listComments(slug)).map((c) => c.id);
    expect(ids).toContain(first.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
  });
});

describe('article bodies are not limited by the comment limit (R6)', () => {
  it('accepts an article whose body is longer than 1000 characters', async () => {
    const body = 'e'.repeat(1500);
    const res = await createArticle(body);
    expect(res.status).toBe(201);
    expect(res.data.article.body).toBe(body);
    await deleteArticle(res.data.article.slug);
  });
});

describe('docs/comments.md (R3)', () => {
  const docs = readFileSync(
    join(__dirname, '../../../docs/comments.md'),
    'utf8'
  );

  it('states the 1000-character limit and its error', () => {
    expect(docs).toContain('limited to 1000 characters');
    expect(docs).toContain('is too long (maximum is 1000 characters)');
    expect(docs).not.toMatch(/\b500\b/);
  });
});
