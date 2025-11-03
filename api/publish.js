/**
 * VERCEL SERVERLESS FUNCTION
 *
 * This file must be placed in the /api directory of your Vercel project.
 * It will automatically become a serverless function endpoint at /api/publish.
 *
 * It receives the blog content from the frontend, adds the secret API keys
 * from Vercel Environment Variables, and makes the secure call to Webflow.
 */

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // 1. Get Secret Keys from Vercel Environment Variables
    //    NEVER hardcode these here.
    const { WEBFLOW_API_KEY, WEBFLOW_COLLECTION_ID } = process.env;

    if (!WEBFLOW_API_KEY || !WEBFLOW_COLLECTION_ID) {
      console.error("Missing Vercel Environment Variables");
      return res
        .status(500)
        .json({ error: "Server configuration error. Missing API keys." });
    }

    // 2. Get data from the frontend (index.html)
    const {
      content,
      imageUrl,
      baseUrl,
      publisherName,
      publisherLogoUrl,
      fieldSlugs,
    } = req.body;

    if (!content || !imageUrl || !baseUrl || !fieldSlugs) {
      return res
        .status(400)
        .json({ error: "Missing required fields from client." });
    }

    // 3. Prepare Schema (update URLs and publisher info)
    const postUrl = `${baseUrl}/${content.slug}`;
    content.news_schema.mainEntityOfPage["@id"] = postUrl;
    content.news_schema.image = imageUrl;
    content.news_schema.headline = content.meta_title;
    content.news_schema.description = content.meta_description;
    // Update publisher info from config
    content.news_schema.author.name = publisherName;
    content.news_schema.publisher.name = publisherName;
    content.news_schema.publisher.logo.url = publisherLogoUrl;

    // 4. Prepare Webflow Data
    //    This structure matches what Webflow's API expects.
    const webflowData = {
      isArchived: false,
      isDraft: false,
      fieldData: {
        name: content.name,
        slug: content.slug,
        [fieldSlugs.META_TITLE]: content.meta_title,
        [fieldSlugs.META_DESCRIPTION]: content.meta_description,
        [fieldSlugs.MAIN_IMAGE]: {
          url: imageUrl,
          alt: content.image_alt_text,
        },
        [fieldSlugs.POST_BODY]: content.post_body_html,
        [fieldSlugs.SCHEMA]: JSON.stringify(content.news_schema, null, 2),
      },
    };

    // 5. Make the secure call to Webflow API
    const WEBFLOW_API_URL = `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/live`;

    const webflowResponse = await fetch(WEBFLOW_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WEBFLOW_API_KEY}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(webflowData),
    });

    const responseData = await webflowResponse.json();

    if (!webflowResponse.ok) {
      // If Webflow gives an error, log it and send it to the frontend
      console.error("Webflow API Error:", responseData);
      return res.status(webflowResponse.status).json({
        error: `Webflow API Error: ${
          responseData.message || responseData.msg || "Unknown error"
        }`,
      });
    }

    // 6. Send success response back to frontend
    return res.status(200).json(responseData);
  } catch (error) {
    // Catch any other server errors
    console.error("Internal Server Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
