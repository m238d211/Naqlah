import parser from '@typescript-eslint/parser';
export default [{ ignores: ['**/dist/**','**/node_modules/**'] }, { files: ['**/*.{ts,tsx}'], languageOptions: { parser }, rules: {} }];
