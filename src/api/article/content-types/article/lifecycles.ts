export default {
  async afterUpdate(event: any) {
    const { result, params } = event;

    // Only fire when an article is being published (not on every save)
    const isBeingPublished =
      params?.data?.publishedAt && result?.publishedAt;

    if (!isBeingPublished) return;

    const { title, description, slug } = result;
    const siteUrl = process.env.FRONTEND_URL || '';
    const postUrl = `${siteUrl}/blog/${slug}`;
    const message = `${title}\n\n${description}\n\nRead more: ${postUrl}`;

    await Promise.allSettled([
      postToLinkedIn(title, description, postUrl),
      postToFacebook(message, postUrl),
    ]);
  },
};

async function postToLinkedIn(
  title: string,
  description: string,
  url: string
) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN;

  if (!token || !authorUrn) {
    console.warn('[Social] LinkedIn env vars not set, skipping.');
    return;
  }

  const body = {
    author: authorUrn,
    commentary: `New blog post: ${title}\n\n${description}\n\n${url}`,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: {
      article: {
        source: url,
        title,
        description,
      },
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': '202504',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[Social] LinkedIn post failed (${res.status}): ${text}`);
  } else {
    console.log('[Social] LinkedIn post published.');
  }
}

async function postToFacebook(message: string, url: string) {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;

  if (!token || !pageId) {
    console.warn('[Social] Facebook env vars not set, skipping.');
    return;
  }

  const params = new URLSearchParams({
    message,
    link: url,
    access_token: token,
  });

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/feed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`[Social] Facebook post failed (${res.status}): ${text}`);
  } else {
    console.log('[Social] Facebook post published.');
  }
}
