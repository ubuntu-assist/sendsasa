import * as universal from '../entries/pages/_layout.ts.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.8aesVzx5.js","_app/immutable/chunks/C1FmrZbK.js","_app/immutable/chunks/D9MhLQZi.js","_app/immutable/chunks/DBtseMoq.js","_app/immutable/chunks/CVOtvWD7.js","_app/immutable/chunks/HSM2O79_.js","_app/immutable/chunks/DZKQXULP.js","_app/immutable/chunks/V1ggX03R.js"];
export const stylesheets = ["_app/immutable/assets/0.BWYpsWF4.css"];
export const fonts = [];
