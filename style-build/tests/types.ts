import { compileStyle } from '@neon-kit/style-build';

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
