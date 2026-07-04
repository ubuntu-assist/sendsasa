import { s as subscribe } from "../../chunks/utils3.js";
import { c as create_ssr_component, e as escape } from "../../chunks/ssr.js";
import { p as page } from "../../chunks/stores.js";
const Error = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $page, $$unsubscribe_page;
  $$unsubscribe_page = subscribe(page, (value) => $page = value);
  $$unsubscribe_page();
  return `${$$result.head += `<!-- HEAD_svelte-13l6jcp_START -->${$$result.title = `<title>${escape($page.status)} — SendSasa</title>`, ""}<!-- HEAD_svelte-13l6jcp_END -->`, ""} <div class="error-area ptb-120 bg-img" style="background-image: url('/assets/images/page-bg.png')"><div class="container mw-1690"><div class="text-center" data-cues="slideInUp" data-duration="900"><h1 class="display-1 fw-bold text-primary">${escape($page.status)}</h1> <h2 class="main-title">${escape($page.error?.message ?? "Page Not Found")}</h2> <p class="text-secondary mb-5" data-svelte-h="svelte-blmxkm">The page you are looking for does not exist or has been moved.</p> <a href="/" class="default-btn" data-svelte-h="svelte-8iefbr">Back to Home</a></div></div></div>`;
});
export {
  Error as default
};
