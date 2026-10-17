/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
import prismaMock from '../prisma-mock';
import {
  addComment,
  deleteComment,
  getCommentsByArticle,
} from '../../app/routes/article/article.service';

const slug = 'how-to-train-your-dragon';

const makeComment = (id: number, createdAt: Date, author: any) => ({
  id,
  body: `comment ${id}`,
  createdAt,
  updatedAt: createdAt,
  author,
});

const makeAuthor = (username: string, followedBy: { id: number }[] = []) => ({
  username,
  bio: null,
  image: null,
  followedBy,
});

const catchError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as any;
  }
  throw new Error('expected promise to reject');
};

describe('CommentService', () => {
  describe('getCommentsByArticle', () => {
    test('should return comments newest first', async () => {
      // Given
      const comments = [
        makeComment(1, new Date('2024-01-01T00:00:00Z'), makeAuthor('a')),
        makeComment(2, new Date('2024-01-02T00:00:00Z'), makeAuthor('b')),
        makeComment(3, new Date('2024-01-03T00:00:00Z'), makeAuthor('c')),
      ];

      // When
      // @ts-ignore
      prismaMock.article.findUnique.mockResolvedValue({ comments });
      const result = await getCommentsByArticle(slug, 1);

      // Then
      const args: any = prismaMock.article.findUnique.mock.calls[0][0];
      const orderBy = args?.include?.comments?.orderBy;
      const orderedInQuery =
        JSON.stringify(orderBy) === JSON.stringify({ createdAt: 'desc' }) ||
        JSON.stringify(orderBy) === JSON.stringify([{ createdAt: 'desc' }]);
      const resultTimes = (result ?? []).map((c: any) =>
        new Date(c.createdAt).getTime()
      );
      const orderedInResult =
        resultTimes.length === 3 &&
        resultTimes.every((t, i) => i === 0 || resultTimes[i - 1] >= t);
      expect(orderedInQuery || orderedInResult).toBe(true);
    });

    test('should return id, body, createdAt, updatedAt and author profile for each comment', async () => {
      // Given
      const createdAt = new Date('2024-01-01T00:00:00Z');
      const comments = [
        makeComment(7, createdAt, makeAuthor('RealWorld', [{ id: 99 }])),
      ];

      // When
      // @ts-ignore
      prismaMock.article.findUnique.mockResolvedValue({ comments });
      const result: any = await getCommentsByArticle(slug, 1);

      // Then
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 7,
        body: 'comment 7',
        createdAt,
        updatedAt: createdAt,
        author: {
          username: 'RealWorld',
          bio: null,
          image: null,
          following: false,
        },
      });
      expect(result[0].author).not.toHaveProperty('followedBy');
    });

    test('should return comments to an anonymous caller', async () => {
      // Given
      const createdAt = new Date('2024-01-01T00:00:00Z');
      const comments = [makeComment(1, createdAt, makeAuthor('RealWorld'))];

      // When
      // @ts-ignore
      prismaMock.article.findUnique.mockResolvedValue({ comments });
      const result: any = await getCommentsByArticle(slug, undefined);

      // Then
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 1, body: 'comment 1' });
    });

    test('should set following from whether the caller follows each author', async () => {
      // Given
      const callerId = 42;
      const createdAt = new Date('2024-01-01T00:00:00Z');
      const comments = [
        makeComment(1, createdAt, makeAuthor('followed', [{ id: callerId }])),
        makeComment(2, createdAt, makeAuthor('stranger', [{ id: 1000 }])),
      ];

      // When
      // @ts-ignore
      prismaMock.article.findUnique.mockResolvedValue({ comments });
      const signedIn: any = await getCommentsByArticle(slug, callerId);
      const anonymous: any = await getCommentsByArticle(slug, undefined);

      // Then
      const following = (list: any[]) =>
        Object.fromEntries(
          list.map((c) => [c.author.username, c.author.following])
        );
      expect(following(signedIn)).toEqual({ followed: true, stranger: false });
      expect(following(anonymous)).toEqual({
        followed: false,
        stranger: false,
      });
    });

    test('should not filter the article comments by author', async () => {
      // When
      // @ts-ignore
      prismaMock.article.findUnique.mockResolvedValue({ comments: [] });
      await getCommentsByArticle(slug, 1);

      // Then
      const args: any = prismaMock.article.findUnique.mock.calls[0][0];
      expect(args.where).toEqual({ slug });
      const where = args?.include?.comments?.where;
      const serialized = JSON.stringify(where ?? {});
      expect(serialized).not.toContain('"author"');
      expect(serialized).not.toContain('"demo"');
    });
  });

  describe('addComment', () => {
    test('should return the created comment for a signed-in user', async () => {
      // Given
      const callerId = 5;
      const createdAt = new Date('2024-01-01T00:00:00Z');
      const created = {
        id: 11,
        body: 'Nice article',
        createdAt,
        updatedAt: createdAt,
        articleId: 1,
        authorId: callerId,
        author: makeAuthor('RealWorld'),
      };

      // When
      // @ts-ignore
      prismaMock.article.findUnique.mockResolvedValue({ id: 1 });
      // @ts-ignore
      prismaMock.comment.create.mockResolvedValue(created);
      const result = await addComment('Nice article', slug, callerId);

      // Then
      expect(result).toEqual({
        id: 11,
        body: 'Nice article',
        createdAt,
        updatedAt: createdAt,
        author: {
          username: 'RealWorld',
          bio: null,
          image: null,
          following: false,
        },
      });
      const args: any = prismaMock.comment.create.mock.calls[0][0];
      expect(args.data.body).toBe('Nice article');
      expect(args.data.article).toEqual({ connect: { id: 1 } });
      expect(args.data.author).toEqual({ connect: { id: callerId } });
    });

    test("should reject an empty body with 422 can't be blank", async () => {
      // When
      const error = await catchError(addComment('', slug, 1));

      // Then
      expect(error.errorCode).toBe(422);
      expect(error.message).toEqual({ errors: { body: ["can't be blank"] } });
      expect(prismaMock.comment.create).not.toHaveBeenCalled();
    });

    test("should reject a missing body with 422 can't be blank", async () => {
      // When
      const error = await catchError(addComment(undefined as any, slug, 1));

      // Then
      expect(error.errorCode).toBe(422);
      expect(error.message).toEqual({ errors: { body: ["can't be blank"] } });
      expect(prismaMock.comment.create).not.toHaveBeenCalled();
    });

    test('should accept a very long body (no maximum length)', async () => {
      // Given
      const body = 'a'.repeat(100000);
      const createdAt = new Date('2024-01-01T00:00:00Z');

      // When
      // @ts-ignore
      prismaMock.article.findUnique.mockResolvedValue({ id: 1 });
      // @ts-ignore
      prismaMock.comment.create.mockResolvedValue({
        id: 12,
        body,
        createdAt,
        updatedAt: createdAt,
        articleId: 1,
        authorId: 1,
        author: makeAuthor('RealWorld'),
      } as any);
      const result = await addComment(body, slug, 1);

      // Then
      expect(result.body).toHaveLength(100000);
      const args: any = prismaMock.comment.create.mock.calls[0][0];
      expect(args.data.body).toHaveLength(100000);
    });
  });

  describe('deleteComment', () => {
    test('should reject a non-author with 404 and not delete the comment', async () => {
      // Given
      const commentId = 123;
      const callerId = 456;

      // When
      prismaMock.comment.findFirst.mockResolvedValue(null);
      const error = await catchError(deleteComment(commentId, callerId));

      // Then
      const args: any = prismaMock.comment.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({ id: commentId, author: { id: callerId } });
      expect(error.errorCode).toBe(404);
      expect(prismaMock.comment.delete).not.toHaveBeenCalled();
    });

    test('should delete the comment for its author', async () => {
      // Given
      const commentId = 123;
      const callerId = 456;

      // When
      // @ts-ignore
      prismaMock.comment.findFirst.mockResolvedValue({
        author: { id: callerId, username: 'RealWorld' },
      } as any);
      // @ts-ignore
      prismaMock.comment.delete.mockResolvedValue({});

      // Then
      await expect(deleteComment(commentId, callerId)).resolves.toBeUndefined();
      expect(prismaMock.comment.delete).toHaveBeenCalledWith({
        where: { id: commentId },
      });
    });
  });
});
