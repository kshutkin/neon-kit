import { compileStyle, createStyleDeclaration, rewriteStyleUrls, type CompiledStyleModule } from '@neon-kit/style-build';

const modules = await compileStyle('/styles/link.module.css', {
    async read(id) {
        return id;
    },
    async resolve(specifier, importer) {
        return `${importer}/${specifier}`;
    },
});

modules[0].exports.link satisfies string;
modules[0].dependencies[0].kind satisfies 'import' | 'compose';
modules[0] satisfies CompiledStyleModule;
modules[0].urls[0].url satisfies string;
modules[0].map satisfies string | undefined;
createStyleDeclaration('theme.css?neon', modules[0]) satisfies string;
rewriteStyleUrls(modules[0], {}).css satisfies string;
