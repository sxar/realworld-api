import axios, { AxiosResponse } from 'axios';

jest.setTimeout(15000);

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

// Never throw on HTTP status so each test can assert the status itself.
const request = (method: string, url: string, token?: string, data?: unknown) =>
  axios.request({
    method,
    url,
    data,
    timeout: 5000,
    validateStatus: () => true,
    headers: token ? authHeader(token) : {},
  });

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const createArticle = async (token: string, tagList: string[] = []) => {
  const article = {
    title: `Favorite spec ${unique()}`,
    description: 'favorite description',
    body: 'favorite body',
    tagList,
  };
  const res = await request('post', '/api/articles', token, { article });
  expect(res.status).toBe(201);
  return { ...article, slug: res.data.article.slug as string };
};

const registerUser = async () => {
  const id = unique();
  const res = await request('post', '/api/users', undefined, {
    user: {
      email: `fav-${id}@example.com`,
      username: `fav-${id}`,
      password: 'fav-password-1',
    },
  });
  expect(res.status).toBe(201);
  return {
    username: res.data.user.username as string,
    token: res.data.user.token as string,
  };
};

const favorite = (slug: string, token?: string) =>
  request('post', `/api/articles/${slug}/favorite`, token);
const unfavorite = (slug: string, token?: string) =>
  request('delete', `/api/articles/${slug}/favorite`, token);
const getCount = async (slug: string, token: string) => {
  const res = await request('get', `/api/articles/${slug}`, token);
  expect(res.status).toBe(200);
  return res.data.article.favoritesCount;
};

const expectNoKeyDeep = (value: unknown, key: string) => {
  const found: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        if (k === key) found.push(`${path}.${k}`);
        walk(child, `${path}.${k}`);
      }
    }
  };
  walk(value, '$');
  expect(found).toEqual([]);
};

const expectMappedArticle = (
  res: AxiosResponse,
  created: Awaited<ReturnType<typeof createArticle>>,
  author: string
) => {
  expect(res.status).toBe(200);
  const { article } = res.data;
  expect([...article.tagList].sort()).toEqual([...created.tagList].sort());
  article.tagList.forEach((tag: unknown) => expect(typeof tag).toBe('string'));
  expect(article.author.username).toBe(author);
  expect(typeof article.author.following).toBe('boolean');
  expect(article.slug).toBe(created.slug);
  expect(article.title).toBe(created.title);
  expect(article.description).toBe(created.description);
  expect(article.body).toBe(created.body);
};

describe('Article favorites', () => {
  const token = process.env.SKYRAMP_TEST_TOKEN as string;
  let username: string;

  beforeAll(async () => {
    expect(token).toBeTruthy();
    const res = await request('get', '/api/user', token);
    expect(res.status).toBe(200);
    username = res.data.user.username;
  });

  describe('POST /api/articles/:slug/favorite', () => {
    it('R1a / favorite-response-has-favoritescount: returns favoritesCount = previous count + 1', async () => {
      const { slug } = await createArticle(token);
      const before = await getCount(slug, token);
      expect(before).toBe(0);

      const res = await favorite(slug, token);

      expect(res.status).toBe(200);
      expect(typeof res.data.article.favoritesCount).toBe('number');
      expect(res.data.article.favoritesCount).toBe(before + 1);
    });

    it('R1b: sets favorited to true for the caller', async () => {
      const { slug } = await createArticle(token);

      const res = await favorite(slug, token);

      expect(res.status).toBe(200);
      expect(res.data.article.favorited).toBe(true);
    });

    it('R1c: maps tagList to tag names and author to a profile', async () => {
      const created = await createArticle(token, [
        `t1-${unique()}`,
        `t2-${unique()}`,
      ]);

      const res = await favorite(created.slug, token);

      expectMappedArticle(res, created, username);
    });

    it('R1d / favorite-response-has-favoritescount: does not expose Prisma _count', async () => {
      const { slug } = await createArticle(token);

      const res = await favorite(slug, token);

      expect(res.status).toBe(200);
      expect(res.data.article).not.toHaveProperty('_count');
    });

    it('R1e: favoriting twice does not double count', async () => {
      const { slug } = await createArticle(token);
      await favorite(slug, token);

      const res = await favorite(slug, token);

      expect(res.status).toBe(200);
      expect(res.data.article.favorited).toBe(true);
      expect(await getCount(slug, token)).toBe(1);
      expect(res.data.article.favoritesCount).toBe(1);
    });

    it('R1f / favorite-unknown-slug-404: unknown slug returns 4xx without Prisma internals', async () => {
      const res = await favorite(`does-not-exist-${unique()}`, token);

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(JSON.stringify(res.data)).not.toMatch(/prisma/i);
    });

    it('R1g: favorite without auth is rejected and count unchanged', async () => {
      const { slug } = await createArticle(token);

      const res = await favorite(slug);

      expect(res.status).toBe(401);
      expect(await getCount(slug, token)).toBe(0);
    });

    it('R1h / favorite-response-no-password: does not expose password via favoritedBy', async () => {
      const other = await registerUser();
      const { slug } = await createArticle(token);
      await favorite(slug, token);

      const res = await favorite(slug, other.token);

      expect(res.status).toBe(200);
      expectNoKeyDeep(res.data, 'password');
    });
  });

  describe('DELETE /api/articles/:slug/favorite', () => {
    it('R2a / unfavorite-response-has-favoritescount: returns favoritesCount = previous count - 1', async () => {
      const { slug } = await createArticle(token);
      await favorite(slug, token);
      expect(await getCount(slug, token)).toBe(1);

      const res = await unfavorite(slug, token);

      expect(res.status).toBe(200);
      expect(typeof res.data.article.favoritesCount).toBe('number');
      expect(res.data.article.favoritesCount).toBe(0);
    });

    it('R2b: sets favorited to false for the caller', async () => {
      const { slug } = await createArticle(token);
      await favorite(slug, token);

      const res = await unfavorite(slug, token);

      expect(res.status).toBe(200);
      expect(res.data.article.favorited).toBe(false);
    });

    it('R2c: maps tagList to tag names and author to a profile', async () => {
      const created = await createArticle(token, [
        `t1-${unique()}`,
        `t2-${unique()}`,
      ]);
      await favorite(created.slug, token);

      const res = await unfavorite(created.slug, token);

      expectMappedArticle(res, created, username);
    });

    it('R2d / unfavorite-response-has-favoritescount: does not expose Prisma _count', async () => {
      const { slug } = await createArticle(token);
      await favorite(slug, token);

      const res = await unfavorite(slug, token);

      expect(res.status).toBe(200);
      expect(res.data.article).not.toHaveProperty('_count');
    });

    it('R2e: unfavoriting a never-favorited article leaves the count unchanged', async () => {
      const { slug } = await createArticle(token);

      const res = await unfavorite(slug, token);

      expect(res.status).toBeLessThan(500);
      if (res.status === 200) expect(res.data.article.favorited).toBe(false);
      expect(await getCount(slug, token)).toBe(0);
    });

    it('R2f / unfavorite-unknown-slug-404: unknown slug returns 4xx', async () => {
      const res = await unfavorite(`does-not-exist-${unique()}`, token);

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('read paths agree with favorite writes', () => {
    it('R3a / favorite-count-matches-get: GET single and favorited list agree with the favorite response', async () => {
      const { slug } = await createArticle(token);
      const fav = await favorite(slug, token);
      expect(fav.status).toBe(200);

      const single = await getCount(slug, token);
      const list = await request(
        'get',
        `/api/articles?favorited=${encodeURIComponent(username)}&limit=1000`,
        token
      );

      expect(single).toBe(1);
      expect(list.status).toBe(200);
      const listed = list.data.articles.find(
        (a: { slug: string }) => a.slug === slug
      );
      expect(listed?.favoritesCount).toBe(1);
      expect(fav.data.article.favoritesCount).toBe(single);
    });

    it('R3b / two-users-favorite-counts: counts follow 1, 2, 1, 0 and match GET after each step', async () => {
      const other = await registerUser();
      const { slug } = await createArticle(token);
      const steps = [
        () => favorite(slug, token),
        () => favorite(slug, other.token),
        () => unfavorite(slug, token),
        () => unfavorite(slug, other.token),
      ];

      const fromGet: number[] = [];
      const fromResponse: unknown[] = [];
      for (const step of steps) {
        const res = await step();
        expect(res.status).toBe(200);
        fromResponse.push(res.data.article.favoritesCount);
        fromGet.push(await getCount(slug, token));
      }

      expect(fromGet).toEqual([1, 2, 1, 0]);
      expect(fromResponse).toEqual([1, 2, 1, 0]);
    });
  });
});
