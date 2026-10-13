import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseline = resolve(import.meta.dirname, 'baseline');
const current = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const manifest = JSON.parse(await readFile(resolve(current, 'manifest.json')));
const browser = await chromium.launch();
const results = [];
try {
    const page = await browser.newPage();
    for (const capture of manifest.captures) {
        for (const name of capture.screenshots) {
            const sources = await Promise.all(
                [baseline, current].map(
                    async (directory) =>
                        `data:image/png;base64,${(
                            await readFile(resolve(directory, name))
                        ).toString('base64')}`
                )
            );
            const result = await page.evaluate(async (sources) => {
                const images = await Promise.all(
                    sources.map(
                        (source) =>
                            new Promise((resolve) => {
                                const image = new Image();
                                image.onload = () => resolve(image);
                                image.src = source;
                            })
                    )
                );
                const width = Math.max(...images.map((image) => image.width));
                const height = Math.max(...images.map((image) => image.height));
                const pixels = images.map((image) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const context = canvas.getContext('2d');
                    context.fillStyle = 'white';
                    context.fillRect(0, 0, width, height);
                    context.drawImage(image, 0, 0);
                    return context.getImageData(0, 0, width, height).data;
                });
                let changed = 0;
                let total = 0;
                for (let index = 0; index < pixels[0].length; index += 4) {
                    const distance = Math.max(
                        ...[0, 1, 2].map((channel) =>
                            Math.abs(
                                pixels[0][index + channel] -
                                    pixels[1][index + channel]
                            )
                        )
                    );
                    if (distance > 20) {
                        changed++;
                    }
                    total += distance;
                }
                return {
                    before: {
                        width: images[0].width,
                        height: images[0].height,
                    },
                    after: { width: images[1].width, height: images[1].height },
                    changedPercent: Number(
                        ((100 * changed) / (width * height)).toFixed(3)
                    ),
                    meanDifference: Number(
                        (total / (width * height)).toFixed(3)
                    ),
                };
            }, sources);
            results.push({ image: name, ...result });
        }
    }
    await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`Compared ${results.length} screenshots; ${output}`);
} finally {
    await browser.close();
}
