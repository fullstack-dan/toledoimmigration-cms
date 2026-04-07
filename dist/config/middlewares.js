"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const config = [
    'strapi::logger',
    'strapi::errors',
    'strapi::security',
    {
        name: 'strapi::cors',
        config: {
            origin: [
                'http://localhost:3000',
                (_a = process.env.FRONTEND_URL) !== null && _a !== void 0 ? _a : '',
            ].filter(Boolean),
        },
    },
    'strapi::poweredBy',
    'strapi::query',
    'strapi::body',
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
];
exports.default = config;
