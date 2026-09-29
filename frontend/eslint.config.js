import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {ignores: ['dist']},
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': ['warn', {allowConstantExport: true}],
        },
    },
    {
        files: ['src/**/*.{ts,tsx}'],
        ignores: ['src/components/ui/Slider.tsx', 'src/**/*.test.{ts,tsx}'],
        rules: {
            'no-restricted-syntax': ['error', {
                selector: "JSXOpeningElement[name.name=/^(input|Input)$/]:has(JSXAttribute[name.name='type'][value.value='range'])",
                message: 'Use the shared Slider component so range controls keep the same styling and focus behavior.',
            }, {
                selector: "JSXOpeningElement[name.name='select']",
                message: 'Use CustomSelect so dropdowns share the same menu and keyboard behavior.',
            }],
        },
    },
    {
        files: ['src/contexts/**/*.{ts,tsx}'],
        rules: {'react-refresh/only-export-components': 'off'},
    },
);
