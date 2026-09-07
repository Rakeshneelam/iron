const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Drizzle migrations are emitted as .sql; Metro must bundle them as assets.
config.resolver.sourceExts.push('sql');
module.exports = config;
