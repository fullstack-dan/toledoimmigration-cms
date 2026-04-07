import type { Core } from '@strapi/strapi';
import path from 'path';

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
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
      const { importBlogPosts } = require(path.join(__dirname, '../scripts/import-blog-posts'));
      await importBlogPosts(strapi);
      await pluginStore.set({ key: 'hasImported', value: true });
      strapi.log.info('Blog post import complete.');
    } catch (err) {
      strapi.log.error('Blog post import failed:', err);
    }
  },
};
