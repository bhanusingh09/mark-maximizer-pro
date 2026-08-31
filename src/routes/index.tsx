import { createFileRoute } from "@tanstack/react-router";

import MarkMaxxerApp from "@/MarkMaxxerApp";

const title = "MarkMaxxer — Faculty marksheet workspace";
const description =
  "Extract, verify, and approve examination marks with a calm, reviewable workflow built for faculty.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarkMaxxerApp,
});
