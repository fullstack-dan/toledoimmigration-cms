"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
exports.default = {
    register( /* { strapi }: { strapi: Core.Strapi } */) { },
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
