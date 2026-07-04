import "../../chunks/index2.js";
import { w as waitLocale } from "../../chunks/runtime.js";
const prerender = true;
const trailingSlash = "never";
const load = async () => {
  await waitLocale();
};
export {
  load,
  prerender,
  trailingSlash
};
