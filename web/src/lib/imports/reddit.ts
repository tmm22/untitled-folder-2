interface RedditListing {
  data: {
    children: Array<{
      data: RedditPost;
    }>;
  };
}

interface RedditPost {
  title?: string;
  selftext?: string;
  body?: string;
  author?: string;
  created_utc?: number;
  replies?: RedditListing | '';
}

interface ParsedRedditContent {
  title: string;
  content: string;
}

const MAX_COMMENTS = 80;

export function parseRedditThread(listings: RedditListing[]): ParsedRedditContent | null {
  if (!Array.isArray(listings) || listings.length < 2) {
    return null;
  }

  const [postListing, commentsListing] = listings;
  const postData = postListing.data.children[0]?.data;
  if (!postData) {
    return null;
  }

  const title = postData.title ?? 'Reddit Thread';
  const body = postData.selftext?.trim() ?? '';
  const comments: string[] = [];

  const queue = [...commentsListing.data.children];
  while (queue.length > 0 && comments.length < MAX_COMMENTS) {
    const comment = queue.shift()?.data;
    if (!comment) continue;

    const text = comment.body?.trim();
    if (text) {
      const author = comment.author ? `u/${comment.author}` : 'anon';
      comments.push(`${author}: ${sanitizeComment(text)}`);
    }

    if (comment.replies && typeof comment.replies !== 'string') {
      queue.push(...comment.replies.data.children);
    }
  }

  const commentSection = comments.map((comment) => `> ${comment}`).join('\n\n');
  const combined = [body, commentSection].filter(Boolean).join('\n\n');

  return {
    title,
    content: combined,
  };
}

function sanitizeComment(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

