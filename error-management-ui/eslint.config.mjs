import nextConfig from "eslint-config-next";

// eslint-config-next's default export is already a flat-config array (no FlatCompat
// bridging needed) — bridging it via FlatCompat's legacy `extends()` path hits a circular
// JSON bug when eslint-plugin-react's flat "recommended" config gets re-resolved.
const eslintConfig = [...nextConfig];

export default eslintConfig;
