"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
async function postToLinkedIn(strapi, title, description, url) {
    const token = process.env.LINKEDIN_ACCESS_TOKEN;
    const authorUrn = process.env.LINKEDIN_AUTHOR_URN;
    if (!token || !authorUrn) {
        strapi.log.warn('[Social] LinkedIn env vars not set, skipping.');
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
            article: { source: url, title, description },
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
    };
    strapi.log.info('[Social] Posting to LinkedIn with payload:', JSON.stringify(body, null, 2));
    const res = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'LinkedIn-Version': '202604',
            'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        strapi.log.error(`[Social] LinkedIn post failed (${res.status}): ${text}`);
    }
    else {
        const text = await res.text();
        strapi.log.info(`[Social] LinkedIn post published. Response: ${text}`);
    }
}
async function postToFacebook(strapi, message, url) {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const pageId = process.env.FACEBOOK_PAGE_ID;
    if (!token || !pageId) {
        strapi.log.warn('[Social] Facebook env vars not set, skipping.');
        return;
    }
    strapi.log.info(`[Social] Posting to Facebook page ${pageId} with message:`, message);
    const params = new URLSearchParams({ message, link: url, access_token: token });
    const res = await fetch(`https://graph.facebook.com/v25.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });
    if (!res.ok) {
        const text = await res.text();
        strapi.log.error(`[Social] Facebook post failed (${res.status}): ${text}`);
    }
    else {
        const data = await res.json();
        strapi.log.info(`[Social] Facebook post published. Post ID: ${data.id}`);
    }
}
exports.default = {
    register({ strapi }) {
        strapi.documents.use(async (context, next) => {
            var _a;
            const result = await next();
            if (context.uid === 'api::article.article' &&
                context.action === 'publish') {
                // Fetch the full document since the publish result may omit fields like slug
                const documentId = (_a = context.params) === null || _a === void 0 ? void 0 : _a.documentId;
                const doc = await strapi.documents('api::article.article').findOne({
                    documentId,
                    fields: ['title', 'description', 'slug'],
                });
                strapi.log.info('[Social] Article published, posting to social media...', {
                    title: doc === null || doc === void 0 ? void 0 : doc.title,
                    slug: doc === null || doc === void 0 ? void 0 : doc.slug,
                });
                const { title, description, slug } = doc;
                const siteUrl = process.env.FRONTEND_URL || '';
                const postUrl = `${siteUrl}/blog/${slug}`;
                const message = `${title}\n\n${description}\n\nRead more: ${postUrl}`;
                await Promise.allSettled([
                    // postToLinkedIn(strapi, title, description, postUrl),
                    postToFacebook(strapi, message, postUrl),
                ]);
            }
            return result;
        });
    },
    async bootstrap({ strapi }) {
        const pluginStore = strapi.store({
            environment: strapi.config.environment,
            type: 'type',
            name: 'blog-import',
        });
        const hasImported = await pluginStore.get({ key: 'hasImported' });
        if (hasImported) {
            return;
        }
        strapi.log.info('Running one-time blog post import...');
        try {
            // ../scripts resolves to dist/scripts/ in production and scripts/ in dev
            const { importBlogPosts } = require(path_1.default.join(__dirname, '../scripts/import-blog-posts'));
            await importBlogPosts(strapi);
            await pluginStore.set({ key: 'hasImported', value: true });
            strapi.log.info('Blog post import complete.');
        }
        catch (err) {
            strapi.log.error('Blog post import failed:', err);
        }
    },
};
