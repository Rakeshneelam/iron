module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { reanimated: true }]],
    plugins: [
      [
        'module-resolver',
        { alias: { '@': './src' }, extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] },
      ],
      // Must stay last. Reanimated 4 routes through react-native-worklets.
      'react-native-worklets/plugin',
    ],
  };
};
