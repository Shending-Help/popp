import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/conversations/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@nestjs/*', '@prisma/client', 'node:*'],
            message: 'domain/ must stay framework-free — see plan Global Constraints' },
        ],
      }],
    },
  },
);
