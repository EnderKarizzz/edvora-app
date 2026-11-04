import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://127.0.0.1:8000",
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 60000,
    requestTimeout: 30000,
  },
});