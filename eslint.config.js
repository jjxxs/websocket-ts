export default [
  {
    extends: [
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:prettier/recommended",
    ],
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint", "prettier"],
    env: {
      browser: true,
      node: true,
      es6: true,
    },
    parserOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
    },
    rules: {
      // No custom rules
    },
  },
];
