import { builtinModules } from 'node:module';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Node accepts built-ins with or without the `node:` prefix (e.g. both `fs`
// and `node:fs` resolve to the same module), so both forms must be blocked.
const bareBuiltins = builtinModules.filter((m) => !m.startsWith('node:'));

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/conversations/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@nestjs/*', '@prisma/client', 'node:*', ...bareBuiltins],
            message: 'domain/ must stay framework-free — see plan Global Constraints' },
        ],
      }],
    },
  },
);
