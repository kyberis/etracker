import { describe, expect, it } from "vitest";

import {
  breadcrumbJsonLd,
  buildMetadata,
  faqJsonLd,
  jsonLdScript,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/seo";

describe("buildMetadata", () => {
  it("sets canonical, openGraph, twitter and robots from the provided path", () => {
    const meta = buildMetadata({
      title: "Sobre Clara",
      description: "About",
      path: "/about",
    });
    expect(meta.title).toBe("Sobre Clara");
    expect(meta.alternates?.canonical).toBe("/about");
    expect(meta.openGraph?.url).toBe("/about");
    expect(meta.twitter?.title).toContain("Clara");
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it("defaults to noindex/nofollow when `index: false`", () => {
    const meta = buildMetadata({ title: "App", path: "/app", index: false });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("uses canonical '/' for the landing page", () => {
    const meta = buildMetadata({ title: "Home", path: "/" });
    expect(meta.alternates?.canonical).toBe("/");
  });
});

describe("JSON-LD generators", () => {
  it("organizationJsonLd has @type Organization and a stable URL", () => {
    const lhs = organizationJsonLd();
    expect(lhs["@type"]).toBe("Organization");
    expect(typeof lhs.url).toBe("string");
  });

  it("websiteJsonLd has a SearchAction", () => {
    const lhs = websiteJsonLd();
    expect(lhs["@type"]).toBe("WebSite");
    expect(lhs.potentialAction["@type"]).toBe("SearchAction");
    expect(lhs.potentialAction.target.urlTemplate).toMatch(
      /\?q=\{search_term_string\}$/,
    );
  });

  it("softwareApplicationJsonLd advertises Clara with feature list", () => {
    const lhs = softwareApplicationJsonLd();
    expect(lhs["@type"]).toBe("SoftwareApplication");
    expect(Array.isArray(lhs.featureList)).toBe(true);
    expect(lhs.featureList.length).toBeGreaterThan(3);
  });

  it("faqJsonLd builds a Question array per entry", () => {
    const lhs = faqJsonLd([
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
    ]);
    expect(lhs.mainEntity).toHaveLength(2);
    expect(lhs.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: "Q1",
      acceptedAnswer: { "@type": "Answer", text: "A1" },
    });
  });

  it("breadcrumbJsonLd numbers items 1..n", () => {
    const lhs = breadcrumbJsonLd([
      { name: "Inicio", path: "/" },
      { name: "FAQ", path: "/faq" },
    ]);
    expect(lhs.itemListElement[0].position).toBe(1);
    expect(lhs.itemListElement[1].position).toBe(2);
    expect(lhs.itemListElement[1].item).toContain("/faq");
  });
});

describe("jsonLdScript", () => {
  it("returns props suitable for <script type=application/ld+json>", () => {
    const props = jsonLdScript({ a: 1 });
    expect(props.type).toBe("application/ld+json");
    expect(props.dangerouslySetInnerHTML.__html).toBe('{"a":1}');
  });
});
