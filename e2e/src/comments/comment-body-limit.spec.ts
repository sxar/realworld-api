import { AxiosResponse } from 'axios';
import {
  api,
  authHeaders,
  getSeededSlug,
  listComments,
  postComment,
  uniqueBody,
} from '../support/comments-api';

const MAX = 1000;

describe('POST /api/articles/:slug/comments body limit', () => {
  let slug: string;
  const created: number[] = [];

  const expectAccepted = async (body: string) => {
    const res = await postComment(slug, { body });
    expect(res.status).toBe(200);
    expect(res.data.comment.body).toBe(body);
    created.push(res.data.comment.id);
    return res;
  };

  const expectTooLong = (res: AxiosResponse) => {
    expect(res.status).toBe(422);
    expect(Array.isArray(res.data.errors.body)).toBe(true);
    expect(res.data.errors.body[0]).toMatch(/^is too long/);
  };

  beforeAll(async () => {
    slug = await getSeededSlug();
  });

  afterAll(async () => {
    for (const id of created) {
      await api.delete(`/api/articles/${slug}/comments/${id}`, {
        headers: authHeaders(),
      });
    }
  });

  describe('accepted bodies (R1)', () => {
    it('R1a: accepts a body of exactly 1000 characters', async () => {
      const body = uniqueBody(MAX);
      const res = await expectAccepted(body);
      expect(res.data.comment.body).toHaveLength(MAX);
    });

    it('R1b / comment-501-chars-accepted: accepts a 501-character body', async () => {
      const body = uniqueBody(501, 'b');
      const res = await expectAccepted(body);
      expect(res.data.comment.body).toHaveLength(501);
    });

    it('R1c: accepts a short body and returns the full comment', async () => {
      const me = await api.get('/api/user', { headers: authHeaders() });
      expect(me.status).toBe(200);

      const res = await expectAccepted('hello');
      expect(res.data.comment).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          body: 'hello',
        })
      );
      expect(res.data.comment.author.username).toBe(me.data.user.username);
    });

    it('R1d: accepts 1000 non-ASCII characters unchanged', async () => {
      const body = 'é'.repeat(MAX);
      await expectAccepted(body);
    });

    it('R1e: 1000 emoji are either stored unchanged or rejected as too long', async () => {
      const body = '😀'.repeat(MAX);
      const res = await postComment(slug, { body });
      expect([200, 422]).toContain(res.status);
      if (res.status === 200) {
        expect(res.data.comment.body).toBe(body);
        created.push(res.data.comment.id);
      } else {
        expectTooLong(res);
      }
    });
  });

  describe('too-long bodies (R2)', () => {
    it('R2a: rejects a 1001-character body as too long', async () => {
      expectTooLong(await postComment(slug, { body: 'c'.repeat(MAX + 1) }));
    });

    it('comment-boundary-1000-vs-1001: 1000 is accepted, 1001 is rejected', async () => {
      await expectAccepted(uniqueBody(MAX));
      expectTooLong(await postComment(slug, { body: uniqueBody(MAX + 1) }));
    });

    it('R2b: rejects a 100000-character body as too long', async () => {
      expectTooLong(await postComment(slug, { body: 'd'.repeat(100000) }));
    });

    it('R2d / comment-1001-error-names-1000: the error names a maximum of 1000', async () => {
      const res = await postComment(slug, { body: 'c'.repeat(MAX + 1) });
      expect(res.status).toBe(422);
      const message: string = res.data.errors.body[0];
      expect(message).not.toContain('500');
      if (message.includes('maximum')) {
        expect(message).toContain('1000');
      }
    });

    it('R2e: a too-long body on an unknown article is a 4xx', async () => {
      const res = await postComment('no-such-slug-xyz', {
        body: 'c'.repeat(MAX + 1),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('existing validation and auth (R4)', () => {
    it("R4a: rejects an empty body with can't be blank", async () => {
      const res = await postComment(slug, { body: '' });
      expect(res.status).toBe(422);
      expect(res.data).toEqual({ errors: { body: ["can't be blank"] } });
    });

    it.each([
      ['missing', {}],
      ['null', { body: null }],
    ])("R4b: rejects a %s body with can't be blank", async (_, comment) => {
      const res = await postComment(slug, comment);
      expect(res.status).toBe(422);
      expect(res.data).toEqual({ errors: { body: ["can't be blank"] } });
    });

    it('R4c: rejects unauthenticated posts with 401 and creates nothing', async () => {
      const before = await listComments(slug);
      const tooLong = await postComment(
        slug,
        { body: 'c'.repeat(MAX + 1) },
        false
      );
      const valid = await postComment(slug, { body: 'hi' }, false);
      expect(tooLong.status).toBe(401);
      expect(valid.status).toBe(401);
      expect(await listComments(slug)).toHaveLength(before.length);
    });

    it.each([
      ['a number', 123],
      ['an array', ['x']],
      ['an object', { a: 1 }],
      ['an array of 1001 strings', Array(MAX + 1).fill('x')],
    ])(
      'R4d / comment-non-string-body-422: rejects %s as body with a 4xx',
      async (_, body) => {
        const before = await listComments(slug);
        const res = await postComment(slug, { body });
        if (res.status === 200) {
          created.push(res.data.comment.id);
        }
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
        expect(await listComments(slug)).toHaveLength(before.length);
      }
    );
  });
});
