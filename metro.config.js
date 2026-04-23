const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Treat .sql as source extensions so drizzle-kit migrations can be imported.
config.resolver.sourceExts.push("sql");

// expo-sqlite's web build imports a .wasm binary via `import wasmModule from
// "./wa-sqlite/wa-sqlite.wasm"`. Metro needs to see that extension as an asset.
config.resolver.assetExts.push("wasm");

module.exports = config;
