import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { 'no-undef': 'off', 'no-unused-vars': 'off', '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': 'off', '@typescript-eslint/no-unsafe-function-type': 'off' } },
];
