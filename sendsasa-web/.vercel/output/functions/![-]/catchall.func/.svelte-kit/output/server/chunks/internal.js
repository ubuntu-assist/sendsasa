import { c as create_ssr_component, s as setContext, v as validate_component, m as missing_component } from "./ssr.js";
import { a as afterUpdate } from "./ssr2.js";
import "./server.js";
const Root = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { stores } = $$props;
  let { page } = $$props;
  let { constructors } = $$props;
  let { components = [] } = $$props;
  let { form } = $$props;
  let { data_0 = null } = $$props;
  let { data_1 = null } = $$props;
  {
    setContext("__svelte__", stores);
  }
  afterUpdate(stores.page.notify);
  if ($$props.stores === void 0 && $$bindings.stores && stores !== void 0) $$bindings.stores(stores);
  if ($$props.page === void 0 && $$bindings.page && page !== void 0) $$bindings.page(page);
  if ($$props.constructors === void 0 && $$bindings.constructors && constructors !== void 0) $$bindings.constructors(constructors);
  if ($$props.components === void 0 && $$bindings.components && components !== void 0) $$bindings.components(components);
  if ($$props.form === void 0 && $$bindings.form && form !== void 0) $$bindings.form(form);
  if ($$props.data_0 === void 0 && $$bindings.data_0 && data_0 !== void 0) $$bindings.data_0(data_0);
  if ($$props.data_1 === void 0 && $$bindings.data_1 && data_1 !== void 0) $$bindings.data_1(data_1);
  let $$settled;
  let $$rendered;
  let previous_head = $$result.head;
  do {
    $$settled = true;
    $$result.head = previous_head;
    {
      stores.page.set(page);
    }
    $$rendered = `  ${constructors[1] ? `${validate_component(constructors[0] || missing_component, "svelte:component").$$render(
      $$result,
      {
        data: data_0,
        params: page.params,
        this: components[0]
      },
      {
        this: ($$value) => {
          components[0] = $$value;
          $$settled = false;
        }
      },
      {
        default: () => {
          return `${validate_component(constructors[1] || missing_component, "svelte:component").$$render(
            $$result,
            {
              data: data_1,
              form,
              params: page.params,
              this: components[1]
            },
            {
              this: ($$value) => {
                components[1] = $$value;
                $$settled = false;
              }
            },
            {}
          )}`;
        }
      }
    )}` : `${validate_component(constructors[0] || missing_component, "svelte:component").$$render(
      $$result,
      {
        data: data_0,
        form,
        params: page.params,
        this: components[0]
      },
      {
        this: ($$value) => {
          components[0] = $$value;
          $$settled = false;
        }
      },
      {}
    )}`} ${``}`;
  } while (!$$settled);
  return $$rendered;
});
let read_implementation = null;
function set_read_implementation(fn) {
  read_implementation = fn;
}
function set_manifest(_) {
}
let public_env = {};
function set_private_env(environment) {
}
function set_public_env(environment) {
  public_env = environment;
}
const error = ({ status, message }) => '<!doctype html>\n<html lang="en">\n	<head>\n		<meta charset="utf-8" />\n		<title>' + message + `</title>

		<style>
			body {
				--bg: white;
				--fg: #222;
				--divider: #ccc;
				background: var(--bg);
				color: var(--fg);
				font-family:
					system-ui,
					-apple-system,
					BlinkMacSystemFont,
					'Segoe UI',
					Roboto,
					Oxygen,
					Ubuntu,
					Cantarell,
					'Open Sans',
					'Helvetica Neue',
					sans-serif;
				display: flex;
				align-items: center;
				justify-content: center;
				height: 100vh;
				margin: 0;
			}

			.error {
				display: flex;
				align-items: center;
				max-width: 32rem;
				margin: 0 1rem;
			}

			.status {
				font-weight: 200;
				font-size: 3rem;
				line-height: 1;
				position: relative;
				top: -0.05rem;
			}

			.message {
				border-left: 1px solid var(--divider);
				padding: 0 0 0 1rem;
				margin: 0 0 0 1rem;
				min-height: 2.5rem;
				display: flex;
				align-items: center;
			}

			.message h1 {
				font-weight: 400;
				font-size: 1em;
				margin: 0;
			}

			@media (prefers-color-scheme: dark) {
				body {
					--bg: #222;
					--fg: #ddd;
					--divider: #666;
				}
			}
		</style>
	</head>
	<body>
		<div class="error">
			<span class="status">` + status + '</span>\n			<div class="message">\n				<h1>' + message + "</h1>\n			</div>\n		</div>\n	</body>\n</html>\n";
const options = {
  app_template_contains_nonce: false,
  async: false,
  csp: { "mode": "auto", "directives": { "upgrade-insecure-requests": false, "block-all-mixed-content": false }, "reportOnly": { "upgrade-insecure-requests": false, "block-all-mixed-content": false } },
  csrf_check_origin: true,
  csrf_trusted_origins: [],
  embedded: false,
  env_public_prefix: "PUBLIC_",
  env_private_prefix: "",
  hash_routing: false,
  hooks: null,
  // added lazily, via `get_hooks`
  preload_strategy: "modulepreload",
  root: Root,
  service_worker: false,
  service_worker_options: void 0,
  server_error_boundaries: false,
  templates: {
    app: ({ head, body, assets, nonce, env }) => `\uFEFF<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, shrink-to-fit=no"
    />
    <link rel="icon" type="image/png" href="/assets/images/favicon.ico" />
    <link rel="stylesheet" href="/assets/css/swiper-bundle.min.css" />
    <link rel="stylesheet" href="/assets/css/scrollCue.css" />
    <link rel="stylesheet" href="/assets/css/tabler-icons.min.css" />
    <link rel="stylesheet" href="/assets/css/britti-sans-trial.css" />
    <link rel="stylesheet" href="/assets/css/style.css" />
    <style>
      /* Sticky navbar must outrank the fixed-top wrapper (z-index 1030) */
      .navbar.sticky {
        z-index: 1031 !important;
      }

      /* Active/hover underline: sit right below the text, not at the bottom of the 38px padding */
      .navbar .navbar-nav .nav-item .nav-link::before {
        bottom: 36px !important;
      }

      /* Dark-blue sections: force white text so it's readable on #0B47CC */
      .bg-dark-div .fun-fact-single-item h2,
      .bg-dark-div .fun-fact-single-item .h2,
      .bg-dark-div .fun-fact-single-item p {
        color: #fff;
      }
      .bg-dark-div .fun-fact-single-item,
      .bg-dark-div .fun-fact-single-item:last-child {
        border-color: rgba(255, 255, 255, 0.25);
      }

      /* Preloader failsafe: CSS auto-hide after 8 s if JS never runs */
      #preloader {
        animation: preloader-timeout 0.4s 8s forwards;
      }
      @keyframes preloader-timeout {
        to { opacity: 0; visibility: hidden; pointer-events: none; }
      }

      /* scrollCue failsafe: applied by JS timeout to elements still invisible after 3 s */
      .scrollcue-force-visible {
        opacity: 1 !important;
        transform: none !important;
        visibility: visible !important;
      }

      :root {
        /* Gold (#FFBB00) replaces lime-green as the primary accent:
				   buttons, CTA highlights, underline decorations */
        --bs-primary: #ffbb00;
        --bs-primary-rgb: 255, 187, 0;

        /* Royal blue (#0B47CC) replaces dark teal as the dark surface:
				   top header bar, dark section backgrounds */
        --bs-dark-div: #0b47cc;
        --bs-dark-div-rgb: 11, 71, 204;

        /* Slightly deeper blue for the second dark surface level */
        --bs-dark-div2: #0a3ab5;
        --bs-dark-div2-rgb: 10, 58, 181;

        /* Very light blue tint replaces the lime-tinted card background */
        --bs-gray2: #eef3ff;
        --bs-gray2-rgb: 238, 243, 255;

        /* Gold also replaces orange for star ratings / secondary highlights */
        --bs-warning2: #ffbb00;
        --bs-warning2-rgb: 255, 187, 0;
      }
    </style>
    ` + head + '\n  </head>\n  <body data-sveltekit-preload-data="hover">\n    <div style="display: contents">' + body + '</div>\n    <script src="/assets/js/bootstrap.bundle.min.js"><\/script>\n    <script src="/assets/js/swiper-bundle.min.js"><\/script>\n    <script src="/assets/js/scrollCue.min.js"><\/script>\n    <script src="/assets/js/fslightbox.js"><\/script>\n    <script src="/assets/js/ukiyo.min.js"><\/script>\n  </body>\n</html>\n',
    error
  },
  version_hash: "1oxuayl"
};
async function get_hooks() {
  let handle;
  let handleFetch;
  let handleError;
  let handleValidationError;
  let init;
  let reroute;
  let transport;
  return {
    handle,
    handleFetch,
    handleError,
    handleValidationError,
    init,
    reroute,
    transport
  };
}
export {
  set_public_env as a,
  set_read_implementation as b,
  set_manifest as c,
  get_hooks as g,
  options as o,
  public_env as p,
  read_implementation as r,
  set_private_env as s
};
