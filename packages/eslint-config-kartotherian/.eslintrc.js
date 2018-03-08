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
  },
};
