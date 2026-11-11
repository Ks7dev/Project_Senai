import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import jsdoc from "eslint-plugin-jsdoc"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // RNF08: every exported function, class and component has JSDoc.
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
            ClassDeclaration: true,
            MethodDefinition: true,
          },
          contexts: ["TSInterfaceDeclaration", "TSTypeAliasDeclaration"],
        },
      ],
      "jsdoc/require-description": "error",
      "jsdoc/check-param-names": ["error", { checkDestructured: false }],
      "jsdoc/check-tag-names": "error",
      "jsdoc/no-types": "error",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "prisma/migrations/**",
    "components/ui/**",
    "generated/**",
  ]),
])

export default eslintConfig
