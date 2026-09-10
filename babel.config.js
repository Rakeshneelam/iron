module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { reanimated: true }]],
    plugins: [
      // Drizzle's Expo migrator imports the generated .sql files as strings.
      // Without this Metro parses the SQL as JavaScript and the bundle fails.
      ['inline-import', { extensions: ['.sql'] }],
      [
        'module-resolver',
        { alias: { '@': './src' }, extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] },
      ],
      // Must stay last. Reanimated 4 routes through react-native-worklets.
      'react-native-worklets/plugin',
    ],
  };
};
