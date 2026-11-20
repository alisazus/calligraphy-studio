import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "calligraphy-studio",
  name: "Calligraphy Studio",
  description:
    "Design Arabic calligraphy in traditional script styles, shape each letter, and export it as PNG, SVG or PDF.",
  resources: {
    d1: ["DB"],
  },
});
