import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: () => ({
    name: "FINN Lens",
    description: "Compare and pin FINN cars with smarter insights and cost estimation.",
    version: "1.0.0", 
    version_name: "1.0.0",
    host_permissions: ["https://www.finn.com/*"],
    permissions: [
      "tabs",
      "activeTab",
    ]
  })
});
