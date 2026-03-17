import { defineConfig } from "vitepress";

export default defineConfig({
  title: "@half0wl/container",
  description:
    "Lightweight decorator-based dependency injection container for TypeScript",
  cleanUrls: true,
  head: [
    ["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
    [
      "script",
      {
        defer: "",
        src: "https://food.ray.cat/script.js",
        "data-website-id": "9e7fd24c-02c0-4e73-af2c-a8af32d3e32b",
      },
    ],
  ],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API Reference", link: "/api/" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Services", link: "/guide/services" },
            { text: "Dependency Injection", link: "/guide/injection" },
            { text: "Tracing", link: "/guide/tracing" },
            { text: "Testing", link: "/guide/testing" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [
            { text: "Overview", link: "/api/" },
            {
              text: "Container",
              link: "/api/Class.Container",
            },
            {
              text: "BaseService",
              link: "/api/Class.BaseService",
            },
            {
              text: "Service()",
              link: "/api/Function.Service",
            },
            {
              text: "Inject()",
              link: "/api/Function.Inject",
            },
            {
              text: "IContainer",
              link: "/api/Interface.IContainer",
            },
            {
              text: "ContainerConfig",
              link: "/api/Interface.ContainerConfig",
            },
            {
              text: "ServiceDependencies",
              link: "/api/TypeAlias.ServiceDependencies",
            },
            {
              text: "Constructor",
              link: "/api/TypeAlias.Constructor",
            },
            {
              text: "TraceFn",
              link: "/api/TypeAlias.TraceFn",
            },
            {
              text: "ServiceOptions",
              link: "/api/Interface.ServiceOptions",
            },
            {
              text: "wrapWithTracing()",
              link: "/api/Function.wrapWithTracing",
            },
            {
              text: "getPropertyDescriptorFromChain()",
              link: "/api/Function.getPropertyDescriptorFromChain",
            },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/half0wl/container" },
      { icon: "twitter", link: "https://x.com/raychen" },
    ],
  },
});
