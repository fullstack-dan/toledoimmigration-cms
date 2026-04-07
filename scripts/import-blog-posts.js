'use strict';

const fs = require('fs');
const path = require('path');
const TurndownService = require('turndown');

const POSTS_DIR = process.env.POSTS_DIR || path.join(__dirname, '../data/blog-posts');

// Attorney info
const AUTHOR = {
  name: 'Mariana Toledo-Hermina',
  email: 'mariana@toledoimmigrationlaw.com',
};

// Categories and their filename keyword triggers
const CATEGORIES = [
  { name: 'Green Cards', slug: 'green-cards', description: 'Articles about obtaining and maintaining a green card.', keywords: ['green-card'] },
  { name: 'Citizenship & Naturalization', slug: 'citizenship-naturalization', description: 'Articles about U.S. citizenship and the naturalization process.', keywords: ['citizen', 'naturalization'] },
  { name: 'DACA', slug: 'daca', description: 'Articles about Deferred Action for Childhood Arrivals (DACA).', keywords: ['daca', 'dreamer'] },
  { name: 'TPS & Humanitarian Relief', slug: 'tps-humanitarian-relief', description: 'Articles about Temporary Protected Status and humanitarian immigration relief.', keywords: ['tps', 'humanitarian', 'parole', 'venezuelan', 'haitian', 'cuban', 'nicaraguan', 'burmese'] },
  { name: 'Family-Based Immigration', slug: 'family-based-immigration', description: 'Articles about family-based immigration petitions and visas.', keywords: ['family', 'spouse', 'child', 'parent', 'unity'] },
  { name: 'Visas & Travel', slug: 'visas-travel', description: 'Articles about visa types and international travel considerations.', keywords: ['visa', 'travel', 'caution-before', 'fly'] },
  { name: 'LGBTQ+ Immigration', slug: 'lgbtq-immigration', description: 'Articles about immigration rights for LGBTQ+ individuals.', keywords: ['lgbtq', 'lgbtiq', 'same-sex'] },
  { name: 'Resources', slug: 'resources', description: 'Immigration resources, scholarships, and general information.', keywords: ['scholarship', 'labor', 'irs', 'becas'] },
  { name: 'USCIS Updates', slug: 'uscis-updates', description: 'Latest updates and changes from USCIS.', keywords: [] }, // default/fallback
];

// Acronyms to preserve in title case conversion
const ACRONYMS = new Set(['DACA', 'USCIS', 'TPS', 'EAD', 'US', 'CBP', 'IRS', 'LGBTQ', 'LGBTIQ', 'VAWA']);

const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'up', 'as', 'if', 'it']);

function filenameToTitle(filename) {
  const slug = filename.replace(/\.html$/, '');
  const words = slug.split('-');
  return words.map((word, i) => {
    const upper = word.toUpperCase();
    if (ACRONYMS.has(upper)) return upper;
    // Keep small words lowercase unless first word
    if (i > 0 && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

function extractDescription(html, maxLen = 300) {
  const plainText = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (plainText.length <= maxLen) return plainText;
  // Leave room for '...' so total never exceeds maxLen
  const trimmed = plainText.slice(0, maxLen - 3);
  const lastSpace = trimmed.lastIndexOf(' ');
  return (lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed) + '...';
}

function htmlToMarkdown(html) {
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  // Strip WordPress class attributes and normalize whitespace
  const clean = html
    .replace(/ class="[^"]*"/g, '')
    .replace(/&nbsp;/g, ' ');
  return td.turndown(clean);
}

function assignCategory(filename, categoryMap) {
  const lowerFilename = filename.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some((kw) => lowerFilename.includes(kw))) {
      return categoryMap[cat.slug];
    }
  }
  // Default: USCIS Updates
  return categoryMap['uscis-updates'];
}

async function setPublicPermissions(strapi, newPermissions) {
  const publicRole = await strapi.query('plugin::users-permissions.role').findOne({
    where: { type: 'public' },
  });
  const allPermissionsToCreate = [];
  Object.keys(newPermissions).forEach((controller) => {
    const actions = newPermissions[controller];
    const permissionsToCreate = actions.map((action) =>
      strapi.query('plugin::users-permissions.permission').create({
        data: {
          action: `api::${controller}.${controller}.${action}`,
          role: publicRole.id,
        },
      })
    );
    allPermissionsToCreate.push(...permissionsToCreate);
  });
  await Promise.all(allPermissionsToCreate);
}

async function createOrFindAuthor(strapi) {
  const existing = await strapi.documents('api::author.author').findFirst({
    filters: { email: { $eq: AUTHOR.email } },
  });
  if (existing) {
    console.log(`Author already exists: ${AUTHOR.name}`);
    return existing.documentId;
  }
  const created = await strapi.documents('api::author.author').create({
    data: AUTHOR,
  });
  console.log(`Created author: ${AUTHOR.name}`);
  return created.documentId;
}

async function createCategories(strapi) {
  const categoryMap = {};
  for (const cat of CATEGORIES) {
    const existing = await strapi.documents('api::category.category').findFirst({
      filters: { slug: { $eq: cat.slug } },
    });
    if (existing) {
      console.log(`Category already exists: ${cat.name}`);
      categoryMap[cat.slug] = existing.documentId;
    } else {
      const created = await strapi.documents('api::category.category').create({
        data: { name: cat.name, slug: cat.slug, description: cat.description },
      });
      console.log(`Created category: ${cat.name}`);
      categoryMap[cat.slug] = created.documentId;
    }
  }
  return categoryMap;
}

async function importArticles(strapi, authorDocumentId, categoryMap) {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.html'));
  console.log(`\nImporting ${files.length} blog posts...\n`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const filename of files) {
    const slug = filename.replace(/\.html$/, '');

    // Duplicate guard
    const existing = await strapi.documents('api::article.article').findFirst({
      filters: { slug: { $eq: slug } },
    });
    if (existing) {
      console.log(`  SKIP  ${slug}`);
      skipped++;
      continue;
    }

    try {
      const rawHtml = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf8');
      const title = filenameToTitle(filename);
      const description = extractDescription(rawHtml);
      const markdown = htmlToMarkdown(rawHtml);
      const categoryDocumentId = assignCategory(filename, categoryMap);

      const created = await strapi.documents('api::article.article').create({
        data: {
          title,
          slug,
          description,
          author: authorDocumentId,
          category: categoryDocumentId,
          blocks: [
            {
              __component: 'shared.rich-text',
              body: markdown,
            },
          ],
        },
        status: 'published',
      });

      // Explicitly publish in case status param isn't sufficient
      await strapi.documents('api::article.article').publish({
        documentId: created.documentId,
      });

      console.log(`  OK    ${slug}`);
      imported++;
    } catch (err) {
      console.error(`  FAIL  ${slug}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${imported} imported, ${skipped} skipped, ${failed} failed`);
}

async function importBlogPosts(strapi) {
  console.log('Setting public API permissions...');
  await setPublicPermissions(strapi, {
    article: ['find', 'findOne'],
    category: ['find', 'findOne'],
    author: ['find', 'findOne'],
  });

  console.log('Creating author...');
  const authorDocumentId = await createOrFindAuthor(strapi);

  console.log('Creating categories...');
  const categoryMap = await createCategories(strapi);

  await importArticles(strapi, authorDocumentId, categoryMap);
}

async function main() {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';

  try {
    await importBlogPosts(app);
  } catch (err) {
    console.error('Import failed:', err);
    await app.destroy();
    process.exit(1);
  }

  await app.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
