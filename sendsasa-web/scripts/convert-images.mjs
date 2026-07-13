import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { join } from 'path';

const IMAGES_DIR = new URL('../static/assets/images/', import.meta.url).pathname.replace(/^\//, '');

const targets = [
  { input: 'banner-img.png',      quality: 90 },
  { input: 'no-app-needed.jpg',   quality: 82 },
  { input: 'feature1.png',        quality: 90 },
  { input: 'feature2.png',        quality: 90 },
  { input: 'feature3.png',        quality: 90 },
  { input: 'ayahq.png',           quality: 90 },
  { input: 'try-now.jpeg',        quality: 82 },
  { input: 'about-img.jpeg',      quality: 82 },
  { input: 'apps-img.jpeg',       quality: 82 },
  { input: 'why-choose-bg.jpeg',  quality: 82 },
  { input: 'testimonial-bg.jpeg', quality: 82 },
  { input: 'faq-bg.jpeg',         quality: 82 },
  { input: 'banner-bg.jpeg',      quality: 82 },
];

for (const { input, quality } of targets) {
  const inputPath  = join(IMAGES_DIR, input);
  const outputPath = join(IMAGES_DIR, input.replace(/\.(png|jpe?g)$/i, '.webp'));
  try {
    const info = await sharp(inputPath).webp({ quality }).toFile(outputPath);
    const inputBytes  = (await sharp(inputPath).metadata()).size ?? 0;
    console.log(`✓ ${input} → ${input.replace(/\.(png|jpe?g)$/i, '.webp')}  (${(info.size / 1024).toFixed(0)} KB)`);
  } catch (err) {
    console.error(`✗ ${input}: ${err.message}`);
  }
}
