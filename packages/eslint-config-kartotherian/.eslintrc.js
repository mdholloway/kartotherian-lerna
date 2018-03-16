module.exports = {
  extends: 'airbnb-base',
  env: {
    node: true,
    es6: true,
    browser: false,
  },
  rules: {
    'no-underscore-dangle': [0],
    'no-plusplus': [0],

    // Allow ForOfStatement
    'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'],

    // Dangling commas are not supported for functions in node before v8.x
    'comma-dangle': [
      'error',
      {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        imports: 'always-multiline',
        exports: 'always-multiline',
        functions: 'never',
      },
    ],
  },
};
