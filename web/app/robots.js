export default function robots() {
  const origem = process.env.NEXT_PUBLIC_BLOG_URL ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${origem}/sitemap.xml`,
  };
}
