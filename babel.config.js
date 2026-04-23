module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Lets drizzle's generated SQL migration files be imported as strings
      // so `useMigrations` can run them at app start.
      ["inline-import", { extensions: [".sql"] }],
    ],
  };
};
